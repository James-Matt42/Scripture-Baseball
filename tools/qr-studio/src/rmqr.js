/* Rectangular Micro QR generator, following the supplied rmqrcode 0.3.2 MIT reference.
 * See licenses/RMQR-MIT.txt. Standard ISO/IEC 23941, 32 rectangular formats. */
import {qrcodegen} from '../vendor/nayuki-qrcodegen.js';
import {ROLES,ROLE_NAMES} from './roles.js';
import {RMQR_VERSIONS} from './rmqr-versions.js';
import {fail} from './errors.js';
const RMQR_ALNUM='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const rmqrBits=(out,n,count)=>{for(let b=count-1;b>=0;b--)out.push((n>>>b)&1);};
function createSegments(text,mode){
  const isNum=/^[0-9]*$/.test(text),isAlpha=[...text].every(c=>RMQR_ALNUM.includes(c));
  const resolved=mode==='auto'?(isNum?'numeric':isAlpha?'alphanumeric':'byte'):mode;
  if(!['numeric','alphanumeric','byte'].includes(resolved))fail('UNSUPPORTED_MODE','rMQR supports numeric, alphanumeric, and byte text modes');
  if(resolved==='numeric'&&!isNum)fail('INVALID_INPUT','Numeric mode requires digits 0–9');
  if(resolved==='alphanumeric'&&!isAlpha)fail('INVALID_INPUT','Alphanumeric mode requires uppercase QR characters');
  const chars=resolved==='byte'?Array.from(new TextEncoder().encode(text)):[...text];
  const data=[];
  if(resolved==='numeric')for(let i=0;i<chars.length;i+=3){const chunk=chars.slice(i,i+3).join('');rmqrBits(data,Number(chunk),chunk.length===3?10:chunk.length===2?7:4);}
  else if(resolved==='alphanumeric')for(let i=0;i<chars.length;i+=2){const num=RMQR_ALNUM.indexOf(chars[i]);
    if(i+1<chars.length)rmqrBits(data,num*45+RMQR_ALNUM.indexOf(chars[i+1]),11);else rmqrBits(data,num,6);
  }else for(const b of chars)rmqrBits(data,b,8);
  return {mode:resolved,count:chars.length,data};
}
function encodeBits(segment,config,ecc){
  const countLength=config.counts[segment.mode];
  if(segment.count>=2**countLength)return null;
  const out=[];
  rmqrBits(out,{numeric:1,alphanumeric:2,byte:3}[segment.mode],3);
  rmqrBits(out,segment.count,countLength);out.push(...segment.data);
  const used=out.length,limit=config.dataBits[ecc];
  if(used>limit)return null;
  if(out.length+3<=limit)out.push(0,0,0);
  while(out.length%8!==0)out.push(0);
  const bytes=[];
  for(let i=0;i<out.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|out[i+j];bytes.push(b);}
  const blocksInfo=config.blocks[ecc],dataCount=blocksInfo.reduce((a,b)=>a+b.num*b.k,0);
  let padIndex=0;while(bytes.length<dataCount)bytes.push(padIndex++%2===0?0xec:0x11);
  const blocks=[],ecBlocks=[];let pos=0;
  for(const definition of blocksInfo)for(let i=0;i<definition.num;i++){
    const block=bytes.slice(pos,pos+definition.k);pos+=definition.k;
    const nEcc=definition.c-definition.k;
    blocks.push(block);
    ecBlocks.push(qrcodegen.QrCode.reedSolomonComputeRemainder(block,qrcodegen.QrCode.reedSolomonComputeDivisor(nEcc)));
  }
  const interleaved=[];
  for(const group of [blocks,ecBlocks])for(let i=0;i<group.at(-1).length;i++)for(const block of group){
    if(i>=block.length)break;
    interleaved.push(block[i]);
  }
  const codeBits=[];for(const b of interleaved)rmqrBits(codeBits,b,8);
  return {codeBits,used};
}
function drawMatrix(config,ecc,encoded){
  const w=config.width,h=config.height,N=w*h,cells=new Int8Array(N).fill(-1),roles=new Uint8Array(N).fill(ROLES.DATA),idx=(x,y)=>y*w+x;
  const set=(x,y,bit,role)=>{const n=idx(x,y);cells[n]=bit;roles[n]=role;};
  // Main 7x7 finder + 1-module right/bottom separator.
  for(let y=0;y<7;y++)for(let x=0;x<7;x++){
    const radius=Math.max(Math.abs(x-3),Math.abs(y-3));
    set(x,y,radius===3||radius<=1?1:0,radius<=1?ROLES.FINDER_CENTER:ROLES.FINDER);
  }
  for(let y=0;y<Math.min(8,h);y++)set(7,y,0,ROLES.SEPARATOR);
  if(h>=9)for(let x=0;x<8;x++)set(x,7,0,ROLES.SEPARATOR);
  // Five by five sub-finder, lower right.
  for(let i=0;i<5;i++)for(let j=0;j<5;j++){
    const x=w-1-j,y=h-1-i;
    set(x,y,i===0||i===4||j===0||j===4||i===2&&j===2?1:0,i===2&&j===2?ROLES.FINDER_CENTER:ROLES.FINDER);
  }
  // Corner patterns.
  for(let x=0;x<3;x++)set(x,h-1,1,ROLES.FINDER);
  if(h>=11){set(0,h-2,1,ROLES.FINDER);set(1,h-2,0,ROLES.FINDER);}
  set(w-1,0,1,ROLES.FINDER);set(w-2,0,1,ROLES.FINDER);
  set(w-1,1,1,ROLES.FINDER);set(w-2,1,0,ROLES.FINDER);
  const centers={27:[],43:[21],59:[19,39],77:[25,51],99:[23,49,75],139:[27,55,83,111]}[w];
  for(const center of centers)for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    const color=i===0||i===2||j===0||j===2?1:0;
    set(center+j-1,i,color,ROLES.ALIGNMENT);set(center+j-1,h-1-i,color,ROLES.ALIGNMENT);
  }
  for(let x=0;x<w;x++)for(const y of [0,h-1])if(cells[idx(x,y)]===-1)set(x,y,x%2===0?1:0,ROLES.TIMING);
  for(const x of [0,w-1,...centers])for(let y=0;y<h;y++)if(cells[idx(x,y)]===-1)set(x,y,y%2===0?1:0,ROLES.TIMING);
  // BCH format field with its two different position-dependent masks.
  const message=config.indicator|(ecc==='H'?32:0),poly=(1<<12)|(1<<11)|(1<<10)|(1<<9)|(1<<8)|(1<<5)|(1<<2)|1;
  let remainder=message<<12;
  while(remainder>=1<<12){const shift=31-Math.clz32(remainder)-12;remainder^=poly<<shift;}
  const fmt=(message<<12)|remainder;
  const fmtLeft=fmt^0b011111101010110010,fmtRight=fmt^0b100000101001111011;
  for(let n=0;n<18;n++)set(8+Math.floor(n/5),1+n%5,(fmtLeft>>>n)&1,ROLES.FORMAT);
  for(let n=0;n<15;n++)set(w-8+Math.floor(n/5),h-6+n%5,(fmtRight>>>n)&1,ROLES.FORMAT);
  for(let n=15;n<18;n++)set(w-8+(n-15)+3,h-6,(fmtRight>>>n)&1,ROLES.FORMAT);
  // Data region: zigzag two columns from right to left; remainder bits at tail.
  let dx=w-2,dy=-1,y=h-6,bitIndex=0,remainderBits=config.remainder,iteration=0;
  const maskArea=new Uint8Array(N);
  while(bitIndex<encoded.codeBits.length||remainderBits>0){
    for(const x of [dx,dx-1]){
      if(cells[idx(x,y)]!==-1)continue;
      let bit;
      if(bitIndex<encoded.codeBits.length)bit=encoded.codeBits[bitIndex++];
      else {bit=0;remainderBits--;}
      set(x,y,bit,ROLES.DATA);maskArea[idx(x,y)]=1;
      if(bitIndex===encoded.codeBits.length&&remainderBits===0)break;
    }
    if(bitIndex===encoded.codeBits.length&&remainderBits===0)break;
    if(dy<0&&y===1){dx-=2;dy=1;}
    else if(dy>0&&y===h-2){dx-=2;dy=-1;}
    else y+=dy;
    if(++iteration>20000||dx<1)fail('INTERNAL_ERROR','rMQR data placement ran out of space');
  }
  for(let k=0;k<N;k++)if(cells[k]===-1)cells[k]=0;
  // rMQR uses one specified data mask.
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(maskArea[idx(xx,yy)] && (Math.floor(yy/2)+Math.floor(xx/3))%2===0)cells[idx(xx,yy)]^=1;
  return {cells,roles};
}
export function encodeRMQR(input,options={}){
  if(typeof input!=='string')fail('INVALID_INPUT','rMQR input must be text');
  if(input.length>10000)fail('DATA_TOO_LONG','rMQR text is too long');
  for(const ch of input)if(ch.codePointAt(0)>=0xd800&&ch.codePointAt(0)<=0xdfff)fail('INVALID_INPUT','Invalid Unicode surrogate');
  for(const key of Object.keys(options))if(!['version','errorCorrection','mode','fit'].includes(key))fail('INVALID_OPTION',`Unsupported rMQR option: ${key}`);
  const {version='auto',errorCorrection='M',mode='auto',fit='balanced'}=options;
  if(!['M','H'].includes(errorCorrection))fail('INVALID_OPTION','rMQR supports M or H error correction');
  if(!['balanced','min-width','min-height','min-area'].includes(fit))fail('INVALID_OPTION','rMQR fit must be balanced, min-width, min-height, or min-area');
  if(version!=='auto'&&!Object.hasOwn(RMQR_VERSIONS,version))fail('INVALID_OPTION','Unknown rectangular QR version');
  const seg=createSegments(input,mode);
  const fits=[];
  for(const [name,config] of Object.entries(RMQR_VERSIONS)){
    if(version!=='auto'&&version!==name)continue;
    const encoded=encodeBits(seg,config,errorCorrection);
    if(encoded)fits.push({name,config,encoded});
  }
  if(!fits.length)fail('DATA_TOO_LONG','Text does not fit the requested rectangular QR size and error correction.');
  const key=s=>fit==='min-width'?s.config.width:fit==='min-height'?s.config.height:fit==='min-area'?s.config.width*s.config.height:s.config.width+9*s.config.height;
  fits.sort((a,b)=>key(a)-key(b));const selected=fits[0],{config,encoded}=selected,{width,height}=config;
  const {cells,roles}=drawMatrix(config,errorCorrection,encoded);
  const get=(arr,x,y,other)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<height?arr[y*width+x]:other;
  const matrix=Object.freeze({size:width,width,height,getModule:(x,y)=>get(cells,x,y,0)===1,
    getRoleId:(x,y)=>get(roles,x,y,-1),getRole:(x,y)=>ROLE_NAMES[get(roles,x,y,-1)]??null,
    toRows:()=>Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>cells[y*width+x]===1)),
    toUint8Array:()=>Uint8Array.from(cells)});
  return Object.freeze({matrix,metadata:Object.freeze({kind:'rMQR',version:selected.name,width,height,size:width,mask:'Fixed',
    errorCorrection,requestedErrorCorrection:errorCorrection,segmentModes:[seg.mode],segmentCount:1,
    sourceLength:input.length,dataBits:encoded.used}),warnings:Object.freeze([]),encoding:Object.freeze({...options})});
}
export {RMQR_VERSIONS};
