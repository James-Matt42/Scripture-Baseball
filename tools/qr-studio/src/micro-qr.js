/* Micro QR encoder. ISO/IEC 18004 logic cross-checked against Segno 1.6.6.
 * Reference: Segno by Lars Heuer (BSD-3-Clause; see licenses/SEGNO-BSD-3.txt).
 * Reed-Solomon field arithmetic is provided by Nayuki's MIT-licensed encoder. */
import {qrcodegen} from '../vendor/nayuki-qrcodegen.js';
import {ROLES,ROLE_NAMES} from './roles.js';
import {fail} from './errors.js';

const CAP={M1:{none:20},M2:{L:40,M:32},M3:{L:84,M:68},M4:{L:128,M:112,Q:80}};
const ECWORDS={M1:{none:2},M2:{L:5,M:6},M3:{L:6,M:8},M4:{L:8,M:10,Q:14}};
const FORMAT=[
  0x4445,0x4172,0x4e2b,0x4b1c,0x55ae,0x5099,0x5fc0,0x5af7,
  0x6793,0x62a4,0x6dfd,0x68ca,0x7678,0x734f,0x7c16,0x7921,
  0x06de,0x03e9,0x0cb0,0x0987,0x1735,0x1202,0x1d5b,0x186c,
  0x2508,0x203f,0x2f66,0x2a51,0x34e3,0x31d4,0x3e8d,0x3bba];
const ECFORMAT={M1:{none:0},M2:{L:1,M:2},M3:{L:3,M:4},M4:{L:5,M:6,Q:7}};
const CHARBITS={numeric:[0,3,4,5,6],alphanumeric:[0,0,3,4,5],byte:[0,0,0,4,5]};
const ALNUM='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const MASKS=[(y,x)=>y%2===0,(y,x)=>(Math.floor(y/2)+Math.floor(x/3))%2===0,
  (y,x)=>((y*x)%2+(y*x)%3)%2===0,(y,x)=>((y+x)%2+(y*x)%3)%2===0];
const bits=(out,n,len)=>{for(let i=len-1;i>=0;i--)out.push((n>>>i)&1);};
function segment(input,mode,charset){
  const isNum=/^[0-9]*$/.test(input),isAlnum=[...input].every(ch=>ALNUM.includes(ch));
  if(mode==='auto')mode=isNum?'numeric':isAlnum?'alphanumeric':'byte';
  if(mode==='numeric'&&!isNum)fail('INVALID_INPUT','Micro numeric mode requires digits 0–9');
  if(mode==='alphanumeric'&&!isAlnum)fail('INVALID_INPUT','Micro alphanumeric mode requires uppercase ASCII QR characters');
  if(!['numeric','alphanumeric','byte'].includes(mode))fail('UNSUPPORTED_MODE','Micro QR supports numeric, alphanumeric, or byte mode');
  const selectedCharset=charset==='auto'?([...input].every(ch=>ch.codePointAt(0)<=255)?'iso-8859-1':'utf-8'):charset;
  if(mode==='byte'&&selectedCharset==='iso-8859-1'&&[...input].some(ch=>ch.codePointAt(0)>255))
    fail('CHARSET_UNREPRESENTABLE','Text contains characters not representable in ISO-8859-1; choose UTF-8');
  const chars=mode==='byte'?(selectedCharset==='utf-8'?Array.from(new TextEncoder().encode(input)):
    [...input].map(ch=>ch.codePointAt(0))):[...input];
  const data=[];
  if(mode==='numeric'){
    for(let i=0;i<chars.length;i+=3){const part=chars.slice(i,i+3).join('');bits(data,Number(part),part.length===3?10:part.length===2?7:4);}
  }else if(mode==='alphanumeric'){
    for(let i=0;i<chars.length;i+=2){const c=ALNUM.indexOf(chars[i]);if(i+1<chars.length)bits(data,c*45+ALNUM.indexOf(chars[i+1]),11);else bits(data,c,6);}
  }else for(const b of chars)bits(data,b,8);
  return {mode,data,count:chars.length,charset:mode==='byte'?selectedCharset:null};
}
function makePayload(seg,version,ecc){
  const versionNum=Number(version[1]),countBits=CHARBITS[seg.mode][versionNum];
  if(!countBits)fail('UNSUPPORTED_MODE',`${seg.mode} mode is not available for ${version}`);
  if(seg.count>=2**countBits)fail('DATA_TOO_LONG',`Input is too long for ${version}'s ${seg.mode} character-count field`);
  const out=[];
  if(versionNum>1)bits(out,{numeric:0,alphanumeric:1,byte:2}[seg.mode],versionNum-1);
  bits(out,seg.count,countBits);out.push(...seg.data);
  const capacity=CAP[version][ecc];
  if(out.length>capacity)fail('DATA_TOO_LONG',`Text cannot fit Micro QR ${version} at error correction ${ecc}`);
  const used=out.length;
  for(let i=0;i<Math.min(versionNum*2+1,capacity-out.length);i++)out.push(0);
  if(versionNum===1||versionNum===3){while(out.length<capacity)out.push(0);}
  else {
    // Segno/ISO pads to the *next* codeword boundary (8 bits even if already aligned).
    const alignBits=8-(out.length%8);
    for(let i=0;i<alignBits&&out.length<capacity;i++)out.push(0);
    let pad=0;
    while(out.length<capacity)bits(out,pad++%2===0?0xec:0x11,8);
  }
  const bytes=[];for(let i=0;i<out.length;i+=8){let value=0;for(let j=0;j<8;j++)value=(value<<1)|(out[i+j]??0);bytes.push(value);}
  const nEcc=ECWORDS[version][ecc];
  const eccBytes=qrcodegen.QrCode.reedSolomonComputeRemainder(bytes,qrcodegen.QrCode.reedSolomonComputeDivisor(nEcc));
  const full=[];
  if(versionNum===1||versionNum===3){
    for(const byte of bytes.slice(0,-1))bits(full,byte,8);
    bits(full,bytes.at(-1)>>>4,4);
  }else for(const byte of bytes)bits(full,byte,8);
  for(const byte of eccBytes)bits(full,byte,8);
  return {full,used};
}
function construct(version,payload,chosenMask){
  const n=9+2*Number(version[1]),cells=new Uint8Array(n*n).fill(2),roles=new Uint8Array(n*n).fill(ROLES.DATA);
  const at=(x,y)=>y*n+x,set=(x,y,d,role)=>{cells[at(x,y)]=d;roles[at(x,y)]=role;};
  // Reserved format modules: row 8 / column 8, positions 0–8.
  for(let i=0;i<=8;i++){set(8,i,0,ROLES.FORMAT);set(i,8,0,ROLES.FORMAT);}
  // Micro timing: alternating along top row and left column starting at index 8.
  for(let i=8;i<n;i++){set(0,i,(i%2===0)?1:0,ROLES.TIMING);set(i,0,(i%2===0)?1:0,ROLES.TIMING);}
  // Finder 7x7 surrounded by right/bottom separators.
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const radius=Math.max(Math.abs(x-3),Math.abs(y-3));
    set(x,y,radius>=4?0:radius===3||radius<=1?1:0,radius>=4?ROLES.SEPARATOR:radius<=1?ROLES.FINDER_CENTER:ROLES.FINDER);
  }
  let bitIndex=0;
  const inc=(version==='M1'||version==='M3')?2:0;
  for(let right=n-1;right>0;right-=2){
    for(let vertical=0;vertical<n;vertical++)for(let z=0;z<2;z++){
      const x=right-z,up=((right+inc)&2)===0,y=up?n-1-vertical:vertical;
      const index=at(x,y);
      if(cells[index]===2&&bitIndex<payload.full.length)cells[index]=payload.full[bitIndex++];
    }
  }
  if(bitIndex!==payload.full.length)fail('INTERNAL_ERROR','Micro QR data placement failed');
  const functionMap=new Uint8Array(n*n).fill(2);
  for(let i=0;i<=8;i++){functionMap[at(8,i)]=0;functionMap[at(i,8)]=0;}
  for(let i=8;i<n;i++){functionMap[at(0,i)]=0;functionMap[at(i,0)]=0;}
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)functionMap[at(x,y)]=0;
  function masked(mask){
    const result=cells.slice();
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const index=at(x,y);
      if(functionMap[index]>1 && MASKS[mask](y,x))result[index]^=1;
    }
    return result;
  }
  const score=v=>{
    let lastRow=0,lastCol=0;
    for(let i=1;i<n;i++){lastRow+=v[at(i,n-1)];lastCol+=v[at(n-1,i)];}
    return Math.min(lastCol,lastRow)*16+Math.max(lastCol,lastRow);
  };
  let mask=chosenMask,best;
  if(chosenMask==='auto'){
    let bestScore=-1;
    for(let i=0;i<4;i++){const candidate=masked(i),s=score(candidate);if(s>bestScore){mask=i;best=candidate;bestScore=s;}}
  }else best=masked(mask);
  return {n,cells:best,roles,mask};
}
export function encodeMicroQR(input,options={}){
  if(typeof input!=='string')fail('INVALID_INPUT','Micro QR text input must be a string');
  if(input.length>10000)fail('DATA_TOO_LONG','Micro QR text is too long');
  for(const ch of input)if(ch.codePointAt(0)>=0xd800&&ch.codePointAt(0)<=0xdfff)fail('INVALID_INPUT','Unpaired UTF-16 surrogate');
  const allowed=['version','errorCorrection','mode','mask','charset'];
  for(const key of Object.keys(options))if(!allowed.includes(key))fail('INVALID_OPTION',`Unsupported Micro QR option: ${key}`);
  const {version='auto',errorCorrection='auto',mode='auto',mask='auto',charset='auto'}=options;
  if(!['auto','utf-8','iso-8859-1'].includes(charset))fail('INVALID_OPTION','Micro charset must be auto, utf-8, or iso-8859-1');
  if(version!=='auto'&&!Object.hasOwn(CAP,version))fail('INVALID_OPTION','Micro QR version must be auto, M1, M2, M3, or M4');
  if(!['auto','none','L','M','Q'].includes(errorCorrection))fail('INVALID_OPTION','Micro QR ECC must be auto, none, L, M, or Q');
  if(mask!=='auto'&&(!Number.isInteger(mask)||mask<0||mask>3))fail('INVALID_OPTION','Micro QR masks range from 0 to 3');
  const seg=segment(input,mode,charset);
  let selected=null,capacity=null,payload=null;
  for(const v of (version==='auto'?['M1','M2','M3','M4']:[version])){
    const candidates=errorCorrection==='auto'?Object.keys(CAP[v]):[errorCorrection];
    for(const ec of candidates){if(!Object.hasOwn(CAP[v],ec))continue;
      try{payload=makePayload(seg,v,ec);selected={version:v,ecc:ec};capacity=CAP[v][ec];break;}catch(e){if(!['DATA_TOO_LONG','UNSUPPORTED_MODE'].includes(e.code))throw e;}
    }
    if(selected)break;
  }
  if(!selected)fail('DATA_TOO_LONG','Content or correction level cannot fit in the selected Micro QR version. Choose Auto, a larger version, or lower correction.');
  const {n,cells,roles,mask:actualMask}=construct(selected.version,payload,mask);
  const fmtIndex=ECFORMAT[selected.version][selected.ecc]*4+actualMask,fmt=FORMAT[fmtIndex];
  // Format information is applied after masking, like Segno's reference implementation.
  for(let i=0;i<8;i++){cells[(i+1)*n+8]=(fmt>>>i)&1;cells[8*n+i+1]=(fmt>>>(14-i))&1;}
  const get=(arr,x,y,otherwise)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<n&&y<n?arr[y*n+x]:otherwise;
  const matrix=Object.freeze({size:n,width:n,height:n,
    getModule:(x,y)=>get(cells,x,y,0)===1,
    getRoleId:(x,y)=>get(roles,x,y,-1),
    getRole:(x,y)=>ROLE_NAMES[get(roles,x,y,-1)]??null,
    toRows:()=>Array.from({length:n},(_,y)=>Array.from({length:n},(_,x)=>cells[y*n+x]===1)),
    toUint8Array:()=>cells.slice()});
  const warnings=[];
  if(seg.mode==='byte'&&seg.charset==='utf-8'&&/[^\x00-\x7f]/.test(input))
    warnings.push({code:'MICRO_UTF8',severity:'warning',message:'Micro QR has no ECI field. Some scanners may not interpret UTF-8 text correctly; try Latin-1 for accented European characters.'});
  return Object.freeze({matrix,metadata:Object.freeze({kind:'Micro QR',version:selected.version,size:n,width:n,height:n,mask:actualMask,
    errorCorrection:selected.ecc==='none'?'None':selected.ecc,requestedErrorCorrection:errorCorrection,segmentModes:[seg.mode],segmentCount:1,
    sourceLength:input.length,dataBits:payload.used,charset:seg.charset}),warnings:Object.freeze(warnings),encoding:Object.freeze({...options,version:selected.version,errorCorrection:selected.ecc})});
}
