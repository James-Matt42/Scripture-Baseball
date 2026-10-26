/** Standard QR Structured Append (ISO/IEC 18004): 2–16 linked symbols.
 * Per-symbol matrices are encoded by the SAME standard encoder as single QR.
 * Scanner support is limited; this produces genuine SA mode headers rather
 * than independently numbered QR codes. No networking and no hidden storage.
 */
import {encodeQR} from './encoder.js';
import {unicodeKanjiCode,unicodeHanziCode} from './charset-data.js';
import {fail} from './errors.js';
function bytesOf(input,charset){
  if(input instanceof Uint8Array)return [...input];
  if(input instanceof ArrayBuffer)return [...new Uint8Array(input)];
  if(typeof input!=='string')fail('INVALID_INPUT','Structured Append expects a string or bytes');
  if(charset==='utf-8')return [...new TextEncoder().encode(input)];
  const bytes=[];
  for(const c of input){const u=c.codePointAt(0);
    if(charset==='iso-8859-1'){if(u>255)fail('CHARSET_UNREPRESENTABLE','Text is not representable in Latin-1');bytes.push(u);continue;}
    if(u<128){bytes.push(u);continue;}
    if(charset==='shift-jis'&&u>=0xff61&&u<=0xff9f){bytes.push(0xa1+u-0xff61);continue;}
    const code=charset==='shift-jis'?unicodeKanjiCode(c):charset==='gb2312'?unicodeHanziCode(c):null;
    if(code==null)fail('CHARSET_UNREPRESENTABLE',`Character ${c} is not representable in ${charset}`);
    bytes.push(code>>>8,code&255);
  }
  return bytes;
}
function balancedChunks(input,count,charset){
  if(input instanceof ArrayBuffer)input=new Uint8Array(input);
  const units=typeof input==='string'?Array.from(input):[...input];
  if(units.length<count)fail('INVALID_OPTION','Structured Append requires at least one character or byte in each symbol');
  const lengths=units.map(v=>typeof v==='number'?1:bytesOf(v,charset).length);
  const total=lengths.reduce((a,b)=>a+b,0),parts=[];
  let start=0,consumed=0;
  for(let k=0;k<count-1;k++){
    const target=(k+1)*total/count;
    let position=start;
    while(position<units.length-(count-k-1) && (consumed<target||position===start)){
      consumed+=lengths[position++];
    }
    parts.push(typeof input==='string'?units.slice(start,position).join(''):Uint8Array.from(units.slice(start,position)));
    start=position;
  }
  parts.push(typeof input==='string'?units.slice(start).join(''):Uint8Array.from(units.slice(start)));
  return parts;
}
/**
 * @param {string|Uint8Array|ArrayBuffer} input
 * @param {{symbolCount?:number|'auto',errorCorrection?:string,version?:number|'auto',maxVersion?:number,charset?:string,eci?:number|'none'|'auto'}} opts
 * @returns {{symbols:readonly QRCodeResult[],metadata:{count:number,parity:number,structuredAppend:boolean},warnings:readonly object[]}}
 */
export function encodeStructuredAppend(input,{symbolCount='auto',kind='standard',...options}={}){
  if(kind!=='standard')fail('UNSUPPORTED_QR_TYPE','Structured Append requires Standard QR Model 2');
  if(typeof input!=='string'&&!(input instanceof Uint8Array)&&!(input instanceof ArrayBuffer))fail('INVALID_INPUT','Structured Append takes text or bytes');
  if(symbolCount!=='auto'&&(!Number.isInteger(symbolCount)||symbolCount<2||symbolCount>16))
    fail('INVALID_OPTION','symbolCount must be auto or an integer from 2 to 16');
  const charset=options.charset??'utf-8',allBytes=bytesOf(input,charset);
  if(!allBytes.length)fail('INVALID_INPUT','Structured Append needs nonempty content');
  const parity=allBytes.reduce((a,b)=>a^b,0);
  if(symbolCount==='auto'){
    try{
      const single=encodeQR(input,options);
      return Object.freeze({symbols:Object.freeze([single]),records:Object.freeze([{data:input,filename:'qr-sequence-01',kind:'standard',encoding:{...options,mode:'auto'}}]),metadata:Object.freeze({count:1,parity,structuredAppend:false}),warnings:Object.freeze([])});
    }catch(error){if(error.code!=='DATA_TOO_LONG')throw error;}
  }
  const totalUnits=typeof input==='string'?Array.from(input).length:allBytes.length;
  const first=symbolCount==='auto'?2:symbolCount,last=symbolCount==='auto'?Math.min(16,totalUnits):symbolCount;
  for(let total=first;total<=last;total++){
    const chunks=balancedChunks(input,total,charset),symbols=[];
    try{
      for(let index=0;index<total;index++){
        const chunk=chunks[index];
        const data=typeof chunk==='string'?{mode:'byte',text:chunk}:{mode:'byte',bytes:chunk};
        symbols.push(encodeQR([{mode:'structured-append',index,total,parity},data],options));
      }
      return Object.freeze({symbols:Object.freeze(symbols),records:Object.freeze(chunks.map((chunk,index)=>({
        data:[{mode:'structured-append',index,total,parity},typeof chunk==='string'?{mode:'byte',text:chunk}:{mode:'byte',bytes:chunk}],
        filename:`qr-sequence-${String(index+1).padStart(2,'0')}`,kind:'standard',encoding:{...options,mode:'auto'}
      }))),metadata:Object.freeze({count:total,parity,structuredAppend:true}),
        warnings:Object.freeze([{code:'STRUCTURED_APPEND_SCANNER_SUPPORT',severity:'warning',message:'Only scanners with Structured Append support can reassemble these linked symbols.'}])});
    }catch(error){if(error.code!=='DATA_TOO_LONG')throw error;if(symbolCount!=='auto')throw error;}
  }
  fail('DATA_TOO_LONG','Payload exceeds Structured Append limits (16 Standard QR symbols at the requested correction/version)');
}
