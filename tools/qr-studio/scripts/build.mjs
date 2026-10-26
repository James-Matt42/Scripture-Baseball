/** Zero-dependency local bundle builder. Explicit source order documents dependencies.
 * Produces one standalone ES module (no imports) suitable for GitHub Pages.
 * Do not minify away or strip the upstream Nayuki MIT license header.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const inputs = [
  'vendor/nayuki-qrcodegen.js',
  'src/errors.js',
  'src/roles.js',
  'src/charset-data.js',
  'src/segment-optimizer.js',
  'src/encoder.js',
  'src/micro-qr.js',
  'src/rmqr-versions.js',
  'src/rmqr.js',
  'src/variants.js',
  'src/structured-append.js',
  'src/media.js',
  'src/motion.js',
  'src/aurora-field.js',
  'src/styles.js',
  'src/render-svg.js',
  'src/apng.js',
  'src/export.js',
  'src/print-export.js',
  'src/payloads.js',
  'src/batch.js',
  'src/batch-input.js',
  'src/batch-zip.js',
  'src/raster-layout.js',
  'src/image-tools.js',
  'src/design-file.js',
  'src/qr-self-decoder.js',
];
const publicAPI = ['encodeQR', 'encodeMicroQR', 'encodeRMQR', 'generateQR', 'RMQR_VERSIONS', 'DEFAULT_ENCODING', 'ROLES', 'ROLE_NAMES', 'QREngineError',
  'renderSVG', 'renderAnimatedSVG', 'renderAnimationFrameSVG', 'normalizeMotion', 'MOTION_DEFAULTS', 'MOTION_TYPES', 'AURORA_TYPES', 'AURORA_COLORS', 'AURORA_PALETTES', 'auroraPalette', 'motionCycle', 'motionPhase', 'normalizeImages', 'normalizeShadows', 'validateImageDataUrl', 'IMAGE_TARGETS', 'SHADOW_TARGETS', 'normalizeStyle', 'normalizePaint', 'DEFAULT_STYLE', 'PAINT_AREAS', 'analyzeDesign',
  'toAPNGBlob', 'muxAPNG', 'toSVGBlob', 'toCanvas', 'toBlob', 'downloadQR', 'prepareFilename', 'readLogoFile', 'readImageFile', 'removeLightBackground', 'payloads', 'iterateBatch', 'generateBatch', 'parseDelimited', 'mapBatchColumns', 'generateSequence', 'serializeManifest', 'createBatchZip', 'extractPalette', 'extractImagePalette', 'sampleRasterContrast', 'decodeWithBrowser', 'packDesign', 'unpackDesign', 'verifyStandardQRBitmap', 'encodeStructuredAppend', 'renderPrintSVG', 'toPrintBlob', 'planOptimizedSegments'];

const output = ['/* QR Studio Engine standalone ESM — built locally without dependencies. */'];
for (const filename of inputs) {
  let source = await readFile(resolve(root, filename), 'utf8');
  // Intentionally narrow transforms. Bail rather than accidentally creating a broken bundle.
  source = source.replace(/^import\s+[^\n;]+;\s*$/gm, '');
  source = source.replace(/^export\s*\{[^}]+\};?\s*$/gm, '');
  source = source.replace(/^export\s+(?=(?:const|class|function|async\s+function)\b)/gm, '');
  if (/^(?:import\s|export\s)/m.test(source)) throw new Error(`Untransformed module syntax in ${filename}`);
  output.push(`\n/* ==== ${filename} ==== */\n`, source);
}
output.push(`\nexport { ${publicAPI.join(', ')} };\n`);
await mkdir(resolve(root, 'dist'), { recursive: true });
const bundle = output.join('\n');
await writeFile(resolve(root, 'dist/qr-engine.js'), bundle);
// Assemble the same modular UI and engine into a portable file:// document.
// The IIFE isolates encoder internals from the UI's independent state and helpers.
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const css = await readFile(resolve(root, 'ui/studio.css'), 'utf8');
const appSource = await readFile(resolve(root, 'ui/app.js'), 'utf8');
const batchUiSource = await readFile(resolve(root, 'ui/batch-ui.js'), 'utf8');
if (css.includes('</style')) throw new Error('Unexpected style terminator');
if (!html.includes('<link rel="stylesheet" href="./ui/studio.css">')) throw new Error('Missing stylesheet link');
const importRE = /^import\s*\{[\s\S]*?\}\s*from\s*['"]\.\.\/dist\/qr-engine\.js['"];?\s*/;
if (!importRE.test(appSource)) throw new Error('Cannot locate UI engine import');
const app = appSource.replace(importRE, '').replace(/^import\s+\{createBatchController\}\s+from\s+['"]\.\/batch-ui\.js['"];?\s*/m, '');
if(/^(?:import|export)\s/m.test(app))throw new Error('Unresolved UI imports');
const batchUi = batchUiSource.replace(/^export\s+(?=function\s+createBatchController)/m, '');
const scriptBody = bundle.replace(/\nexport \{[^}]+\};\s*$/, '');
if (scriptBody.includes('</script>') || app.includes('</script>')) throw new Error('Unsafe embedded script');
const engineWrapper = `const { ${publicAPI.join(', ')} } = (() => {\n${scriptBody}\nreturn { ${publicAPI.join(', ')} };\n})();\n`;
const standalone = html
  .replace('<link rel="stylesheet" href="./ui/studio.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./ui/app.js"></script>', () => `<script type="module">\n${engineWrapper}\n${batchUi}\n${app}\n</script>`);
if (standalone === html || standalone.includes('src="./ui/app.js"')) throw new Error('Failed to inline UI');
await writeFile(resolve(root, 'standalone.html'), standalone);
console.log(`Built standalone.html (${Buffer.byteLength(standalone)} bytes; offline single file)`);
console.log(`Built dist/qr-engine.js (${Buffer.byteLength(bundle)} bytes; ${inputs.length} sources)`);
