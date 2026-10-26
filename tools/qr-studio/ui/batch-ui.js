/** Local batch editor controller, intentionally independent of the single-QR design.
 * The public engine owns normalization/rendering/export. This adapter only reads input,
 * drives preview selection, and supplies progress + cancellation feedback.
 */
export function createBatchController({engine,getStyle,getKind,getEncoding,getQuality,getMatte,getPrintOptions,onPreview}){
  const $=id=>document.getElementById(id),all=selector=>[...document.querySelectorAll(selector)];
  const cfg={mode:'single',source:'paste',rows:[],selected:0,errors:[],controller:null,retryRows:null,page:0};
  const limit=5000;
  const fields=['data','filename','kind','format','encoding','style'];
  const names={data:'QR text',filename:'Filename',kind:'QR type',format:'File format',encoding:'Encoding options JSON',style:'Style options JSON'};
  const currentKind=()=>getKind();
  function parseTable(){
    const text=$('batchTableText').value,delimiter=$('batchDelimiter').value==='tab'?'\t':$('batchDelimiter').value;
    const table=engine.parseDelimited(text,{delimiter,maxRows:limit+1});
    const headers=$('batchHeaders').checked,head=headers?(table[0]??[]):(table[0]??[]).map((_,i)=>`Column ${i+1}`);
    const map=$('batchColumnMapping'),old=Object.fromEntries(fields.map(f=>[f,$(`batchCol-${f}`)?.value??'']));
    // Only rebuild controls if column labels changed, preserving existing mappings while editing cells.
    const signature=JSON.stringify([head,headers]);
    if(map.dataset.signature!==signature){
      map.replaceChildren();map.dataset.signature=signature;
      for(const f of fields){
        const div=document.createElement('div');div.className='field';
        const label=document.createElement('label');label.htmlFor=`batchCol-${f}`;label.textContent=names[f];
        const select=document.createElement('select');select.id=`batchCol-${f}`;select.dataset.batchMap=f;
        const ignored=document.createElement('option');ignored.value='';ignored.textContent=f==='data'?'Choose a column':'(None)';select.append(ignored);
        head.forEach((h,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${h||'(unnamed)'} · ${i+1}`;select.append(o);});
        const guess=head.findIndex(h=>{const n=h.toLowerCase().trim();return f==='data'?['data','text','content','url','payload','value'].includes(n):
          f==='filename'?['filename','file','name','label'].includes(n):n===f;});
        select.value=old[f]!==''&&Number(old[f])<head.length?old[f]:guess>=0?String(guess):f==='data'&&head.length?'0':'';
        select.addEventListener('change',refresh);div.append(label,select);map.append(div);
      }
    }
    const columns={};for(const f of fields){const v=$(`batchCol-${f}`)?.value;if(v!=='')columns[f]=Number(v);}
    if(columns.data===undefined)throw Error('Choose which column contains QR text.');
    return engine.mapBatchColumns(table,{headers,columns,maxRecords:limit});
  }
  function getRows(){
    if(cfg.source==='paste'){
      return $('batchPaste').value.split(/\r?\n/).map(data=>data.trim()).filter(Boolean)
        .slice(0,limit+1).map((data,i)=>({data,filename:`qr-${String(i+1).padStart(3,'0')}`}));
    }
    if(cfg.source==='table')return parseTable();
    return engine.generateSequence({start:Number($('seqStart').value),end:Number($('seqEnd').value),step:Number($('seqStep').value),pad:Number($('seqPad').value),
      template:$('seqTemplate').value,filename:$('seqFilename').value});
  }
  function refresh(){
    let problem='';try{cfg.rows=getRows();if(cfg.rows.length>limit)throw Error(`Maximum ${limit} items in the browser editor.`);
      const blank=cfg.rows.findIndex(r=>!String(r.data??'').trim());if(blank>=0)throw Error(`Row ${blank+1} needs QR text.`);
    }catch(e){cfg.rows=[];problem=e.message;}
    cfg.selected=Math.min(cfg.selected,Math.max(0,cfg.rows.length-1));
    $('batchCount').textContent=cfg.rows.length?`${cfg.rows.length.toLocaleString()} ready to generate`:'No items yet';
    $('batchInputError').textContent=problem;
    $('batchGenerate').disabled=!!problem||cfg.rows.length===0||!!cfg.controller;
    $('batchRetry').hidden=true;cfg.retryRows=null;
    const host=$('batchPreviewRows');host.replaceChildren();
    const pageSize=12,pageCount=Math.max(1,Math.ceil(cfg.rows.length/pageSize));
    cfg.page=Math.min(pageCount-1,Math.floor(cfg.selected/pageSize));
    if(!problem){
      const first=cfg.page*pageSize;
      cfg.rows.slice(first,first+pageSize).forEach((record,offset)=>{
        const i=first+offset;
        const b=document.createElement('button');b.type='button';b.className='batch-preview-item'+(cfg.selected===i?' selected':'');
        b.title='Preview QR code '+(i+1);b.textContent=`${i+1}. ${String(record.data??'').slice(0,95)}`;
        b.addEventListener('click',()=>{cfg.selected=i;all('.batch-preview-item').forEach(n=>n.classList.toggle('selected',n===b));onPreview();});host.append(b);
      });
    }
    $('batchPagination').hidden=pageCount<=1||!!problem;
    $('batchPrev').disabled=cfg.page===0;$('batchNext').disabled=cfg.page>=pageCount-1;
    $('batchPageLabel').textContent=`Page ${cfg.page+1} of ${pageCount} · ${cfg.rows.length} records`;
    onPreview();
  }
  function getPreview(){return cfg.mode==='batch'?cfg.rows[cfg.selected]??null:null;}
  function changeMode(mode){cfg.mode=mode;
    $('singleContentArea').hidden=mode!=='single';$('batchContentArea').hidden=mode!=='batch';
    $('modeSingle').classList.toggle('selected',mode==='single');$('modeBatch').classList.toggle('selected',mode==='batch');
    if(mode==='batch')refresh();else onPreview();
  }
  function changeSource(source){cfg.source=source;cfg.page=0;
    all('[data-batch-source]').forEach(b=>b.classList.toggle('selected',b.dataset.batchSource===source));
    all('[data-batch-pane]').forEach(p=>p.hidden=p.dataset.batchPane!==source);cfg.selected=0;refresh();
  }
  function reportError(item){
    const li=document.createElement('li');li.textContent=`Row ${item.index+1}: ${item.error.message}`;$('batchErrors').append(li);
  }
  async function execute(retry=false){
    if(cfg.controller)return;
    const retried=retry?cfg.retryRows:null;
    let records=retry?retried?.map(item=>item.row):cfg.rows;
    if(!records?.length)return;
    // Retrying a subset must preserve the original CSV/list row numbers in the UI.
    const originalIndexes=retry?retried.map(item=>item.index):records.map((_,index)=>index);
    const outputFormat=$('batchExportFormat').value,zipName=engine.prepareFilename($('batchZipName').value||'', 'svg').replace(/\.svg$/i,'.zip').replace(/^qr-(\d{4})/,'qr-batch-$1');
    const controller=new AbortController();cfg.controller=controller;
    $('batchGenerate').disabled=true;$('batchRetry').hidden=true;$('batchCancel').hidden=false;
    $('batchProgress').hidden=false;$('batchProgress').value=0;$('batchProgress').max=records.length;
    $('batchErrors').replaceChildren();cfg.errors=[];
    const btn=$('batchGenerate');btn.textContent='Generating…';
    const onProgress=p=>{$('batchProgress').value=p.completed;$('batchStatus').textContent=`Processed ${p.completed.toLocaleString()} / ${records.length.toLocaleString()} · ${p.success} succeeded · ${p.failed} failed`;};
    const onResult=item=>{if(!item.ok){
      const originalIndex=originalIndexes[item.index];
      cfg.errors.push({row:records[item.index],error:item.error,index:originalIndex});
      reportError({...item,index:originalIndex});
    }};
    const wantsStream=$('batchStream').checked&&typeof showSaveFilePicker==='function';
    let output=null;
    try{
      if(wantsStream){
        // Must request the file in the original user gesture before any long-running awaits.
        const handle=await showSaveFilePicker({suggestedName:zipName,types:[{description:'ZIP archive',accept:{'application/zip':['.zip']}}]});
        output=await handle.createWritable();
      }
      const overrides=records.map(r=>({...r,format:r.format||outputFormat}));
      const res=await engine.createBatchZip(overrides,{kind:currentKind(),encoding:getEncoding(),style:getStyle(),format:outputFormat,
        quality:getQuality(),jpegMatte:getMatte(),printOptions:getPrintOptions?getPrintOptions():{},maxRecords:limit,maxBytes:wantsStream?3_000_000_000:250_000_000,
        includeManifest:$('batchManifest').checked,writable:output,signal:controller.signal,yieldEvery:1,onProgress,onResult});
      if(res.blob){const url=URL.createObjectURL(res.blob),link=document.createElement('a');link.href=url;link.download=zipName;
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
      $('batchStatus').textContent=`ZIP ${res.blob?'downloaded':'saved'} · ${res.success} generated · ${res.failed} failed · ${(res.bytes/1_000_000).toFixed(2)} MB. Nothing uploaded.`;
      if(cfg.errors.length){cfg.retryRows=cfg.errors.map(item=>({row:item.row,index:item.index}));$('batchRetry').hidden=false;}
    }catch(e){
      $('batchStatus').textContent=e.code==='ABORTED'?'Batch cancelled; incomplete ZIP discarded.':`Batch failed: ${e.message}`;
      if(e.name==='AbortError')$('batchStatus').textContent='File save cancelled.';
    }finally{cfg.controller=null;$('batchCancel').hidden=true;$('batchGenerate').disabled=cfg.rows.length===0;btn.textContent='↓ Generate ZIP';}
  }
  function init(){
    $('modeSingle').addEventListener('click',()=>changeMode('single'));$('modeBatch').addEventListener('click',()=>changeMode('batch'));
    all('[data-batch-source]').forEach(b=>b.addEventListener('click',()=>changeSource(b.dataset.batchSource)));
    $('batchPaste').value='https://example.com/item/001\nhttps://example.com/item/002\nhttps://example.com/item/003';
    for(const id of ['batchPaste','batchTableText','batchDelimiter','batchHeaders','seqStart','seqEnd','seqStep','seqPad','seqTemplate','seqFilename'])
      $(id).addEventListener(id.startsWith('batch')?'input':'input',()=>{cfg.selected=0;refresh();});
    $('batchChooseFile').addEventListener('click',()=>$('batchFile').click());
    $('batchFile').addEventListener('change',async e=>{
      const file=e.target.files[0];if(!file)return;
      if(file.size>5_000_000){$('batchInputError').textContent='CSV/TSV files must be 5 MB or less.';return;}
      $('batchTableText').value=await file.text();$('batchTableName').textContent=file.name;
      $('batchDelimiter').value=file.name.toLowerCase().endsWith('.tsv')?'tab':',';
      $('batchColumnMapping').dataset.signature='';refresh();e.target.value='';
    });
    $('batchPrev').addEventListener('click',()=>{if(cfg.page>0){cfg.selected=(--cfg.page)*12;refresh();}});
    $('batchNext').addEventListener('click',()=>{if((cfg.page+1)*12<cfg.rows.length){cfg.selected=(++cfg.page)*12;refresh();}});
    $('batchGenerate').addEventListener('click',()=>execute(false));$('batchRetry').addEventListener('click',()=>execute(true));
    $('batchCancel').addEventListener('click',()=>cfg.controller?.abort());
    $('batchStreamRow').hidden=typeof showSaveFilePicker!=='function';
    refresh();
  }
  return {init,refresh,getPreview,changeMode,get mode(){return cfg.mode;}};
}
