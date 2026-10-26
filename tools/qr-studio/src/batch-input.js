/** Strict, dependency-free batch ingestion: RFC 4180-ish CSV/TSV + numbered templates.
 * No file I/O, no eval, no network calls. UI and API share these helpers.
 */
import {fail} from './errors.js';

export function parseDelimited(text,{delimiter=',',maxRows=10000,maxColumns=100,maxChars=5_000_000}={}){
  if(typeof text!=='string'||text.length>maxChars)fail('INVALID_TABLE',`Text input must be at most ${maxChars} characters`);
  if(![',','\t',';'].includes(delimiter))fail('INVALID_TABLE','Delimiter must be comma, tab, or semicolon');
  if(!Number.isInteger(maxRows)||maxRows<1||maxRows>100000||!Number.isInteger(maxColumns)||maxColumns<1||maxColumns>1000)
    fail('INVALID_TABLE','Invalid row or column limit');
  const rows=[];let row=[],field='',quoted=false,closedQuote=false;
  text=text.replace(/^\uFEFF/,'');
  const emitField=()=>{if(row.length>=maxColumns)fail('TABLE_LIMIT','Too many columns');row.push(field);field='';closedQuote=false;};
  const emitRow=()=>{emitField();if(row.some(cell=>cell!=='')){rows.push(row);if(rows.length>maxRows)fail('TABLE_LIMIT',`Too many rows (maximum ${maxRows})`);}row=[];};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closedQuote=true;}}
      else field+=c;
    }else if(c==='"'){
      if(field.length||closedQuote)fail('INVALID_TABLE',`Unexpected quote at character ${i+1}`);
      quoted=true;
    }else if(c===delimiter)emitField();
    else if(c==='\n'||c==='\r'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      emitRow();
    }else if(closedQuote){
      // Accept optional whitespace after a closed quoted field, but not text.
      if(c!==' '&&c!=='\t')fail('INVALID_TABLE',`Unexpected text after closing quote at character ${i+1}`);
    }else field+=c;
  }
  if(quoted)fail('INVALID_TABLE','Unclosed quoted field');
  if(field.length||row.length||closedQuote)emitRow();
  return rows;
}

const FIELDS=new Set(['data','filename','kind','format','style','encoding']);
/** Map columns by header name or numeric column index. Independent rows retain overrides. */
export function mapBatchColumns(table,{headers=true,columns={data:'data'},maxRecords=10000}={}){
  if(!Array.isArray(table)||!table.every(Array.isArray))fail('INVALID_TABLE','table must be an array of row arrays');
  if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>100000)fail('INVALID_TABLE','Invalid record limit');
  const heading=headers?table[0]??[]:[],start=headers?1:0;
  const resolved={};
  for(const [field,key] of Object.entries(columns)){
    if(!FIELDS.has(field))fail('INVALID_TABLE','Unsupported column mapping: '+field);
    const ix=typeof key==='number'?key:heading.indexOf(key);
    if(!Number.isInteger(ix)||ix<0||ix>999)fail('INVALID_TABLE',`Missing ${field} column (${key})`);
    resolved[field]=ix;
  }
  if(resolved.data==null)fail('INVALID_TABLE','A data column is required');
  if(table.length-start>maxRecords)fail('TABLE_LIMIT',`Too many records (maximum ${maxRecords})`);
  return table.slice(start).map((values,i)=>{
    const row={};
    for(const [field,index] of Object.entries(resolved)){
      const raw=values[index]??'';
      if(field==='style'||field==='encoding'){
        if(raw.trim()){
          if(raw.length>300_000)fail('INVALID_TABLE',`JSON overrides on row ${i+1} are too long`);
          try{const val=JSON.parse(raw);if(!val||typeof val!=='object'||Array.isArray(val))throw Error();row[field]=val;}
          catch{fail('INVALID_TABLE',`Invalid JSON in ${field} on row ${i+1}`);}
        }
      }else if(raw!=='')row[field]=raw;
    }
    row.data??='';return row;
  });
}
/** Generate inclusive numeric sequences with bounded count and safe literal substitution. */
export function generateSequence({start=1,end=10,step=1,pad=3,template='https://example.com/{number}',filename='qr-{number}'}={}){
  for(const [key,value,min,max] of [['start',start,-1e9,1e9],['end',end,-1e9,1e9],['step',step,-1e6,1e6],['pad',pad,0,12]])
    if(!Number.isInteger(value)||value<min||value>max)fail('INVALID_SEQUENCE',`Invalid ${key}`);
  if(step===0||(end-start)*step<0)fail('INVALID_SEQUENCE','Step must lead toward the end value');
  if(typeof template!=='string'||typeof filename!=='string'||template.length>10000||filename.length>256)
    fail('INVALID_SEQUENCE','Invalid sequence templates');
  const count=Math.floor(Math.abs((end-start)/step))+1;
  if(count>10000)fail('BATCH_LIMIT','Sequence limit is 10,000 records');
  return Array.from({length:count},(_,i)=>{
    const n=start+i*step,formatted=(n<0?'-':'')+String(Math.abs(n)).padStart(pad,'0');
    const expand=str=>str.replace(/\{(?:number|n)\}/g,formatted).replace(/\{index\}/g,String(i+1));
    return {data:expand(template),filename:expand(filename)};
  });
}

/** CSV-safe, intentionally conservative, with no spreadsheet formulas enabled. */
export function serializeManifest(rows,{includeData=false}={}){
  const header=['index','filename','status','qr_type','version','error_code','error_message',...(includeData?['data']:[])];
  const csvField=value=>{
    let s=String(value??'');
    // Prevent CSV formula execution when opening generated manifest in spreadsheet apps.
    if(/^[\s]*[=+@-]/.test(s))s="'"+s;
    return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  };
  return [header,...rows.map(row=>[row.index+1,row.filename??'',row.ok?'ok':'error',row.metadata?.kind??'',row.metadata?.version??'',row.error?.code??'',row.error?.message??'',...(includeData?[row.data??'']:[])])].map(row=>row.map(csvField).join(',')).join('\r\n')+'\r\n';
}
