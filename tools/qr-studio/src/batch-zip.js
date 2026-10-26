/** Dependency-free streaming ZIP32 (store method).
 * Works as a bounded-size Blob for small batches or streams to a WritableStream/
 * FileSystemWritableFileStream without retaining image bytes in JS memory.
 */
import {iterateBatch} from './batch.js';
import {serializeManifest} from './batch-input.js';
import {fail} from './errors.js';

const textEncoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function updateCRC(crc,bytes){for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return crc>>>0;}
function u16(d,p,v){d.setUint16(p,v,true);}function u32(d,p,v){d.setUint32(p,v>>>0,true);}
function zipDate(now){const y=Math.max(1980,Math.min(now.getFullYear(),2107));return {time:(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>>1),date:((y-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate()};}
function localHeader(name,t){const b=new Uint8Array(30+name.length),d=new DataView(b.buffer);u32(d,0,0x04034b50);u16(d,4,20);u16(d,6,0x0808);u16(d,8,0);u16(d,10,t.time);u16(d,12,t.date);u16(d,26,name.length);b.set(name,30);return b;}
function descriptor(crc,size){const b=new Uint8Array(16),d=new DataView(b.buffer);u32(d,0,0x08074b50);u32(d,4,crc);u32(d,8,size);u32(d,12,size);return b;}
function centralHeader(entry){const {name,time,date,crc,size,offset}=entry,b=new Uint8Array(46+name.length),d=new DataView(b.buffer);u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u16(d,8,0x0808);u16(d,10,0);u16(d,12,time);u16(d,14,date);u32(d,16,crc);u32(d,20,size);u32(d,24,size);u16(d,28,name.length);u32(d,42,offset);b.set(name,46);return b;}
function endHeader(count,size,offset){const b=new Uint8Array(22),d=new DataView(b.buffer);u32(d,0,0x06054b50);u16(d,8,count);u16(d,10,count);u32(d,12,size);u32(d,16,offset);return b;}
function abortIf(signal){if(signal?.aborted)fail('ABORTED','ZIP generation cancelled');}
function safeName(raw,used){
  let name=String(raw??'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/^\.+/,'').trim().slice(0,180)||'qr.svg';
  let unique=name,n=2;
  while(used.has(unique.toLowerCase())){const i=name.lastIndexOf('.');unique=(i<0?name:name.slice(0,i))+`-${n++}`+(i<0?'':name.slice(i));}
  used.add(unique.toLowerCase());return unique;
}
/**
 * @param {Iterable|AsyncIterable} records - same records accepted by iterateBatch
 * @param {object} options - iterateBatch options, plus manifest, writable, maxBytes, onResult
 * @returns {Promise<{blob:Blob|null,entries:Array,success:number,failed:number,bytes:number}>}
 */
export async function createBatchZip(records,options={}){
  const {writable=null,includeManifest=true,manifestIncludeData=false,maxBytes=250_000_000,
    onResult,signal,now=new Date(),...batchOptions}=options;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>4_000_000_000)fail('INVALID_OPTION','maxBytes must be 1024–4000000000');
  if(onResult!=null&&typeof onResult!=='function')fail('INVALID_OPTION','onResult must be a callback');
  if(!writable&&maxBytes>500_000_000)fail('INVALID_OPTION','Blob mode is limited to 500 MB; use writable for larger ZIPs');
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('INVALID_OPTION','now must be a Date');
  const parts=[],entries=[],manifest=[],used=new Set(),timestamp=zipDate(now);
  let offset=0,total=0,success=0,failed=0;
  // Data in manifests is opt-in. Capture each input only until its result has
  // been emitted, instead of retaining a second copy of every batch record.
  const queuedData=[];
  const annotatedRecords=manifestIncludeData?(async function* (){
    for await(const input of records){
      queuedData.push(typeof input==='string'?input:input?.data??'');
      yield input;
    }
  })():records;
  const writer=writable?.getWriter?.()??writable;
  if(writable&&typeof writer?.write!=='function')fail('INVALID_OPTION','writable must provide write() or getWriter()');
  const write=async chunk=>{
    abortIf(signal);
    if(offset+chunk.length>maxBytes)fail('ZIP_SIZE_LIMIT',`ZIP exceeds ${maxBytes} bytes; use smaller images or fewer rows`);
    if(offset+chunk.length>0xffffffff)fail('ZIP64_REQUIRED','ZIP64 files are not supported');
    if(writer)await writer.write(chunk);else parts.push(chunk);
    offset+=chunk.length;
  };
  async function append(name,blob){
    if(entries.length>=65000)fail('ZIP_ENTRY_LIMIT','Too many ZIP entries');
    const filename=safeName(name,used),bytes=textEncoder.encode(filename);
    if(bytes.length>65535)fail('INVALID_FILENAME','Filename is too long for ZIP');
    if(blob.size>0xffffffff)fail('ZIP64_REQUIRED','A ZIP entry is over 4GB');
    const localOffset=offset;await write(localHeader(bytes,timestamp));
    let crc=0xffffffff,size=0;
    for await(const chunk of blob.stream()){
      abortIf(signal);crc=updateCRC(crc,chunk);size+=chunk.length;await write(chunk);
    }
    crc=(crc^0xffffffff)>>>0;
    await write(descriptor(crc,size));
    entries.push({filename,size,crc,name:bytes,offset:localOffset,...timestamp});total+=size;
    return filename;
  }
  try{
    for await (const result of iterateBatch(annotatedRecords,{...batchOptions,signal})){
      abortIf(signal);
      const manifestText=manifestIncludeData?queuedData.shift():undefined;
      if(result.ok){
        const filename=await append(result.filename,result.blob);
        manifest.push({index:result.index,filename,ok:true,metadata:result.metadata,data:manifestText});
        success++;
      }else{
        manifest.push({index:result.index,ok:false,error:result.error,data:manifestText});failed++;
      }
      if(onResult)onResult({...result,...(result.ok?{filename:manifest.at(-1).filename}:{})});
    }
    if(includeManifest){const text=serializeManifest(manifest,{includeData:manifestIncludeData});await append('manifest.csv',new Blob([text],{type:'text/csv'}));}
    const centralOffset=offset;
    for(const entry of entries)await write(centralHeader(entry));
    await write(endHeader(entries.length,offset-centralOffset,centralOffset));
    if(writer?.close)await writer.close();else writer?.releaseLock?.();
    return {blob:writer?null:new Blob(parts,{type:'application/zip'}),entries:entries.map(({filename,size,crc})=>({filename,size,crc})),success,failed,bytes:offset};
  }catch(error){
    try{await writer?.abort?.(error);writer?.releaseLock?.();}catch{/* retain original error */}
    throw error;
  }
}
