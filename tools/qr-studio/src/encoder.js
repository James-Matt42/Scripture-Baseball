import { qrcodegen } from '../vendor/nayuki-qrcodegen.js';
import {unicodeKanjiCode,unicodeHanziCode} from './charset-data.js';
import {planOptimizedSegments} from './segment-optimizer.js';
import { createRoleMap, ROLES, ROLE_NAMES } from './roles.js';
import { QREngineError, fail } from './errors.js';

const { QrCode, QrSegment } = qrcodegen;
// Additional ISO/IEC 18004 QR modes using Nayuki's public Segment class.
// Hanzi's four-bit subset indicator belongs to segment payload bits; Structured
// Append carries index, total-1, and XOR parity (4+4+8 bits, zero count bits).
QrSegment.Mode.HANZI ??= new QrSegment.Mode(0xD,[8,10,12]);
QrSegment.Mode.STRUCTURED_APPEND ??= new QrSegment.Mode(0x3,[0,0,0]);
const ECC = Object.freeze({ L: QrCode.Ecc.LOW, M: QrCode.Ecc.MEDIUM,
  Q: QrCode.Ecc.QUARTILE, H: QrCode.Ecc.HIGH });
const ECC_BY_ORDINAL = Object.freeze(['L', 'M', 'Q', 'H']);
export const DEFAULT_ENCODING = Object.freeze({
  errorCorrection: 'M', minVersion: 1, maxVersion: 40,
  version: 'auto', mask: 'auto', boostErrorCorrection: false,
  mode: 'auto', charset: 'utf-8', eci: 'none', optimizeSegments: false, enableHanzi: false,
});

function integerInRange(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail('INVALID_OPTION', `${name} must be an integer from ${min} to ${max}`, { name, value });
  }
  return value;
}

function normalizeEncodingOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_OPTION', 'Encoding options must be an object');
  for (const key of Object.keys(options)) {
    if (!Object.hasOwn(DEFAULT_ENCODING, key)) fail('INVALID_OPTION', `Unknown encoding option: ${key}`);
  }
  const opts = { ...DEFAULT_ENCODING, ...options };
  if (!Object.hasOwn(ECC, opts.errorCorrection)) fail('INVALID_OPTION', 'errorCorrection must be L, M, Q, or H');
  if (!['auto', 'numeric', 'alphanumeric', 'byte', 'kanji', 'hanzi'].includes(opts.mode)) fail('UNSUPPORTED_MODE', 'mode must be auto, numeric, alphanumeric, byte, kanji, or hanzi');
  if (!['utf-8', 'iso-8859-1', 'shift-jis', 'gb2312'].includes(opts.charset)) fail('UNSUPPORTED_CHARSET', 'charset must be utf-8, iso-8859-1, shift-jis, or gb2312');
  if(typeof opts.optimizeSegments!=='boolean'||typeof opts.enableHanzi!=='boolean')fail('INVALID_OPTION','Segment optimization and Hanzi flags must be booleans');
  if (opts.eci !== 'none' && opts.eci !== 'auto' && (!Number.isInteger(opts.eci) || opts.eci < 0 || opts.eci >= 1_000_000)) {
    fail('INVALID_OPTION', 'eci must be none, auto, or an assignment number from 0 through 999999');
  }
  if (typeof opts.boostErrorCorrection !== 'boolean') fail('INVALID_OPTION', 'boostErrorCorrection must be a boolean');
  let min = integerInRange(opts.minVersion, 1, 40, 'minVersion');
  let max = integerInRange(opts.maxVersion, 1, 40, 'maxVersion');
  if (opts.version !== 'auto') {
    const version = integerInRange(opts.version, 1, 40, 'version');
    if ((options.minVersion != null && version < min) || (options.maxVersion != null && version > max)) {
      fail('INVALID_OPTION', 'version must fall within minVersion and maxVersion');
    }
    min = max = version;
  }
  if (min > max) fail('INVALID_OPTION', 'minVersion must not exceed maxVersion');
  if (opts.mask !== 'auto') integerInRange(opts.mask, 0, 7, 'mask');
  return Object.freeze({ ...opts, minVersion: min, maxVersion: max });
}

function textToBytes(text, charset) {
  for (const ch of text) if (ch.codePointAt(0) >= 0xD800 && ch.codePointAt(0) <= 0xDFFF) {
    fail('INVALID_INPUT', 'Text contains an unpaired UTF-16 surrogate; please use valid Unicode.');
  }
  if (charset === 'utf-8') return Array.from(new TextEncoder().encode(text));
  const result = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if(charset==='shift-jis'||charset==='gb2312'){
      if(code<128){result.push(code);continue;}
      if(charset==='shift-jis'&&code>=0xff61&&code<=0xff9f){result.push(0xa1+code-0xff61);continue;}
      const mapped=charset==='shift-jis'?unicodeKanjiCode(char):unicodeHanziCode(char);
      if(mapped==null)fail('CHARSET_UNREPRESENTABLE',`Character ${char} is not available in ${charset}`);
      result.push(mapped>>>8,mapped&255);continue;
    }
    if (code > 255) fail('CHARSET_UNREPRESENTABLE', `Character ${char} cannot be encoded as ISO-8859-1`);
    result.push(code);
  }
  return result;
}

function isBytes(input) {
  return input instanceof Uint8Array || input instanceof ArrayBuffer;
}

function normalizeByteArray(value) {
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value) && value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return value.slice();
  fail('INVALID_INPUT', 'Byte mode requires a Uint8Array, ArrayBuffer, or an array of bytes (0–255)');
}

/** Encode Shift-JIS double-byte code units in the QR Kanji mode. Browser text encoders
 * do not natively support producing Shift-JIS bytes; callers must supply code units.
 * Example: { mode: 'kanji', codes: [0x8abf, 0x8e9a] }.
 */
function makeKanji(codes) {
  if (!Array.isArray(codes) || !codes.length) fail('INVALID_SEGMENT', 'Kanji segments need a nonempty codes array');
  const bits = [];
  for (const code of codes) {
    if (!Number.isInteger(code)) fail('INVALID_SEGMENT', 'Kanji code units must be integers');
    const offset = code >= 0x8140 && code <= 0x9ffc ? 0x8140
      : code >= 0xe040 && code <= 0xebbf ? 0xc140 : null;
    if (offset === null) fail('INVALID_SEGMENT', `Shift-JIS code unit 0x${code.toString(16)} is not valid for QR Kanji mode`);
    const value = code - offset;
    const packed = ((value >>> 8) * 0xc0) + (value & 0xff);
    for (let bit = 12; bit >= 0; bit--) bits.push((packed >>> bit) & 1);
  }
  return new QrSegment(QrSegment.Mode.KANJI, codes.length, bits);
}

function makeHanzi(codes){
  if(!Array.isArray(codes)||!codes.length)fail('INVALID_SEGMENT','Hanzi needs one or more GB2312 double-byte codes');
  const bits=[0,0,0,1]; // GB2312 subset indicator
  for(const code of codes){
    if(!Number.isInteger(code))fail('INVALID_SEGMENT','Invalid Hanzi code unit');
    const diff=code>=0xa1a1&&code<=0xaafe?code-0xa1a1:
      code>=0xb0a1&&code<=0xfafe?code-0xa6a1:null;
    if(diff==null)fail('INVALID_SEGMENT',`Invalid Hanzi code unit: 0x${code.toString(16)}`);
    const packed=((diff>>>8)*0x60)+(diff&255);
    for(let i=12;i>=0;i--)bits.push((packed>>>i)&1);
  }
  return new QrSegment(QrSegment.Mode.HANZI,codes.length,bits);
}
function unicodeCodes(text,lookup,name){
  if(typeof text!=='string'||!text)fail('INVALID_SEGMENT',`${name} mode requires nonempty text`);
  return Array.from(text,c=>{const code=lookup(c);if(code==null)fail('CHARSET_UNREPRESENTABLE',`Character ${c} cannot be represented in ${name}`);return code;});
}
function makeStructuredAppend(info){
  if(!Number.isInteger(info.index)||info.index<0||info.index>15||!Number.isInteger(info.total)||info.total<2||info.total>16||info.index>=info.total||!Number.isInteger(info.parity)||info.parity<0||info.parity>255)
    fail('INVALID_SEGMENT','Structured Append needs index 0..total-1, total 2..16, and XOR parity 0..255');
  const bits=[];const put=(v,len)=>{for(let i=len-1;i>=0;i--)bits.push((v>>>i)&1);};
  put(info.index,4);put(info.total-1,4);put(info.parity,8);
  return new QrSegment(QrSegment.Mode.STRUCTURED_APPEND,0,bits);
}
function manualSegment(def, charset) {
  if (!def || typeof def !== 'object') fail('INVALID_SEGMENT', 'Each segment must be an object');
  switch (def.mode) {
    case 'numeric':
      if (typeof def.text !== 'string') fail('INVALID_SEGMENT', 'Numeric segment needs text');
      if (!QrSegment.isNumeric(def.text)) fail('INVALID_SEGMENT', 'Numeric segments accept digits 0–9 only');
      return QrSegment.makeNumeric(def.text);
    case 'alphanumeric':
      if (typeof def.text !== 'string') fail('INVALID_SEGMENT', 'Alphanumeric segment needs text');
      if (!QrSegment.isAlphanumeric(def.text)) fail('INVALID_SEGMENT', 'Alphanumeric segments accept uppercase A–Z, 0–9, and QR punctuation only');
      return QrSegment.makeAlphanumeric(def.text);
    case 'byte':
      if (def.bytes !== undefined) return QrSegment.makeBytes(normalizeByteArray(def.bytes));
      if (typeof def.text !== 'string') fail('INVALID_SEGMENT', 'Byte segment needs text or bytes');
      return QrSegment.makeBytes(textToBytes(def.text, charset));
    case 'eci':
      integerInRange(def.assignment, 0, 999_999, 'ECI assignment');
      return QrSegment.makeEci(def.assignment);
    case 'kanji': return makeKanji(def.text!==undefined?unicodeCodes(def.text,unicodeKanjiCode,'Kanji'):def.codes);
    case 'hanzi': return makeHanzi(def.text!==undefined?unicodeCodes(def.text,unicodeHanziCode,'Hanzi'):def.codes);
    case 'structured-append': return makeStructuredAppend(def);
    default: fail('UNSUPPORTED_MODE', 'Unknown segment mode: numeric, alphanumeric, byte, eci, kanji, hanzi, structured-append are supported');
  }
}

function buildSegments(input, options) {
  const warnings = [];
  if (Array.isArray(input)) {
    if (options.mode !== 'auto') fail('INVALID_OPTION', 'mode must be auto when supplying explicit segments');
    const segments = input.map(item => manualSegment(item, options.charset));
    const structured=segments.map((s,i)=>s.mode===QrSegment.Mode.STRUCTURED_APPEND?i:-1).filter(i=>i>=0);
    if(structured.length&&(structured.length!==1||structured[0]!==0))fail('INVALID_SEGMENT','Structured Append must appear once as the first segment');
    if (options.eci !== 'none') {
      if (segments.some(s => s.mode === QrSegment.Mode.ECI)) fail('INVALID_OPTION', 'Set eci to none when adding explicit ECI segments');
      if (options.eci === 'auto' && options.charset === 'utf-8'
          && input.some(item => item.mode === 'byte' && typeof item.text === 'string' && /[^\x00-\x7f]/.test(item.text))) {
        segments.splice(structured.length?1:0,0,QrSegment.makeEci(26));
      } else if(typeof options.eci==='auto'&&['shift-jis','gb2312'].includes(options.charset) && segments.some(s=>s.mode===QrSegment.Mode.BYTE)){
        segments.splice(structured.length?1:0,0,QrSegment.makeEci(options.charset==='shift-jis'?20:29));
      } else if (typeof options.eci === 'number') segments.splice(structured.length?1:0,0,QrSegment.makeEci(options.eci));
    }
    if(segments.some(s=>s.mode===QrSegment.Mode.HANZI))warnings.push({code:'HANZI_LIMITED_SUPPORT',severity:'warning',message:'Hanzi QR mode has limited compatibility in common phone scanners.'});
    if(structured.length)warnings.push({code:'STRUCTURED_APPEND_LIMITED_SUPPORT',severity:'warning',message:'Structured Append requires a scanner that supports assembling linked symbols.'});
    return { segments, warnings, sourceLength: input.length, hasBinary: true };
  }
  const bytesInput = isBytes(input);
  if (typeof input !== 'string' && !bytesInput) fail('INVALID_INPUT', 'Input must be a string, Uint8Array, ArrayBuffer, or explicit segment array');
  const payload = bytesInput ? normalizeByteArray(input) : input;
  if (typeof payload === 'string') {
    for (const ch of payload) if (ch.codePointAt(0) >= 0xD800 && ch.codePointAt(0) <= 0xDFFF) {
      fail('INVALID_INPUT', 'Text contains an unpaired UTF-16 surrogate; please use valid Unicode.');
    }
  }
  if (payload.length > 100_000) fail('DATA_TOO_LONG', 'Input is too large to be a standard QR code (max 100,000 units accepted by this API)');
  if (!payload.length) warnings.push({ code: 'EMPTY_CONTENT', severity: 'warning', message: 'The QR symbol represents an empty payload.' });
  if (bytesInput && options.mode !== 'auto' && options.mode !== 'byte') fail('INVALID_OPTION', 'Binary input can only use byte or auto mode');
  let segments;
  if (bytesInput || options.mode === 'byte') segments = [QrSegment.makeBytes(bytesInput ? payload : textToBytes(payload, options.charset))];
  else if (options.mode === 'numeric') {
    if (!QrSegment.isNumeric(payload)) fail('INVALID_INPUT', 'Numeric mode only accepts digits 0–9');
    segments = payload ? [QrSegment.makeNumeric(payload)] : [];
  } else if (options.mode === 'alphanumeric') {
    if (!QrSegment.isAlphanumeric(payload)) fail('INVALID_INPUT', 'Alphanumeric mode only accepts uppercase A–Z, digits, spaces, and QR punctuation');
    segments = payload ? [QrSegment.makeAlphanumeric(payload)] : [];
  } else if(options.mode==='kanji')segments=payload?[makeKanji(unicodeCodes(payload,unicodeKanjiCode,'Kanji'))]:[];
  else if(options.mode==='hanzi')segments=payload?[makeHanzi(unicodeCodes(payload,unicodeHanziCode,'Hanzi'))]:[];
  else if(options.optimizeSegments&&typeof payload==='string'){
    const plan=planOptimizedSegments(payload,{charset:options.charset,version:options.minVersion,enableHanzi:options.enableHanzi});
    segments=plan===null?QrSegment.makeSegments(payload):plan.map(seg=>manualSegment(seg,options.charset));
  } else if (options.charset !== 'utf-8' && !bytesInput && !QrSegment.isNumeric(payload) && !QrSegment.isAlphanumeric(payload)) {
    segments = [QrSegment.makeBytes(textToBytes(payload, options.charset))];
  } else segments = QrSegment.makeSegments(payload);
  const hasByteSegment = segments.some(seg => seg.mode === QrSegment.Mode.BYTE);
  if (typeof options.eci === 'number') segments.unshift(QrSegment.makeEci(options.eci));
  else if(options.eci==='auto'&&hasByteSegment){
    const eci={'utf-8':26,'shift-jis':20,'gb2312':29}[options.charset];
    if(eci!=null&&(!bytesInput&&/[^\x00-\x7f]/.test(payload)))segments.unshift(QrSegment.makeEci(eci));
  }
  if(segments.some(seg=>seg.mode===QrSegment.Mode.HANZI))warnings.push({code:'HANZI_LIMITED_SUPPORT',severity:'warning',message:'Hanzi mode is not supported by every scanner.'});
  return { segments, warnings, sourceLength: payload.length, hasBinary: bytesInput };
}

/**
 * Encodes standard QR Model 2 symbols (versions 1–40). This is a pure operation:
 * no DOM, network, Canvas, storage, or third-party runtime services are involved.
 * @param {string|Uint8Array|ArrayBuffer|Array<object>} input
 * @param {object} [options] See DEFAULT_ENCODING.
 */
export function encodeQR(input, options = {}) {
  const opts = normalizeEncodingOptions(options);
  let { segments, warnings, sourceLength, hasBinary } = buildSegments(input, opts);
  let code;
  try {
    code = QrCode.encodeSegments(segments, ECC[opts.errorCorrection], opts.minVersion,
      opts.maxVersion, opts.mask === 'auto' ? -1 : opts.mask, opts.boostErrorCorrection);
    // A segment plan computed with the character-count widths of v1-v9
    // may not be optimal for a larger version group. Recompute at most once.
    if(opts.optimizeSegments && !Array.isArray(input) && typeof input==='string' &&
       opts.mode==='auto' &&
       (code.version<10?0:code.version<27?1:2)!==(opts.minVersion<10?0:opts.minVersion<27?1:2)){
      const plan=planOptimizedSegments(input,{charset:opts.charset,version:code.version,enableHanzi:opts.enableHanzi});
      if(plan!==null){
        segments=plan.map(seg=>manualSegment(seg,opts.charset));
        if(typeof opts.eci==='number')segments.unshift(QrSegment.makeEci(opts.eci));
        else if(opts.eci==='auto'&&segments.some(s=>s.mode===QrSegment.Mode.BYTE)&&/[^\x00-\x7f]/.test(input)){
          const value={'utf-8':26,'shift-jis':20,'gb2312':29}[opts.charset];if(value!=null)segments.unshift(QrSegment.makeEci(value));
        }
        code=QrCode.encodeSegments(segments,ECC[opts.errorCorrection],opts.minVersion,opts.maxVersion,opts.mask==='auto'?-1:opts.mask,opts.boostErrorCorrection);
      }
    }
  } catch (error) {
    if (error instanceof RangeError && /Data too long/.test(error.message)) {
      fail('DATA_TOO_LONG', `Input exceeds the available capacity at error correction ${opts.errorCorrection} and versions ${opts.minVersion}–${opts.maxVersion}`,
        { errorCorrection: opts.errorCorrection, minVersion: opts.minVersion, maxVersion: opts.maxVersion });
    }
    throw error;
  }
  const size = code.size;
  const cells = new Uint8Array(size * size);
  const roles = createRoleMap(code.version);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) cells[y * size + x] = code.getModule(x, y) ? 1 : 0;
  }
  const actualErrorCorrection = ECC_BY_ORDINAL[code.errorCorrectionLevel.ordinal];
  const metadata = Object.freeze({
    kind: 'QR Model 2', version: code.version, size, width: size, height: size, mask: code.mask,
    requestedErrorCorrection: opts.errorCorrection,
    errorCorrection: actualErrorCorrection,
    dataBits: QrSegment.getTotalBits(segments, code.version),
    segmentCount: segments.length,
    segmentModes: Object.freeze(segments.map(seg => {
      const e = Object.entries(QrSegment.Mode).find(([, m]) => m === seg.mode);
      return e ? e[0].toLowerCase() : 'unknown';
    })),
    sourceLength, hasBinary,
    ...(segments[0]?.mode===QrSegment.Mode.STRUCTURED_APPEND?{
      structuredAppend:{index:input[0].index,total:input[0].total,parity:input[0].parity}}:{}),
  });
  const matrix = Object.freeze({
    size, width: size, height: size,
    getModule(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) return false;
      return cells[y * size + x] === 1;
    },
    getRole(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) return null;
      return ROLE_NAMES[roles[y * size + x]];
    },
    getRoleId(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) return -1;
      return roles[y * size + x];
    },
    toRows() {
      return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => Boolean(cells[y * size + x])));
    },
    /** Copy to avoid callers accidentally modifying the encoded QR symbol. */
    toUint8Array() { return cells.slice(); },
  });
  return Object.freeze({ matrix, metadata, warnings: Object.freeze(warnings), encoding: opts });
}

export { ROLES, ROLE_NAMES, QREngineError };
