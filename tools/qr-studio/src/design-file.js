/** QR Studio design document V4. Deduplicated embedded local raster assets.
 * No remote URLs; no implicit execution; V2/V3 documents remain importable.
 */
import {fail} from './errors.js';
import {validateImageDataUrl} from './media.js';
const paths=[['design','artwork','dataUrl'],['design','artwork','dataSource','dataUrl'],
  ['design','logo','dataUrl'],['design','logo','processedUrl']];
function get(obj,path){for(const key of path){if(obj==null||typeof obj!=='object')return undefined;obj=obj[key];}return obj;}
function set(obj,path,value){for(const key of path.slice(0,-1)){if(obj==null||typeof obj!=='object')return;obj=obj[key];}if(obj&&typeof obj==='object')obj[path.at(-1)]=value;}
export function packDesign(document){
  if(!document||typeof document!=='object'||Array.isArray(document))fail('INVALID_DOCUMENT','Expected a design object');
  const copy=structuredClone(document),assets=Object.create(null),lookup=new Map();
  for(const path of paths){const url=get(copy,path);if(url==null)continue;
    validateImageDataUrl(url);let id=lookup.get(url);
    if(!id){id=`image-${lookup.size+1}`;lookup.set(url,id);assets[id]=url;}
    set(copy,path,`qr-asset:${id}`);
  }
  return {format:'qr-studio-document',version:4,assets,document:copy};
}
export function unpackDesign(payload){
  if(!payload||payload.format!=='qr-studio-document'||![2,3,4].includes(payload.version)||!payload.document)
    fail('INVALID_DOCUMENT','Not a supported QR Studio 2/3/4 design');
  const copy=structuredClone(payload.document);
  if(payload.version!==4)return copy;
  const assets=payload.assets;
  if(!assets||typeof assets!=='object'||Array.isArray(assets))fail('INVALID_DOCUMENT','Invalid image asset registry');
  const entries=Object.entries(assets);
  if(entries.length>8)fail('INVALID_DOCUMENT','Too many image assets');
  let total=0;
  for(const [key,value] of entries){
    if(!/^image-[1-8]$/.test(key))fail('INVALID_DOCUMENT','Invalid image asset key');
    validateImageDataUrl(value);total+=value.length;
  }
  if(total>36_000_000)fail('INVALID_DOCUMENT','Image assets exceed 36MB');
  for(const path of paths){const data=get(copy,path);if(data==null)continue;
    if(typeof data!=='string'||!/^qr-asset:image-[1-8]$/.test(data))fail('INVALID_DOCUMENT','Invalid image asset reference');
    const id=data.slice('qr-asset:'.length);
    if(!Object.hasOwn(assets,id))fail('INVALID_DOCUMENT','Missing embedded image: '+id);
    set(copy,path,assets[id]);
  }
  return copy;
}
