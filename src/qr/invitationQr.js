/**
 * Lightweight runtime QR drawing for dynamic room URLs.
 *
 * Uses only the MIT-licensed Standard QR encoding kernel from the QR Studio
 * source tree. The full Studio editor, motion renderer, color tools, and
 * exporter are development-only and intentionally not imported here.
 */
import { qrcodegen } from '../../tools/qr-studio/vendor/nayuki-qrcodegen.js';
import { DEFAULT_INVITATION_QR_PRESET, INVITATION_QR_PRESETS } from './presets.generated.js';

export { DEFAULT_INVITATION_QR_PRESET, INVITATION_QR_PRESETS };

const LEVELS = {
  L: qrcodegen.QrCode.Ecc.LOW,
  M: qrcodegen.QrCode.Ecc.MEDIUM,
  Q: qrcodegen.QrCode.Ecc.QUARTILE,
  H: qrcodegen.QrCode.Ecc.HIGH,
};

function isFinderModule(x, y, size) {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
}

function isFinderCenter(x, y, size) {
  const positions = [[0, 0], [size - 7, 0], [0, size - 7]];
  return positions.some(([left, top]) => x >= left + 2 && x <= left + 4 && y >= top + 2 && y <= top + 4);
}

/** Returns scanner-safe module paths, not arbitrary or imported SVG strings. */
export function getInvitationQrDrawing(url, presetId = DEFAULT_INVITATION_QR_PRESET) {
  if (typeof url !== 'string' || url.length > 2048) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.host || parsed.username || parsed.password) return null;

  const preset = INVITATION_QR_PRESETS.find((candidate) => candidate.id === presetId)
    ?? INVITATION_QR_PRESETS.find((candidate) => candidate.id === DEFAULT_INVITATION_QR_PRESET);
  if (!preset) return null;
  let code;
  try { code = qrcodegen.QrCode.encodeText(url, LEVELS[preset.errorCorrection]); }
  catch { return null; }

  const paths = { data: [], finder: [], finderCenter: [] };
  const quiet = preset.quietZone;
  for (let y = 0; y < code.size; y += 1) {
    for (let x = 0; x < code.size; x += 1) {
      if (!code.getModule(x, y)) continue;
      const role = isFinderCenter(x, y, code.size) ? 'finderCenter'
        : isFinderModule(x, y, code.size) ? 'finder' : 'data';
      paths[role].push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  const width = code.size + quiet * 2;
  return {
    preset,
    width,
    // One continuous path per color group means we send just a few SVG nodes
    // to the book iframe, even with a long invitation URL.
    paths: Object.fromEntries(Object.entries(paths).map(([name, parts]) => [name, parts.join('')])),
  };
}
