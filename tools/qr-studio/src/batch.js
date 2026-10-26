/** Headless batch foundation. No ZIP dependency, network calls or UI dependencies.
 * Stream one completed result at a time, so callers decide how to package it.
 * The future batch editor, ZIP writer and Node CLI can share this exact API.
 */
import {generateQR} from './variants.js';
import {analyzeDesign} from './styles.js';
import {toBlob, prepareFilename} from './export.js';
import {fail} from './errors.js';

function normalizeRecord(record,index,defaults){
  if(typeof record==='string')record={data:record};
  if(!record || typeof record!=='object' || Array.isArray(record))fail('INVALID_BATCH_RECORD',`Batch row ${index+1} must be text or an object`);
  const {data,filename,kind,encoding,style,format}=record;
  if(typeof data!=='string' && !(data instanceof Uint8Array) && !(Array.isArray(data)&&data.length>=1&&data.length<=128&&data.every(item=>item&&typeof item==='object'&&!Array.isArray(item))))
    fail('INVALID_BATCH_RECORD',`Batch row ${index+1} needs text, Uint8Array, or an explicit segment array`);
  if(filename!=null&&typeof filename!=='string')fail('INVALID_BATCH_RECORD',`Batch row ${index+1} filename must be text`);
  if(encoding!=null&&(!encoding||typeof encoding!=='object'||Array.isArray(encoding)))fail('INVALID_BATCH_RECORD','encoding must be an object');
  if(style!=null&&(!style||typeof style!=='object'||Array.isArray(style)))fail('INVALID_BATCH_RECORD','style must be an object');
  return {data,filename:filename??`qr-${String(index+1).padStart(3,'0')}`,kind:kind??defaults.kind,
    encoding:{...defaults.encoding,...encoding},style:style==null?defaults.style:{...defaults.style,...style,
      ...(style.paints&&defaults.style?.paints?{paints:{...defaults.style.paints,...style.paints}}:{}),
      ...(style.images&&defaults.style?.images?{images:{...defaults.style.images,...style.images}}:{}),
      ...(style.shadows&&defaults.style?.shadows?{shadows:{...defaults.style.shadows,...style.shadows}}:{})},format:format??defaults.format};
}
function abortIfNeeded(signal){if(signal?.aborted)fail('ABORTED','Batch generation cancelled');}
/**
 * Async iterable of {index,ok,filename,blob,metadata,warnings} or
 * {index,ok:false,error:{code,message}}. Supports async input iterables,
 * progress reporting, per-row overrides, and AbortSignal cancellation.
 * Browser raster formats use Canvas; SVG blobs also work under Node.js.
 */
export async function* iterateBatch(records,options={}){
  if(!records||!(Symbol.iterator in Object(records))&&!(Symbol.asyncIterator in Object(records)))
    fail('INVALID_BATCH','records must be an iterable or async iterable');
  const {kind='standard',encoding={},style={},format='svg',quality=.92,jpegMatte='#ffffff',printOptions={},signal,onProgress,stopOnError=false,yieldEvery=20,maxRecords=100000}=options;
  if(!Number.isInteger(yieldEvery)||yieldEvery<1||yieldEvery>100000)fail('INVALID_OPTION','yieldEvery must be 1–100000');
  if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>100000)fail('INVALID_OPTION','maxRecords must be 1–100000');
  if(onProgress!==undefined && typeof onProgress!=='function')fail('INVALID_OPTION','onProgress must be a function');
  const defaults={kind,encoding,style,format};
  let index=0,success=0,failed=0;
  for await (const item of records){
    abortIfNeeded(signal);
    if(index>=maxRecords)fail('BATCH_LIMIT',`Batch has more than ${maxRecords} records`);
    let result;
    try{
      const row=normalizeRecord(item,index,defaults);
      const qr=generateQR(row.data,{...row.encoding,kind:row.kind});
      const blob=await toBlob(qr,{format:row.format,style:row.style,quality,jpegMatte,printOptions});
      result={index,ok:true,filename:prepareFilename(row.filename,row.format),blob,
        metadata:qr.metadata,warnings:analyzeDesign(qr,row.style)};
      success++;
    }catch(error){
      if(signal?.aborted || error?.code==='ABORTED')abortIfNeeded(signal);
      if(stopOnError)throw error;
      result={index,ok:false,error:{code:error?.code??'BATCH_ROW_ERROR',message:error?.message??String(error)}};
      failed++;
    }
    index++;
    if(onProgress)onProgress({completed:index,success,failed});
    yield result;
    abortIfNeeded(signal);
    // Cooperative yielding avoids freezing UI during long workloads.
    if(index%yieldEvery===0 && typeof setTimeout==='function')await new Promise(resolve=>setTimeout(resolve,0));
  }
}
/** Convenience collector for small batches; use iterateBatch to bound memory. */
export async function generateBatch(records,options={}){
  const results=[];
  for await (const result of iterateBatch(records,options))results.push(result);
  return {results,success:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length};
}
