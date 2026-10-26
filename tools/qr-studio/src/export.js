import { renderSVG, renderAnimatedSVG, renderAnimationFrameSVG } from './render-svg.js';
import { normalizeStyle } from './styles.js';
import { fail } from './errors.js';
import {toPrintBlob,renderPrintSVG} from './print-export.js';
import {toAPNGBlob} from './apng.js';

const FORMATS = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', 'animated-svg':'image/svg+xml', apng:'image/png', pdf:'application/pdf', eps:'application/postscript' });

export function toSVGBlob(qr, style = {}) {
  return new Blob([renderSVG(qr, style)], { type: 'image/svg+xml;charset=utf-8' });
}

/** Rasterize the pure SVG engine's output using browser APIs. No network I/O. */
export async function toCanvas(qr, style = {}, { frameTime = null } = {}) {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined') {
    fail('BROWSER_REQUIRED', 'toCanvas requires a browser with Canvas and image support');
  }
  const normalized = normalizeStyle(style);
  const svg = frameTime === null ? toSVGBlob(qr, normalized)
    : new Blob([renderAnimationFrameSVG(qr, normalized, frameTime)], {type:'image/svg+xml;charset=utf-8'});
  const objectUrl = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not rasterize generated QR SVG'));
      image.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Number(image.naturalWidth) || normalized.size;
    canvas.height = Number(image.naturalHeight) || normalized.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) fail('CANVAS_UNAVAILABLE', 'Browser does not support the 2D Canvas context');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Export PNG, JPEG, WebP, or SVG as a Blob. All work stays in-browser. */
export async function toBlob(qr, { format = 'png', style = {}, quality = 0.92, jpegMatte = '#ffffff', printOptions={}, animationOptions={} } = {}) {
  if (!Object.hasOwn(FORMATS, format)) fail('UNSUPPORTED_FORMAT', `Format must be: ${Object.keys(FORMATS).join(', ')}`);
  if (format==='pdf'||format==='eps')return toPrintBlob(qr,{format,style,quality,matte:jpegMatte,...printOptions});
  if (format==='svg' && printOptions?.widthMm!=null)return toPrintBlob(qr,{format,style,...printOptions});
  if (format === 'apng') return toAPNGBlob(qr,style,animationOptions);
  if (format === 'animated-svg') return new Blob([renderAnimatedSVG(qr,style)], {type:'image/svg+xml;charset=utf-8'});
  if (format === 'svg') return toSVGBlob(qr, style);
  if (typeof quality !== 'number' || quality < 0 || quality > 1) fail('INVALID_OPTION', 'quality must be between 0 and 1');
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(jpegMatte)) fail('INVALID_COLOR','jpegMatte must be an opaque hexadecimal color');
  const canvas = await toCanvas(qr, style);
  if (format === 'jpeg') {
    const context = canvas.getContext('2d');
    // JPEG has no alpha channel; composite transparent QR onto the explicit matte.
    const pixels = document.createElement('canvas');
    pixels.width = canvas.width;
    pixels.height = canvas.height;
    const pixelContext = pixels.getContext('2d');
    pixelContext.fillStyle = jpegMatte;
    pixelContext.fillRect(0, 0, pixels.width, pixels.height);
    pixelContext.drawImage(canvas, 0, 0);
    return canvasToBlob(pixels, FORMATS[format], quality);
  }
  return canvasToBlob(canvas, FORMATS[format], quality);
}

async function canvasToBlob(canvas, mime, quality) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Canvas export produced no image')), mime, quality);
  });
  if (blob.type !== mime) fail('UNSUPPORTED_FORMAT', `This browser does not support ${mime} output`);
  return blob;
}

/** Safe filename with a local second-resolution default timestamp; extension always matches export. */
export function prepareFilename(filename, format = 'png', date = new Date()) {
  const ext = format === 'jpeg' ? 'jpg' : format==='animated-svg'?'svg':format==='apng'?'png':format;
  if (!Object.hasOwn(FORMATS, format)) fail('UNSUPPORTED_FORMAT', 'Unsupported download format');
  const two = v => String(v).padStart(2,'0');
  const stamp = `${date.getFullYear()}-${two(date.getMonth()+1)}-${two(date.getDate())}_${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`;
  const raw = String(filename??'').trim().replace(/\.(?:apng|png|jpe?g|webp|svg|pdf|eps)$/i,'');
  const base = raw.replace(/[\\/:*?"<>|\x00-\x1f]+/g,'-').replace(/[\.\s]+$/g,'').trim().slice(0,128) || `qr-${stamp}`;
  return `${base}.${ext}`;
}

/** Browser download helper, only invoked on user action in the UI. */
export async function downloadQR(qr, { format = 'png', style = {}, filename = 'qr-code', quality = 0.92, jpegMatte = '#ffffff',printOptions={},animationOptions={} } = {}) {
  if (typeof document === 'undefined') fail('BROWSER_REQUIRED', 'downloadQR requires a browser');
  const safeFilename = prepareFilename(filename, format);
  const blob = await toBlob(qr, { format, style, quality, jpegMatte, printOptions,animationOptions });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = safeFilename;
  a.style.display = 'none';
  document.body.appendChild(a);
  try { a.click(); }
  finally {
    a.remove();
    // Do not revoke synchronously; some browsers need the URL through the download gesture.
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
}

/** Turn a local uploaded file into a data: URL for `logo.dataUrl`.
 * Only embedded raster formats are allowed, not SVG, network URLs, or active content.
 */
export async function readLogoFile(file) {
  if (typeof FileReader === 'undefined') fail('BROWSER_REQUIRED', 'readLogoFile requires a browser');
  if (!file || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    fail('INVALID_IMAGE', 'Choose a PNG, JPEG, WebP, or GIF logo');
  }
  if (file.size > 11_000_000) fail('INVALID_IMAGE', 'Logo file must be 11 MB or smaller');
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read local logo'));
    reader.readAsDataURL(file);
  });
}

/** General-purpose name for the same validated local raster file reader. */
export const readImageFile = readLogoFile;

/** Optional, entirely local approximation for removing a plain white logo background.
 * Keeps the uploaded original unchanged so the UI can restore it with one click.
 * Not semantic segmentation: near-white design details will also be removed.
 */
export async function removeLightBackground(dataUrl, threshold=245) {
  if (typeof document==='undefined'||typeof Image==='undefined') fail('BROWSER_REQUIRED','Image processing needs a browser');
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(dataUrl)) fail('INVALID_IMAGE','Only embedded raster images are supported');
  if(!Number.isInteger(threshold)||threshold<160||threshold>254)fail('INVALID_OPTION','Threshold must be an integer 160–254');
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Could not load logo image'));image.src=dataUrl;});
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  if(canvas.width*canvas.height>25_000_000)fail('INVALID_IMAGE','Logo image dimensions are too large');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),a=pixels.data;
  for(let i=0;i<a.length;i+=4){
    const lowest=Math.min(a[i],a[i+1],a[i+2]);
    if(lowest>=threshold){a[i+3]=0;continue;}
    // Feather within a narrow interval below the threshold for smoother edges.
    if(lowest>=threshold-12)a[i+3]=Math.round(a[i+3]*(threshold-lowest)/12);
  }
  ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
}
