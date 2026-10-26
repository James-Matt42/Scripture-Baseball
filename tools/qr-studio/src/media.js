/** Local-only image layers and shadows. Data URLs are the only accepted image sources.
 * This module has no DOM dependencies and can validate imported/API-supplied designs.
 */
import {fail} from './errors.js';

const IMAGE_RE = /^data:image\/(?:png|jpeg|webp|gif);base64,(?:[a-z\d+/]{4})*(?:[a-z\d+/]{2}==|[a-z\d+/]{3}=)?$/i;
const COLOR_RE = /^#(?:[a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})$/i;
const LAYER_NAMES = Object.freeze(['background','data']);
const SHADOW_NAMES = Object.freeze(['modules','finder','logo']);
export const IMAGE_TARGETS = LAYER_NAMES;
export const SHADOW_TARGETS = SHADOW_NAMES;
function object(value,name){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_STYLE',`${name} must be an object`);
}
function keys(value,valid,name){
  for(const key of Object.keys(value))if(!valid.includes(key))fail('INVALID_STYLE',`Unknown ${name} property: ${key}`);
}
function num(value,min,max,name){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('INVALID_STYLE',`${name} must be ${min}–${max}`);
  return value;
}
export function validateImageDataUrl(dataUrl){
  if(typeof dataUrl!=='string'||dataUrl.length>16_000_000||!IMAGE_RE.test(dataUrl))
    fail('INVALID_IMAGE','Use a locally embedded PNG, JPEG, WebP, or GIF image (maximum 16 MB as a data URL)');
  return dataUrl;
}
function imageLayer(source,name){
  object(source,name);
  keys(source,['dataUrl','fit','x','y','zoom','aspectRatio','opacity','brightness','contrast','saturation','blur','tint','tintOpacity','rotation','tone','toneStrength','blendMode','posterize'],name);
  const fit=source.fit??'cover';
  if(!['cover','contain'].includes(fit))fail('INVALID_STYLE',`${name}.fit must be cover or contain`);
  const tint=source.tint??'#ffffff';
  if(typeof tint!=='string'||!COLOR_RE.test(tint))fail('INVALID_COLOR',`${name}.tint must be hexadecimal`);
  return Object.freeze({
    dataUrl:validateImageDataUrl(source.dataUrl),fit,
    x:num(source.x??.5,0,1,name+'.x'),y:num(source.y??.5,0,1,name+'.y'),
    zoom:num(source.zoom??1,.5,4,name+'.zoom'),
    aspectRatio:source.aspectRatio==null?null:num(source.aspectRatio,.05,20,name+'.aspectRatio'),
    opacity:num(source.opacity??1,0,1,name+'.opacity'),
    brightness:num(source.brightness??1,.15,2,name+'.brightness'),
    contrast:num(source.contrast??1,.2,3,name+'.contrast'),
    saturation:num(source.saturation??1,0,3,name+'.saturation'),
    blur:num(source.blur??0,0,2,name+'.blur'),
    rotation:num(source.rotation??0,-180,180,name+'.rotation'),
    blendMode:(()=>{const b=source.blendMode??'normal';if(!['normal','multiply','screen','overlay','soft-light','difference'].includes(b))fail('INVALID_STYLE',name+'.blendMode is not supported');return b;})(),
    posterize:num(source.posterize??0,0,12,name+'.posterize'),
    tone:(()=>{const t=source.tone??'none';if(!['none','dark','light'].includes(t))fail('INVALID_STYLE',name+'.tone must be none, dark or light');return t;})(),
    toneStrength:num(source.toneStrength??0,0,1,name+'.toneStrength'),
    tint:tint.toLowerCase(),tintOpacity:num(source.tintOpacity??0,0,1,name+'.tintOpacity')
  });
}
/** Images are separate visual layers over a shared immutable QR matrix. */
export function normalizeImages(images){
  if(images==null)return null;
  object(images,'images');keys(images,LAYER_NAMES,'images');
  return Object.freeze(Object.fromEntries(Object.entries(images).filter(([,x])=>x!=null)
    .map(([target,source])=>[target,imageLayer(source,`images.${target}`)])));
}
function shadow(value,name){
  object(value,name);keys(value,['color','opacity','blur','offsetX','offsetY'],name);
  const color=value.color??'#000000';
  if(typeof color!=='string'||!COLOR_RE.test(color))fail('INVALID_COLOR',`${name}.color must be hexadecimal`);
  return Object.freeze({color:color.toLowerCase(),opacity:num(value.opacity??.45,0,1,name+'.opacity'),
    blur:num(value.blur??.16,0,1.5,name+'.blur'),
    offsetX:num(value.offsetX??.12,-2,2,name+'.offsetX'),
    offsetY:num(value.offsetY??.12,-2,2,name+'.offsetY')});
}
export function normalizeShadows(shadows){
  if(shadows==null)return null;
  object(shadows,'shadows');keys(shadows,SHADOW_NAMES,'shadows');
  return Object.freeze(Object.fromEntries(Object.entries(shadows).filter(([,v])=>v!=null).map(([name,v])=>[name,shadow(v,`shadows.${name}`)])));
}
