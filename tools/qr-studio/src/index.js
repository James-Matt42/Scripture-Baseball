/** QR Studio Engine public API — local, browser-first, no runtime dependencies. */
export { encodeQR, DEFAULT_ENCODING, ROLES, ROLE_NAMES, QREngineError } from './encoder.js';
export { renderSVG, renderAnimatedSVG, renderAnimationFrameSVG } from './render-svg.js';
export { normalizeMotion, MOTION_TYPES, MOTION_DEFAULTS, AURORA_TYPES, AURORA_COLORS, AURORA_PALETTES, auroraPalette, motionCycle, motionPhase } from './motion.js';
export { encodeMicroQR } from './micro-qr.js';
export { encodeRMQR, RMQR_VERSIONS } from './rmqr.js';
export { generateQR } from './variants.js';
export { normalizeImages, normalizeShadows, validateImageDataUrl, IMAGE_TARGETS, SHADOW_TARGETS } from './media.js';
export { normalizeStyle, normalizePaint, DEFAULT_STYLE, PAINT_AREAS, analyzeDesign } from './styles.js';
export { toSVGBlob, toCanvas, toBlob, downloadQR, prepareFilename, readLogoFile, readImageFile, removeLightBackground } from './export.js';
export { payloads } from './payloads.js';
export { iterateBatch, generateBatch } from './batch.js';
export { parseDelimited, mapBatchColumns, generateSequence, serializeManifest } from './batch-input.js';
export { createBatchZip } from './batch-zip.js';
export { extractPalette, extractImagePalette, sampleRasterContrast, decodeWithBrowser } from './image-tools.js';
export { packDesign, unpackDesign } from './design-file.js';
export { verifyStandardQRBitmap } from './qr-self-decoder.js';

export {encodeStructuredAppend} from './structured-append.js';
export {renderPrintSVG,toPrintBlob} from './print-export.js';
export {planOptimizedSegments} from './segment-optimizer.js';

export {toAPNGBlob,muxAPNG} from './apng.js';
