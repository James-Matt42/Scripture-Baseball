/** Dependency-free APNG muxer. PNG pixels come from the same deterministic SVG
 * renderer as animated SVG, with no CDN, worker download or encoder service.
 * APNG is lossless and retains the alpha channel of QR-ink-only animations.
 */
import {renderAnimationFrameSVG} from './render-svg.js';
import {normalizeStyle} from './styles.js';
import {motionCycle} from './motion.js';
import {fail} from './errors.js';

const apngAscii=s=>new Uint8Array([...s].map(c=>c.charCodeAt(0)));
const apngU32=n=>new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);
const apngU16=n=>new Uint8Array([(n>>>8)&255,n&255]);
const apngRead32=(b,o)=>(b[o]*16777216+(b[o+1]<<16)+(b[o+2]<<8)+b[o+3])>>>0;
const APNG_CRC_TABLE=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function apngCrc(data){let c=0xffffffff;for(const byte of data)c=APNG_CRC_TABLE[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function apngChunk(type,bytes){const name=apngAscii(type),body=new Uint8Array(4+bytes.length);body.set(name);body.set(bytes,4);return [apngU32(bytes.length),body,apngU32(apngCrc(body))];}
function apngParsePng(array){
  const b=new Uint8Array(array),signature=[137,80,78,71,13,10,26,10];
  if(signature.some((v,i)=>b[i]!==v))fail('INVALID_PNG','Frame is not a PNG');
  const idat=[];let ihdr=null,header=[],pos=8;
  while(pos+12<=b.length){
    const length=apngRead32(b,pos),type=String.fromCharCode(...b.subarray(pos+4,pos+8));
    if(length>b.length-pos-12)fail('INVALID_PNG','Truncated PNG frame');
    const data=b.subarray(pos+8,pos+8+length);
    if(type==='IHDR')ihdr=new Uint8Array(data);
    else if(type==='IDAT')idat.push(new Uint8Array(data));
    else if(!['IEND','acTL','fcTL','fdAT'].includes(type)&&type[0]===type[0].toLowerCase())header.push([type,new Uint8Array(data)]);
    if(type==='IEND')break;
    pos+=length+12;
  }
  if(!ihdr||!idat.length)fail('INVALID_PNG','PNG must contain IHDR and IDAT');
  return {ihdr,idat,header};
}
function apngConcat(chunks){const length=chunks.reduce((n,v)=>n+v.byteLength,0),result=new Uint8Array(length);let at=0;for(const c of chunks){result.set(c,at);at+=c.length;}return result;}
/** Pure muxer, exported for tests and independent client APIs. Frames are lossless PNG buffers. */
export function muxAPNG(pngFiles,delays){
  if(!Array.isArray(pngFiles)||pngFiles.length<2||pngFiles.length>160||!Array.isArray(delays)||delays.length!==pngFiles.length)
    fail('INVALID_ANIMATION','APNG needs 2–160 PNG frames and matching delays');
  const frames=pngFiles.map(apngParsePng),ihdr=frames[0].ihdr;
  if(frames.some(f=>f.ihdr.length!==ihdr.length||f.ihdr.some((v,i)=>v!==ihdr[i])))
    fail('INVALID_ANIMATION','APNG frames must have matching dimensions and PNG color format');
  const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),...apngChunk('IHDR',ihdr)];
  for(const [type,bytes] of frames[0].header)chunks.push(...apngChunk(type,bytes));
  chunks.push(...apngChunk('acTL',apngConcat([apngU32(frames.length),apngU32(0)])));
  let seq=0;
  for(let i=0;i<frames.length;i++){
    const ms=Math.round(delays[i]*1000);
    if(!Number.isInteger(ms)||ms<1||ms>65000)fail('INVALID_ANIMATION','Frame delays must be between 1ms and 65s');
    const fc=apngConcat([apngU32(seq++),apngU32(apngRead32(ihdr,0)),apngU32(apngRead32(ihdr,4)),apngU32(0),apngU32(0),apngU16(ms),apngU16(1000),new Uint8Array([0,0])]);
    chunks.push(...apngChunk('fcTL',fc));
    for(const data of frames[i].idat)chunks.push(...apngChunk(i===0?'IDAT':'fdAT',i===0?data:apngConcat([apngU32(seq++),data])));
  }
  chunks.push(...apngChunk('IEND',new Uint8Array()));
  return new Blob(chunks,{type:'image/png'});
}
const apngPaintFrame=async (qr,style,time)=>{
  const svg=new Blob([renderAnimationFrameSVG(qr,style,time)],{type:'image/svg+xml'}),href=URL.createObjectURL(svg);
  try{
    const image=new Image();
    await new Promise((res,rej)=>{image.onload=res;image.onerror=()=>rej(new Error('Unable to rasterize animation frame'));image.src=href;});
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');if(!ctx)fail('CANVAS_UNAVAILABLE','Cannot draw APNG frame');
    ctx.drawImage(image,0,0);
    const blob=await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('Could not encode PNG frame')),'image/png'));
    return blob.arrayBuffer();
  }finally{URL.revokeObjectURL(href);}
};
/** Raster animation API: one frame for the hold, instead of duplicate hold frames.
 * size/fps caps bound memory; yield allows browser UI cancellation and progress.
 */
export async function toAPNGBlob(qr,style={}, {size=512,fps=8,onProgress,signal}={}){
  if(typeof document==='undefined'||typeof Image==='undefined')fail('BROWSER_REQUIRED','APNG encoding requires a browser');
  if(!Number.isInteger(size)||size<192||size>768||![4,6,8,10,12].includes(fps))
    fail('INVALID_ANIMATION','APNG size must be 192–768px and fps 4, 6, 8, 10, or 12');
  const normalized=normalizeStyle({...style,size}),m=normalized.motion;
  if(m.type==='none')fail('INVALID_ANIMATION','Enable an animation before exporting APNG');
  const movingFrames=Math.ceil(m.duration*fps);
  if(movingFrames>120)fail('INVALID_ANIMATION','Too many motion frames. Reduce moving time or frame rate');
  const seconds=1/fps,delays=[],buffers=[];
  const times=Array.from({length:movingFrames},(_,i)=>i*m.duration/movingFrames);
  if(m.hold>0)times.push(m.duration);
  for(let i=0;i<times.length;i++){
    if(signal?.aborted)fail('CANCELLED','Animation export was cancelled');
    buffers.push(await apngPaintFrame(qr,normalized,times[i]));
    delays.push(i===movingFrames?m.hold:m.duration/movingFrames);
    onProgress?.({done:i+1,total:times.length});
    if(i%3===2)await new Promise(r=>setTimeout(r,0));
  }
  return muxAPNG(buffers,delays);
}
