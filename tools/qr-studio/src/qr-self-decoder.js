import {rasterModuleCenter} from './raster-layout.js';
/** Grid-aware STANDARD QR raster payload verifier (not a general barcode scanner).
 * Uses the known version/mask/orientation/quiet zone from our generated QR, but
 * reconstructs codewords from exported pixels, verifies Reed-Solomon parity and
 * parses the QR data segments independently of the input payload.
 * Cannot locate, rotate, correct RS symbol errors, or handle Micro/rMQR.
 */
import {qrcodegen} from '../vendor/nayuki-qrcodegen.js';
import {ROLES} from './roles.js';
import {fail} from './errors.js';
const VerifierQrCode=qrcodegen.QrCode;
const SELF_ALPHABET='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const selfClamp=(v,min,max)=>Math.max(min,Math.min(max,v));
/** Build independent interpretations of the actual pixel colors. A color gradient on
 * a dark surface may be *inverted* and also have widely varying luminance; a
 * single grayscale Otsu threshold then gives misleading parity errors.
 * The chroma interpretation compares pixels to the quiet-zone surface (if present),
 * not to the original QR matrix. Valid Reed-Solomon parity is required afterward.
 */
function classifyCandidates(image,qr,quiet,matte,frame,motion){
  const width=image.width,height=image.height,source=image.data,n=qr.matrix.width,
    center=rasterModuleCenter(qr,image,quiet,frame,motion),mat=[1,3,5].map(i=>parseInt(matte.slice(i,i+2),16));
  const colorAt=(x,y)=>{
    const px=selfClamp(Math.floor(x),0,width-1),py=selfClamp(Math.floor(y),0,height-1),i=(py*width+px)*4;
    const alpha=source[i+3]/255;
    return mat.map((bg,k)=>source[i+k]*alpha+bg*(1-alpha));
  };
  const rgb=Array.from({length:n*n},(_,i)=>{const {x,y}=center(i%n,Math.floor(i/n));return colorAt(x,y);});
  const luma=rgb.map(c=>.2126*c[0]+.7152*c[1]+.0722*c[2]),hist=new Uint32Array(256);
  for(const v of luma)hist[selfClamp(Math.round(v),0,255)]++;
  let total=0,sum=0;for(let i=0;i<256;i++){total+=hist[i];sum+=i*hist[i];}
  let below=0,sumBelow=0,best=-1,threshold=127;
  for(let i=0;i<256;i++){
    below+=hist[i];sumBelow+=i*hist[i];if(!below||below===total)continue;
    const variance=(sumBelow/below-(sum-sumBelow)/(total-below))**2*below*(total-below);
    if(variance>best){best=variance;threshold=i;}
  }
  const result=[
    {method:'grayscale-dark',threshold,get:(x,y)=>luma[y*n+x]<=threshold},
    {method:'grayscale-inverted',threshold,get:(x,y)=>luma[y*n+x]>threshold}
  ];
  if(quiet>0){
    const a=center(0,0),b=center(1,0),c=center(0,1),d=center(n-1,n-1),
      sx=b.x-a.x,sy=c.y-a.y,edge=(quiet+1)/2;
    // Sample well inside the *quiet zone*, away from the painted QR modules.
    // The four side samples tolerate mild photographic/gradient backgrounds.
    const surface=[colorAt(a.x-edge*sx,a.y),colorAt(a.x,a.y-edge*sy),
      colorAt(d.x+edge*sx,d.y),colorAt(d.x,d.y+edge*sy)];
    const dist=rgb.map(color=>Math.min(...surface.map(bg=>Math.hypot(color[0]-bg[0],color[1]-bg[1],color[2]-bg[2]))));
    for(const cutoff of [18,30,45,65,90,120,160]){
      result.push({method:'color-distance',threshold:cutoff,get:(x,y)=>dist[y*n+x]>cutoff});
    }
  }
  return result;
}

function maskAt(mask,x,y){switch(mask){
  case 0:return (x+y)%2===0;
  case 1:return y%2===0;
  case 2:return x%3===0;
  case 3:return (x+y)%3===0;
  case 4:return (Math.floor(x/3)+Math.floor(y/2))%2===0;
  case 5:return (x*y)%2+(x*y)%3===0;
  case 6:return ((x*y)%2+(x*y)%3)%2===0;
  case 7:return ((x+y)%2+(x*y)%3)%2===0;
  default:fail('INVALID_INPUT','QR mask out of range');
}}
function rawCodewords(qr,get){
  const size=qr.matrix.width,codewordCount=Math.floor(VerifierQrCode.getNumRawDataModules(qr.metadata.version)/8),data=new Uint8Array(codewordCount);
  let bit=0;
  for(let right=size-1;right>=1;right-=2){
    if(right===6)right=5;
    for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){
      const x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;
      if(qr.matrix.getRoleId(x,y)===ROLES.DATA&&bit<data.length*8){
        const isDark=get(x,y)!==maskAt(qr.metadata.mask,x,y);
        if(isDark)data[bit>>3]|=1<<(7-(bit&7));bit++;
      }
    }
  }
  if(bit!==data.length*8)throw Error('QR data grid could not be read');
  return data;
}
function deinterleave(qr,raw){
  const version=qr.metadata.version,ecc=['L','M','Q','H'].indexOf(qr.metadata.errorCorrection);
  if(ecc<0)throw Error('Unknown QR correction level');
  const numBlocks=VerifierQrCode.NUM_ERROR_CORRECTION_BLOCKS[ecc][version],eccLen=VerifierQrCode.ECC_CODEWORDS_PER_BLOCK[ecc][version],
    shortLen=Math.floor(raw.length/numBlocks),numShort=numBlocks-raw.length%numBlocks;
  const blocks=Array.from({length:numBlocks},()=>new Array(shortLen+1).fill(0));
  let i=0;
  for(let col=0;col<=shortLen;col++)for(let b=0;b<numBlocks;b++){
    if(col===shortLen-eccLen&&b<numShort)continue;
    blocks[b][col]=raw[i++];
  }
  if(i!==raw.length)throw Error('Interleaved data has wrong length');
  const divisor=VerifierQrCode.reedSolomonComputeDivisor(eccLen),data=[];
  for(let b=0;b<numBlocks;b++){
    const len=shortLen-eccLen+(b<numShort?0:1),block=blocks[b],payload=block.slice(0,len),parity=block.slice(len+(b<numShort?1:0));
    if(parity.length!==eccLen||VerifierQrCode.reedSolomonComputeRemainder(payload,divisor).some((x,j)=>x!==parity[j]))
      throw Error(`Error-correction parity mismatch in block ${b+1}`);
    data.push(...payload);
  }
  return data;
}
function parsePayload(bytes,version){
  let pos=0,eci=0,result='',bits=bytes.length*8;
  const get=n=>{if(pos+n>bits)throw Error('Truncated QR data segment');let v=0;for(let i=0;i<n;i++){v=(v<<1)|((bytes[pos>>3]>>(7-(pos&7)))&1);pos++;}return v;};
  const decodeByte=arr=>{
    const charset=eci===3?'iso-8859-1':'utf-8';
    try{return new TextDecoder(charset,{fatal:true}).decode(new Uint8Array(arr));}
    catch(e){if(eci===0)return new TextDecoder('iso-8859-1').decode(new Uint8Array(arr));throw e;}
  };
  const wide=version>=27?2:version>=10?1:0,counts={1:[10,12,14],2:[9,11,13],4:[8,16,16],8:[8,10,12]};
  while(pos+4<=bits){
    const mode=get(4);if(mode===0)break;
    if(mode===7){const head=get(1);eci=!head?get(7):get(1)===0?get(14):get(21);continue;}
    if(!Object.hasOwn(counts,mode))throw Error(`Unsupported QR data mode ${mode}`);
    let n=get(counts[mode][wide]);
    if(mode===1){while(n>=3){const value=get(10);if(value>999)throw Error('Invalid numeric data');result+=String(value).padStart(3,'0');n-=3;}
      if(n)result+=String(get(n===2?7:4)).padStart(n,'0');}
    else if(mode===2){while(n>=2){const value=get(11);if(value>=45*45)throw Error('Invalid alphanumeric pair');result+=SELF_ALPHABET[Math.floor(value/45)]+SELF_ALPHABET[value%45];n-=2;}
      if(n)result+=SELF_ALPHABET[get(6)];}
    else if(mode===4){const arr=Array.from({length:n},()=>get(8));result+=decodeByte(arr);}
    else if(mode===8){const arr=[];for(let j=0;j<n;j++){
      const value=get(13),sjis=value+((value<0x1f00)?0x8140:0xc140);arr.push(sjis>>8,sjis&255);
    }result+=new TextDecoder('shift_jis').decode(new Uint8Array(arr));}
  }
  return result;
}
/** The known QR grid is reconstructed from *actual export pixels*, not the original matrix.
 * Parity errors cause failure: this verifier does not apply error correction.
 */
export function verifyStandardQRBitmap(qr,pixels,{quietZone=4,matte='#ffffff',expected,frame=null,motion=null}={}){
  if(qr?.metadata?.kind!=='QR Model 2')return {available:false,matched:null,message:'Grid-aware self-test only supports Standard QR.'};
  if(!pixels?.data||!pixels.width||!pixels.height)fail('INVALID_INPUT','Expected raster ImageData');
  if(!Number.isInteger(quietZone)||quietZone<0||quietZone>32)fail('INVALID_OPTION','quietZone out of range');
  if(!/^#[0-9a-f]{6}$/i.test(matte))fail('INVALID_COLOR','matte must be an opaque 6-digit HEX color');
  const candidates=classifyCandidates(pixels,qr,quietZone,matte,frame,motion);
  let firstValid=null,lastError=null;
  for(const candidate of candidates){
    try{
      const raw=rawCodewords(qr,candidate.get),payload=parsePayload(deinterleave(qr,raw),qr.metadata.version),
        matched=expected===undefined?null:payload===expected;
      const result={available:true,matched,payload,threshold:candidate.threshold,method:candidate.method,parityValid:true,
        message:matched===false?'The raster decoded to a different payload.':
          candidate.method==='grayscale-dark'?'Offline grid-aware verification recovered the exact text and validated parity. This is not a camera scan.':
          candidate.method==='grayscale-inverted'?'Offline grid-aware verification recovered the exact text with reversed luminance polarity and valid parity. Many cameras reject inverted QR designs.':'Offline grid-aware verification recovered the exact text with a color-aware threshold at known module coordinates and validated error-correction parity. This is not a camera scan; test on real devices.'};
      if(matched!==false)return result;
      firstValid??=result;
    }catch(error){lastError=error;}
  }
  if(firstValid)return firstValid;
  return {available:true,matched:false,parityValid:false,method:null,
    message:'No offline pixel interpretation recovered valid QR parity. The artwork may be difficult to scan; try square modules, dark-on-light colors, or a higher-contrast background.'
      +(lastError?.message?` (Last diagnostic: ${lastError.message})`:'')};
}
