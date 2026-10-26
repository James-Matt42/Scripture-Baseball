import {rasterModuleCenter} from './raster-layout.js';
/** Private, local image processing. Keep scan-oriented analysis separate from QR encoding.
 * Raster contrast sampling is NOT decoding; decoding is only confirmed by a real detector.
 */
import {fail} from './errors.js';
import {validateImageDataUrl} from './media.js';
const clamp=(x,min=0,max=255)=>Math.max(min,Math.min(max,x));
const hex=c=>'#'+c.map(n=>Math.round(clamp(n)).toString(16).padStart(2,'0')).join('');
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
/** Deterministic five-swatch extraction from ImageData. No ML, network, or file upload. */
export function extractPalette(pixels,{count=5}={}){
  if(!pixels?.data||!Number.isInteger(pixels.width)||!Number.isInteger(pixels.height))fail('INVALID_IMAGE','Expected ImageData');
  if(!Number.isInteger(count)||count<1||count>12)fail('INVALID_OPTION','count must be 1–12');
  const colors=new Map(),a=pixels.data,stride=Math.max(1,Math.floor((pixels.width*pixels.height)/12000));
  for(let i=0;i<pixels.width*pixels.height;i+=stride){
    const j=i*4;if(a[j+3]<130)continue;
    const r=a[j]>>4,g=a[j+1]>>4,b=a[j+2]>>4,key=(r<<8)|(g<<4)|b;
    const entry=colors.get(key)??{sum:[0,0,0],weight:0};
    entry.sum[0]+=a[j];entry.sum[1]+=a[j+1];entry.sum[2]+=a[j+2];entry.weight++;
    colors.set(key,entry);
  }
  const candidates=[...colors.values()].map(v=>({rgb:v.sum.map(x=>x/v.weight),count:v.weight})).sort((a,b)=>b.count-a.count);
  const chosen=[];
  for(const c of candidates){if(chosen.every(other=>distance(other,c.rgb)>=65))chosen.push(c.rgb);if(chosen.length>=count)break;}
  for(const c of candidates){if(chosen.length>=count)break;if(chosen.every(other=>distance(other,c.rgb)>=26))chosen.push(c.rgb);}
  return chosen.map(hex);
}
/** Extract a palette from a previously validated local raster data URL. */
export async function extractImagePalette(dataUrl,{count=5}={}){
  validateImageDataUrl(dataUrl);
  if(typeof document==='undefined'||typeof Image==='undefined')fail('BROWSER_REQUIRED','Palette extraction requires a browser');
  const image=new Image();image.decoding='sync';
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Unable to read picture'));image.src=dataUrl;});
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>25_000_000)fail('INVALID_IMAGE','Image dimensions are too large');
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)fail('CANVAS_UNAVAILABLE','Canvas not available');
  ctx.drawImage(image,0,0,96,96);return extractPalette(ctx.getImageData(0,0,96,96),{count});
}
function linear(v){const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}
function luma(r,g,b){return .2126*linear(r)+.7152*linear(g)+.0722*linear(b);}
function percentile(sorted,p){return sorted[Math.max(0,Math.min(sorted.length-1,Math.floor((sorted.length-1)*p)))];}
/** Sample pixels at expected module centers in the *final composited raster*.
 * `matte` represents the eventual surface beneath any transparency.
 * This checks contrast, not content integrity or scanner compatibility.
 */
export function sampleRasterContrast(qr,pixels,{quietZone=4,matte='#ffffff',frame=null,motion=null}={}){
  if(!qr?.matrix||!pixels?.data||!pixels.width||!pixels.height)fail('INVALID_INPUT','QR matrix and ImageData are required');
  if(!Number.isInteger(quietZone)||quietZone<0||quietZone>32)fail('INVALID_OPTION','quietZone must be 0–32');
  if(!/^#[a-f\d]{6}$/i.test(matte))fail('INVALID_COLOR','matte must be six-digit hexadecimal');
  const surface=[1,3,5].map(i=>Number.parseInt(matte.slice(i,i+2),16));
  const w=qr.matrix.width??qr.matrix.size,h=qr.matrix.height??qr.matrix.size, center=rasterModuleCenter(qr,pixels,quietZone,frame,motion),
    dark=[],light=[],dataDark=[],dataLight=[],data=pixels.data;
  const sample=(x,y)=>{
    const j=4*(Math.min(pixels.height-1,Math.max(0,Math.floor(y)))*pixels.width+Math.min(pixels.width-1,Math.max(0,Math.floor(x))));
    const alpha=data[j+3]/255;
    return luma(...surface.map((bg,i)=>data[j+i]*alpha+bg*(1-alpha)));
  };
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const {x:px,y:py}=center(x,y);
    const value=sample(px,py),isDark=qr.matrix.getModule(x,y),isData=qr.matrix.getRole(x,y)==='data';
    (isDark?dark:light).push(value);if(isData)(isDark?dataDark:dataLight).push(value);
  }
  dark.sort((a,b)=>a-b);light.sort((a,b)=>a-b);
  if(!dark.length||!light.length)fail('INVALID_INPUT','QR has insufficient dark/light modules');
  const d95=percentile(dark,.95),l05=percentile(light,.05),gap=l05-d95,signedRatio=(l05+.05)/(d95+.05),
    ratio=Math.max(signedRatio,1/signedRatio),
    darkMedian=percentile(dark,.5),lightMedian=percentile(light,.5),polarity=lightMedian>darkMedian?'normal':'inverted',
    threshold=(darkMedian+lightMedian)/2;
  let matches=0;const total=w*h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const {x:px,y:py}=center(x,y),value=sample(px,py);
    if((polarity==='normal'?value<threshold:value>threshold)===qr.matrix.getModule(x,y))matches++;
  }
  const score=polarity==='normal' && signedRatio>=4 && matches/total>.99?'strong':polarity==='normal' && signedRatio>=2.4&&matches/total>.94?'moderate':'weak';
  return {score,contrastRatio:ratio,polarity,contrastGap:gap,centerMatch:matches/total,dark95:d95,light05:l05,
    examined:total,matte,note:'Visual pixel sampling only; a successful scan is not guaranteed.'};
}
/** Browser-native actual decoding where available; no remote requests. */
export async function decodeWithBrowser(canvas,expected){
  if(typeof BarcodeDetector==='undefined')return {available:false,matched:null,message:'No native decoder in this browser. Contrast sampling is available, but is not a decoding test.'};
  try{
    const supported=await BarcodeDetector.getSupportedFormats?.();
    if(supported&&!supported.includes('qr_code'))return {available:false,matched:null,message:'This browser does not support QR decoding.'};
    const detector=new BarcodeDetector({formats:['qr_code']});
    const results=await detector.detect(canvas);
    return {available:true,matched:results.some(r=>r.rawValue===expected),detected:results.length,
      message:results.some(r=>r.rawValue===expected)?'Exact payload recovered by this browser decoder. Test physical prints too.':
        results.length?'Decoded content did not match the original.':'No QR code was decoded.'};
  }catch(error){return {available:false,matched:null,message:'Browser decoder could not run: '+error.message};}
}
