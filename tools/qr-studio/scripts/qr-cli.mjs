#!/usr/bin/env node
/** Offline CLI for QR Studio's pure Node-compatible SVG and batch cores.
 * The GUI's raster/PDF/EPS outputs require browser Canvas. This CLI intentionally
 * supports vector SVG only; it never opens a browser or contacts the network.
 */
import {readFile,writeFile,open} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {encodeQR,encodeMicroQR,encodeRMQR,renderSVG,createBatchZip,
  parseDelimited,mapBatchColumns,generateSequence} from '../src/index.js';

function usage(){return `QR Studio offline CLI (Node.js 20+)\n\n`+
`  node scripts/qr-cli.mjs --text "hello" --out code.svg [--kind standard|micro|rmqr] [--ecc L|M|Q|H]\n`+
`  node scripts/qr-cli.mjs --list entries.txt --out codes.zip\n`+
`  node scripts/qr-cli.mjs --csv entries.csv --out codes.zip [--delimiter csv|tsv|semicolon] [--data-column data] [--filename-column filename]\n`+
`  node scripts/qr-cli.mjs --sequence 'https://example.com/{number}' --start 1 --end 25 --out codes.zip\n\n`+
`  Options: --size 1024 --foreground '#172554' --background '#ffffff' --kind standard|micro|rmqr\n`+
`  --help   Print this documentation. Batch ZIP always includes manifest.csv.\n`+
`  Raster exports, print PDF/EPS and uploaded photographs require the browser application.\n`;
}
function parseArgs(args){const o={};for(let i=0;i<args.length;i++){
  const a=args[i];if(a==='--help'||a==='-h'){o.help=true;continue;}
  if(!a.startsWith('--'))throw Error(`Unrecognized argument ${a}`);
  const key=a.slice(2);if(!['text','out','kind','ecc','list','csv','delimiter','data-column','filename-column','sequence','start','end','pad','size','foreground','background','step'].includes(key))throw Error(`Unknown option --${key}`);
  if(o[key]!==undefined)throw Error(`Duplicate option --${key}`);
  if(i+1===args.length||args[i+1].startsWith('--'))throw Error(`Missing value for --${key}`);
  o[key]=args[++i];
}return o;}
function getInt(raw,key,defaultValue,min,max){if(raw===undefined)return defaultValue;const n=Number(raw);if(!Number.isInteger(n)||n<min||n>max)throw Error(`${key} must be integer ${min} to ${max}`);return n;}
async function writeBatch(rows,path,settings){
  const handle=await open(path,'w');let closed=false;
  const writable={write:async chunk=>{let offset=0;while(offset<chunk.length){const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset);if(!bytesWritten)throw Error('File write made no progress');offset+=bytesWritten;}},close:async()=>{await handle.close();closed=true;},abort:async()=>{if(!closed){await handle.close();closed=true;}}};
  try{
    const result=await createBatchZip(rows,{...settings,format:'svg',includeManifest:true,manifestIncludeData:false,writable,yieldEvery:20});
    process.stdout.write(`Saved ${path}: ${result.success} QR images, ${result.failed} failed record(s)\n`);
    if(result.failed)process.exitCode=2;
  }finally{if(!closed)await handle.close();}
}
export async function main(args=process.argv.slice(2)){
  const o=parseArgs(args);if(o.help){process.stdout.write(usage());return;}
  const kind=o.kind??'standard';if(!['standard','micro','rmqr'].includes(kind))throw Error('QR kind must be standard, micro, or rmqr');
  const encoding={};if(o.ecc!==undefined){if(!['L','M','Q','H'].includes(o.ecc))throw Error('ECC must be L, M, Q, H');encoding.errorCorrection=o.ecc;}
  const style={size:getInt(o.size,'size',1024,64,8192)};
  if(o.foreground)style.foreground=o.foreground;if(o.background)style.background=o.background;
  const sources=['text','list','csv','sequence'].filter(k=>o[k]!==undefined);
  if(sources.length!==1)throw Error('Choose exactly one of --text, --list, --csv, or --sequence.');
  if(!o.out)throw Error('Provide --out destination filename');
  const destination=resolve(o.out),source=sources[0];
  if(source==='text'){
    if(extname(destination).toLowerCase()!=='.svg')throw Error('Single QR output must be .svg');
    const qr=kind==='standard'?encodeQR(o.text,encoding):kind==='micro'?encodeMicroQR(o.text,encoding):encodeRMQR(o.text,encoding);
    await writeFile(destination,renderSVG(qr,style),'utf8');
    process.stdout.write(`Saved ${destination}: ${qr.metadata.kind}, ${qr.metadata.width}×${qr.metadata.height}\n`);return;
  }
  if(extname(destination).toLowerCase()!=='.zip')throw Error('Batch output must be .zip');
  let rows;
  if(source==='list'){
    const lines=(await readFile(o.list,'utf8')).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    rows=lines.map((data,i)=>({data,filename:`qr-${String(i+1).padStart(3,'0')}`}));
  }else if(source==='csv'){
    const delimiter={'csv':',','tsv':'\t','semicolon':';'}[o.delimiter??'csv'];
    if(!delimiter)throw Error('Delimiter must be csv, tsv, or semicolon');
    const cells=parseDelimited(await readFile(o.csv,'utf8'),{delimiter});
    const columns={data:o['data-column']??'data'};
    if(o['filename-column']!==undefined)columns.filename=o['filename-column'];
    rows=mapBatchColumns(cells,{headers:true,columns});
  }else {
    rows=generateSequence({start:getInt(o.start,'start',1,-1e9,1e9),end:getInt(o.end,'end',10,-1e9,1e9),
      step:getInt(o.step,'step',1,-1e6,1e6),pad:getInt(o.pad,'pad',3,0,12),template:o.sequence,filename:'qr-{number}'});
  }
  if(!rows.length)throw Error('No valid records to export');
  await writeBatch(rows,destination,{kind,encoding,style});
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
  main().catch(error=>{process.stderr.write(`Error: ${error.message}\nRun with --help to see options.\n`);process.exitCode=1;});
}
