/** Offline print output. No external libraries, network, or print services.
 * SVG physical dimensions remain vector. PDF uses lossless Flate-compressed
 * RGB imagery; EPS embeds locally rasterized JPEG because complex gradients,
 * filters and photographs cannot be represented reliably as basic PostScript.
 */
import {renderSVG} from './render-svg.js';
import {toCanvas} from './export.js';
import {normalizeStyle} from './styles.js';
import {fail} from './errors.js';
const printTextEncoder=new TextEncoder();
const printAscii=s=>printTextEncoder.encode(s);
function printBetween(value,min,max,name){if(!Number.isFinite(value)||value<min||value>max)fail('INVALID_OPTION',`${name} must be ${min}–${max}`);return value;}
function printSanitize(value){return String(value??'QR Studio').replace(/[^\x20-\x7e]/g,'?').replace(/[()\\]/g,c=>'\\'+c).slice(0,200);}
function printByteConcat(parts){const length=parts.reduce((n,p)=>n+p.length,0),all=new Uint8Array(length);let pos=0;for(const p of parts){all.set(p,pos);pos+=p.length;}return all;}
function printSvgRatio(qr,style){const w=qr.matrix.width??qr.matrix.size,h=qr.matrix.height??qr.matrix.size,q=style.quietZone;
  const type=style.motion?.type;const pad=type&&type!=='none'&&(!((type.startsWith('aurora-')||type==='ocean-crosscurrents')&&style.motion.coverage==='ink'))?(style.motion.artboard??0):0;
  return (h+q*2+pad*2+(style.frame?.label?style.frame.fontSize+2*style.frame.padding:0))/(w+q*2+pad*2);}
/** SVG with explicit print dimensions and sanitized embedded metadata. */
export function renderPrintSVG(qr,{style={},widthMm=50,title='QR Studio',description=''}={}){
  const s=normalizeStyle(style);printBetween(widthMm,5,1500,'widthMm');
  const width=widthMm.toFixed(3),height=(widthMm*printSvgRatio(qr,s)).toFixed(3);
  const original=renderSVG(qr,{...s,title});
  // Only replace the root <svg> dimensions, keeping exactly the same viewBox.
  return original.replace(/^(<svg\s[^>]*?)width="[^"]+" height="[^"]+"/,
    (_match,start)=>`${start}width="${width}mm" height="${height}mm"`)
    .replace(/(<svg\s[^>]*>)/,(_match,start)=>start+(description?`<desc>${String(description).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0,500)}</desc>`:''));
}
function printPdfDocument(rgb,width,height,pageW,pageH,qrW,qrH,offsetMm,compressed,metadata){
  const parts=[printAscii('%PDF-1.4\n%QR Studio offline print export\n')],offsets=[0];let count=parts[0].length;
  const add=obj=>{const b=typeof obj==='string'?printAscii(obj):obj;parts.push(b);count+=b.length;};
  const startObject=()=>offsets.push(count);
  const stream=(idx,head,data)=>{startObject();add(`${idx} 0 obj\n<< ${head} /Length ${data.length} >>\nstream\n`);add(data);add('\nendstream\nendobj\n');};
  startObject();add('1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n');
  startObject();add('2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n');
  startObject();add(`3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(4)} ${pageH.toFixed(4)}] /Resources <</XObject <</Im0 4 0 R>>>> /Contents 5 0 R>>\nendobj\n`);
  stream(4,`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`,compressed);
  const commands=printAscii(`q\n${qrW.toFixed(4)} 0 0 ${qrH.toFixed(4)} ${offsetMm.toFixed(4)} ${offsetMm.toFixed(4)} cm\n/Im0 Do\nQ\n`);
  stream(5,'',commands);
  startObject();add(`6 0 obj\n<</Title (${printSanitize(metadata.title)}) /Creator (QR Studio offline) /Subject (Printable QR image; design rasterized) >>\nendobj\n`);
  const start=count;
  add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for(const offset of offsets.slice(1))add(`${String(offset).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<</Size ${offsets.length} /Root 1 0 R /Info 6 0 R>>\nstartxref\n${start}\n%%EOF\n`);
  return new Blob(parts,{type:'application/pdf'});
}
async function printCompressDeflate(data){
  if(typeof CompressionStream==='undefined')fail('UNSUPPORTED_FORMAT','This browser cannot create lossless PDF images (CompressionStream unavailable)');
  const blob=new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(blob).arrayBuffer());
}
function printASCII85(bytes){
  const parts=[];let line='';const put=s=>{line+=s;if(line.length>90){parts.push(line+'\n');line='';}};
  for(let i=0;i<bytes.length;i+=4){
    const len=Math.min(4,bytes.length-i);let value=0;
    for(let k=0;k<4;k++)value=value*256+(k<len?bytes[i+k]:0);
    if(value===0&&len===4){put('z');continue;}
    const chars=Array(5);for(let k=4;k>=0;k--){chars[k]=String.fromCharCode(33+(value%85));value=Math.floor(value/85);}
    put(chars.slice(0,len===4?5:len+1).join(''));
  }
  return parts.join('')+line+'~>\n';
}
/** print PDF/EPS output. Every effect is rendered by the same SVG/Canvas pipeline. */
export async function toPrintBlob(qr,{format='pdf',style={},widthMm=50,marginMm=4,matte='#ffffff',title='QR Studio',quality=.96}={}){
  if(!['pdf','eps','svg'].includes(format))fail('UNSUPPORTED_FORMAT','Print format must be pdf, eps, or svg');
  printBetween(widthMm,5,1500,'widthMm');printBetween(marginMm,0,100,'marginMm');printBetween(quality,.1,1,'quality');
  if(!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(matte))fail('INVALID_COLOR','matte must be an opaque hex color');
  if(format==='svg')return new Blob([renderPrintSVG(qr,{style,widthMm,title})],{type:'image/svg+xml;charset=utf-8'});
  const s=normalizeStyle(style),canvas=await toCanvas(qr,s);
  if(canvas.width*canvas.height>8_000_000)fail('PRINT_SIZE_LIMIT','For print PDF/EPS set export size below 8 million pixels');
  const composite=document.createElement('canvas');composite.width=canvas.width;composite.height=canvas.height;
  const ctx=composite.getContext('2d',{willReadFrequently:format==='pdf'});
  if(!ctx)fail('CANVAS_UNAVAILABLE','Print export requires 2D Canvas support');
  ctx.fillStyle=matte;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(canvas,0,0);
  const widthPt=widthMm*72/25.4,heightPt=widthPt*canvas.height/canvas.width,pad=marginMm*72/25.4;
  if(format==='pdf'){
    const pixel=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const rgb=new Uint8Array(canvas.width*canvas.height*3);for(let i=0,j=0;i<pixel.length;i+=4){rgb[j++]=pixel[i];rgb[j++]=pixel[i+1];rgb[j++]=pixel[i+2];}
    return printPdfDocument(rgb,canvas.width,canvas.height,widthPt+2*pad,heightPt+2*pad,widthPt,heightPt,pad,await printCompressDeflate(rgb),{title});
  }
  const jpeg=await new Promise((ok,bad)=>composite.toBlob(b=>b?ok(b):bad(new Error('JPEG conversion failed')),'image/jpeg',quality));
  const base85=printASCII85(new Uint8Array(await jpeg.arrayBuffer()));
  const llx=0,lly=0,urx=Math.ceil(widthPt+pad*2),ury=Math.ceil(heightPt+pad*2);
  const ps=`%!PS-Adobe-3.0 EPSF-3.0\n%%Title: ${printSanitize(title)}\n%%Creator: QR Studio (offline)\n%%BoundingBox: ${llx} ${lly} ${urx} ${ury}\n%%LanguageLevel: 3\n%%Pages: 1\n%%EndComments\n% Rasterized artwork and QR; no automatic color conversion.\ngsave\n${pad.toFixed(5)} ${pad.toFixed(5)} translate\n${widthPt.toFixed(5)} ${heightPt.toFixed(5)} scale\n/DeviceRGB setcolorspace\n<< /ImageType 1 /Width ${canvas.width} /Height ${canvas.height} /BitsPerComponent 8 /ColorSpace /DeviceRGB /Decode [0 1 0 1 0 1] /ImageMatrix [${canvas.width} 0 0 -${canvas.height} 0 ${canvas.height}] /DataSource currentfile /ASCII85Decode filter /DCTDecode filter >> image\n${base85}grestore\nshowpage\n%%EOF\n`;
  return new Blob([ps],{type:'application/postscript'});
}
