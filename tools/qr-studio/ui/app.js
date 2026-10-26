import {generateQR,renderSVG,renderAnimatedSVG,normalizeMotion,motionCycle,AURORA_TYPES,AURORA_COLORS,AURORA_PALETTES,auroraPalette,analyzeDesign,downloadQR,toCanvas,readLogoFile,
  removeLightBackground,prepareFilename,payloads,RMQR_VERSIONS,normalizeStyle,normalizeImages,normalizeShadows,validateImageDataUrl,
  parseDelimited,mapBatchColumns,generateSequence,serializeManifest,createBatchZip,encodeStructuredAppend,extractImagePalette,sampleRasterContrast,decodeWithBrowser,verifyStandardQRBitmap,packDesign,unpackDesign} from '../dist/qr-engine.js';
import {createBatchController} from './batch-ui.js';

const $=id=>document.getElementById(id);
const q=(selector)=>document.querySelector(selector);
const qa=(selector)=>[...document.querySelectorAll(selector)];
const copy=value=>structuredClone(value);
const paints=['data','background','finder','finderCenter','finderLight','timing','alignment','format','version','separator','darkModule','quietZone'];
const paintLabels={data:'Data modules',background:'Background',finder:'Finder frames',finderCenter:'Finder centers',finderLight:'Finder light',
  timing:'Timing pattern',alignment:'Alignment patterns',format:'Format information',version:'Version information',separator:'Finder separators',darkModule:'Fixed dark module',quietZone:'Quiet-zone border'};
const defaults=()=>({
  contentKind:'text',content:{text:'https://example.com/hello',url:'https://example.com',
    ssid:'',password:'',security:'WPA',hidden:false,firstName:'',lastName:'',organization:'',contactPhone:'',contactEmail:'',
    emailTo:'',emailSubject:'',emailBody:'',smsTo:'',smsBody:'',phone:'',latitude:'',longitude:''},
  qrKind:'standard',
  technical:{standard:{errorCorrection:'M',version:'auto',mask:'auto',mode:'auto',charset:'utf-8',eci:'none',boostErrorCorrection:false,optimizeSegments:false,enableHanzi:false},
    micro:{errorCorrection:'auto',version:'auto',mask:'auto',mode:'auto',charset:'auto'},rmqr:{errorCorrection:'M',version:'auto',fit:'balanced',mode:'auto'}},
  design:{size:1024,quietZone:4,shape:'square',moduleScale:1,cornerRadius:.32,
    paints:{data:'#172554',background:'#ffffff'},
    eyes:{outerShape:'rounded',innerShape:'square',positions:{}},
    logo:null,artwork:null,shadows:{},frame:null,motion:{type:'none',color:'#1464ac',duration:3.2,hold:0,strength:.72,width:.38,angle:0,protectEyes:false,coverage:'ink',artboard:0,contrast:'protected',detail:.58,glow:.58,fieldScale:1,fieldRotation:0,holdPhase:0,palette:null}},
  filename:'',format:'png',jpegMatte:'#ffffff',quality:.92,print:{widthMm:50,marginMm:4,svgPhysical:false}
});
let state=defaults(), qr=null, currentStyle=null, currentPayload='',lastEncodingKey='',
  activePaint='data', selectedStop=0, individualEye='all',previewSurface='checker',
  undo=[],redo=[],lastHistoryGroup='',pickerContext=null,pickerHSV={h:225,s:1,v:1,a:1},
  renderPending=false,animationExportController=null,logoProcessToken=0,logoLoadToken=0,artworkLoadToken=0,patternLoadToken=0,paletteExtractToken=0,previewStatus='Ready',pickerValueMode='hex',
  lastOpaqueBackground='#ffffff',shadowTarget='modules',batchController=null,artworkEditLayer='background',photoPaletteColors=[],contrastTimer=null,contrastToken=0,inspectMode=false,compareSnapshot=null,snapshots=[],motionPlaying=true,motionFrame=0,motionLastUpdate=0,scanToken=0;
let pickerReturnFocus=null, previewReturnFocus=null;
const number=(x,def=0)=>{const v=Number(x);return Number.isFinite(v)?v:def;};
const asString=(x)=>String(x??'');
const cssPaint=paint=>{
  if(!paint)return '#ffffff';
  if(typeof paint==='string')return paint==='transparent'?'repeating-conic-gradient(#e5e9f0 0 25%,white 0 50%) 0 0/10px 10px':paint;
  if(paint.type==='linear')return `linear-gradient(${90-(paint.angle??0)}deg,${paint.stops.map(s=>`${s.color} ${Math.round(s.offset*100)}%`).join(',')})`;
  return `radial-gradient(circle at ${Math.round((paint.cx??.5)*100)}% ${Math.round((paint.cy??.5)*100)}%,${paint.stops.map(s=>`${s.color} ${Math.round(s.offset*100)}%`).join(',')})`;
};
const eyeAreas={finder:'outerColor',finderCenter:'innerColor',finderLight:'lightColor'};
const eyePosition=area=>eyeAreas[area]&&individualEye!=='all'?individualEye:null;
function activeOrDefault(area,position=individualEye){
  const field=eyeAreas[area];
  if(field&&position!=='all'){
    const override=state.design.eyes.positions?.[position]?.[field];
    if(override!==undefined)return override;
  }
  return state.design.paints[area]??(area==='quietZone'?state.design.paints.background:
    area==='finderLight'||area==='separator'?state.design.paints.background:state.design.paints.data);
}
function isCustom(area,position=individualEye){
  return eyeAreas[area]&&position!=='all'?
    Object.hasOwn(state.design.eyes.positions?.[position]??{},eyeAreas[area]):Object.hasOwn(state.design.paints,area);
}
function writePaint(area,value,position=individualEye){
  if(eyeAreas[area]&&position!=='all'){
    state.design.eyes.positions??={};state.design.eyes.positions[position]??={};
    state.design.eyes.positions[position][eyeAreas[area]]=value;
  }else state.design.paints[area]=value;
}
function deletePaint(area,position=individualEye){
  if(eyeAreas[area]&&position!=='all')delete state.design.eyes.positions?.[position]?.[eyeAreas[area]];
  else delete state.design.paints[area];
}
function paintTarget(){return activeOrDefault(activePaint);}
function paintEditingLabel(area=activePaint){return paintLabels[area]+(eyePosition(area)?` · ${individualEye.replace(/([A-Z])/g,' $1')}`:'');}
function eyeOverrideSummary(){const names={topLeft:'Top-left',topRight:'Top-right',bottomLeft:'Bottom-left'};
  return Object.entries(state.design.eyes.positions??{}).filter(([,v])=>Object.keys(v).length)
    .map(([key,v])=>`${names[key]} (${Object.keys(v).map(k=>k.replace('Color',' color')).join(', ')})`).join('; ');
}
function beginHistory(group=''){if(group&&group===lastHistoryGroup)return;undo.push(copy(state));if(undo.length>35)undo.shift();redo=[];lastHistoryGroup=group;updateUndoButtons();}
function change(fn,{history=true,group='',refresh=false}={}){
  const oldBg=copy(state.design.paints.background);
  if(history)beginHistory(group);
  fn();
  const newBg=state.design.paints.background;
  if(newBg==='transparent' && oldBg!=='transparent')lastOpaqueBackground=oldBg;
  else if(newBg!=='transparent')lastOpaqueBackground=copy(newBg);
  if(refresh)refreshControls();
  // Even when a control updates without a full form refresh, background mode must stay in sync.
  $('transparentBg').checked=newBg==='transparent';
  updateQuickSwatches();if(pickerContext?.kind==='shadow')renderShadowState();if(['motion','motionPalette'].includes(pickerContext?.kind))renderMotionState();scheduleRender();
}
function resetHistoryGroup(){lastHistoryGroup='';}
function updateUndoButtons(){$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;}
function undoDoc(){if(!undo.length)return;redo.push(copy(state));state=undo.pop();logoLoadToken++;artworkLoadToken++;patternLoadToken++;paletteExtractToken++;logoProcessToken++;resetHistoryGroup();refreshControls();scheduleRender();updateUndoButtons();}
function redoDoc(){if(!redo.length)return;undo.push(copy(state));state=redo.pop();logoLoadToken++;artworkLoadToken++;patternLoadToken++;paletteExtractToken++;logoProcessToken++;resetHistoryGroup();refreshControls();scheduleRender();updateUndoButtons();}
function status(message,error=false){const node=$('renderStatus');node.classList.toggle('error',error);node.textContent='';const dot=document.createElement('span');dot.className='tiny-dot';node.append(dot,document.createTextNode(' '+message));previewStatus=message;}
function showError(error){
  // Invalidate outstanding asynchronous image analyses as soon as the preview fails.
  contrastToken++;if(contrastTimer){clearTimeout(contrastTimer);contrastTimer=null;}
  $('rasterContrast').textContent='Pixel contrast not tested: fix the QR content or settings.';
  $('scanResult').textContent='';
  qr=null;currentStyle=null;$('qrDisplay').replaceChildren();$('previewError').hidden=false;
  $('previewError').textContent=error?.message||String(error);status('Needs attention',true);$('download').disabled=true;
  for(const id of ['metaVersion','metaMatrix','metaEcc','metaMask'])$(id).textContent='—';$('warnings').replaceChildren();$('warningSummary').textContent='';}
const defaultArtwork=()=>({dataUrl:'',name:'',mode:'background',fit:'cover',x:.5,y:.5,zoom:1,aspectRatio:1,rotation:0,opacity:1,
  dataSource:null,dataFrame:{fit:'cover',x:.5,y:.5,zoom:1,rotation:0,opacity:1},protection:false,protectionStrength:.85,
  background:{brightness:1.25,contrast:1,saturation:1,blur:0,tint:'#ffffff',tintOpacity:.3,blendMode:'normal',posterize:0},
  data:{brightness:.55,contrast:1.2,saturation:1.1,blur:0,tint:'#000000',tintOpacity:.45,blendMode:'normal',posterize:0}});
const defaultShadows={
  soft:{color:'#000000',opacity:.55,blur:.28,offsetX:.35,offsetY:.35},
  hard:{color:'#000000',opacity:.72,blur:0,offsetX:.45,offsetY:.45},
  glow:{color:'#ffffff',opacity:.72,blur:.48,offsetX:0,offsetY:0}
};
function artworkLayers(art){
  if(!art)return null;
  const base={dataUrl:art.dataUrl,fit:art.fit,x:art.x,y:art.y,zoom:art.zoom,aspectRatio:art.aspectRatio,
    rotation:art.rotation??0,opacity:art.opacity??1};
  const separate=art.dataSource;
  const dataFrame={...base,...(art.dataFrame??{}),dataUrl:separate?.dataUrl??art.dataUrl,aspectRatio:separate?.aspectRatio??art.aspectRatio};
  const lock=art.protection?{toneStrength:art.protectionStrength??.85}:{};
  return { ...(art.mode!=='modules'?{background:{...base,...art.background,...lock,...(art.protection?{tone:'light'}:{})}}:{}),
    ...(art.mode!=='background'?{data:{...dataFrame,...art.data,...lock,...(art.protection?{tone:'dark'}:{})}}:{}) };
}
function activeArtFrame(art=state.design.artwork){if(!art)return null;return artworkEditLayer==='background'?art:art.dataFrame;}
/** Strict validation also applies to every untrusted JSON import, before updating the state. */
function validateArtwork(a){
  if(a==null)return null;
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  if(!object(a)||!['background','modules','dual'].includes(a.mode)||!['cover','contain'].includes(a.fit))throw Error('Invalid artwork options');
  if(Object.keys(a).some(k=>!['dataUrl','name','mode','fit','x','y','zoom','aspectRatio','rotation','opacity','dataSource','dataFrame','protection','protectionStrength','background','data'].includes(k)))throw Error('Unknown artwork property');
  if(typeof a.name!=='string'||a.name.length>200)throw Error('Invalid artwork filename');
  validateImageDataUrl(a.dataUrl);
  if(a.dataSource!=null){
    if(!object(a.dataSource)||Object.keys(a.dataSource).some(k=>!['dataUrl','name','aspectRatio'].includes(k)))throw Error('Invalid separate pattern image');
    if(typeof a.dataSource.name!=='string'||a.dataSource.name.length>200)throw Error('Invalid pattern image filename');
    validateImageDataUrl(a.dataSource.dataUrl);
  }
  if(a.protection!==undefined&&typeof a.protection!=='boolean')throw Error('Invalid contrast protection');
  const source={...defaultArtwork(),...copy(a),background:{...defaultArtwork().background,...a.background},data:{...defaultArtwork().data,...a.data},
    dataFrame:{...defaultArtwork().dataFrame,...(a.dataFrame??{})}};
  const valid=artworkLayers({...source,mode:'dual'});
  normalizeImages(valid);
  // Validate both the unprotected and protected forms. All values remain normalized downstream.
  normalizeImages(artworkLayers({...source,mode:'dual',protection:true}));
  if(!['cover','contain'].includes(source.dataFrame.fit))throw Error('Invalid pattern image fit');
  return source;
}
/** Treat imported designs as untrusted data: validate every value before touching DOM/CSS.
 * In particular, paints may be assigned to CSS preview swatches even before SVG validation.
 */
function validateDocument(doc){
  const object=(v)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const allowed=(value,options,name)=>{if(!options.includes(value))throw Error(`Invalid ${name}`);return value;};
  const integer=(v,min,max,name)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error(`Invalid ${name}`);return v;};
  const bounded=(v,min,max,name)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`Invalid ${name}`);return v;};
  const next=defaults();
  if(!object(doc)||!object(doc.content)||!object(doc.technical)||!object(doc.design))throw Error('Design data is incomplete');
  next.contentKind=allowed(doc.contentKind,['text','url','wifi','vcard','email','sms','phone','geo'],'content type');
  next.qrKind=allowed(doc.qrKind,['standard','micro','rmqr'],'QR type');
  for(const [key,value] of Object.entries(next.content)){
    const supplied=doc.content[key]===undefined?value:doc.content[key];
    if(key==='hidden'){if(typeof supplied!=='boolean')throw Error('Invalid Wi-Fi hidden option');}
    else if(typeof supplied!=='string'||supplied.length>100000)throw Error('Invalid content field: '+key);
    next.content[key]=supplied;
  }
  allowed(next.content.security,['WPA','WEP','nopass'],'Wi-Fi security');
  const versions=(kind)=>kind==='standard'?[...Array.from({length:40},(_,i)=>String(i+1))]:
    kind==='micro'?['M1','M2','M3','M4']:Object.keys(RMQR_VERSIONS);
  for(const kind of ['standard','micro','rmqr']){
    const src=doc.technical[kind]??{};
    if(!object(src))throw Error('Invalid '+kind+' technical settings');
    for(const [key,def] of Object.entries(next.technical[kind])){
      const raw=src[key]===undefined?def:src[key],v=typeof raw==='number'?String(raw):raw;
      if(key==='version')next.technical[kind][key]=allowed(v,['auto',...versions(kind)],kind+' version');
      else if(key==='mask')next.technical[kind][key]=allowed(v,['auto',...Array.from({length:kind==='micro'?4:8},(_,i)=>String(i))],kind+' mask');
      else if(key==='errorCorrection')next.technical[kind][key]=allowed(v,kind==='standard'?['L','M','Q','H']:kind==='micro'?['auto','none','L','M','Q']:['M','H'],kind+' correction');
      else if(key==='mode')next.technical[kind][key]=allowed(v,kind==='standard'?['auto','numeric','alphanumeric','byte','kanji','hanzi']:['auto','numeric','alphanumeric','byte'],kind+' encoding mode');
      else if(key==='charset')next.technical[kind][key]=allowed(v,kind==='micro'?['auto','utf-8','iso-8859-1']:['utf-8','iso-8859-1','shift-jis','gb2312'],'character set');
      else if(key==='eci')next.technical[kind][key]=allowed(v,['none','auto','26','3','20','29'],'ECI setting');
      else if(key==='fit')next.technical[kind][key]=allowed(v,['balanced','min-width','min-height','min-area'],'rMQR fit');
      else if(['optimizeSegments','enableHanzi'].includes(key)){
        if(typeof raw!=='boolean')throw Error('Invalid segment optimization settings');
        next.technical[kind][key]=raw;
      }
      else if(key==='boostErrorCorrection'){
        if(typeof raw!=='boolean')throw Error('Invalid error correction boost');
        next.technical[kind][key]=raw;
      }
    }
  }
  const d=doc.design;
  next.design.size=integer(d.size,64,8192,'export width');
  next.design.quietZone=integer(d.quietZone,0,32,'quiet zone');
  next.design.moduleScale=bounded(d.moduleScale,.45,1,'module coverage');
  next.design.cornerRadius=bounded(d.cornerRadius,0,.5,'corner rounding');
  next.design.shape=allowed(d.shape,['square','rounded','circle','diamond','horizontal','vertical','connected-rounded'],'module shape');
  if(!object(d.paints)||!Object.hasOwn(d.paints,'data')||!Object.hasOwn(d.paints,'background'))
    throw Error('Design is missing QR and background paint');
  next.design.paints=copy(d.paints);
  next.design.eyes=copy(d.eyes);
  if(d.logo!=null){
    const l=d.logo;if(!object(l))throw Error('Invalid logo');
    const name=typeof l.name==='string'?l.name.slice(0,200):'Uploaded logo';
    next.design.logo={name,dataUrl:l.dataUrl,processedUrl:l.processedUrl??null,
      size:bounded(l.size,.04,.30,'logo size'),padding:bounded(l.padding,0,4,'logo padding'),
      rounding:bounded(l.rounding,0,.5,'logo rounding'),
      backing:allowed(l.backing,['match','transparent','white','custom'],'logo backing'),
      backingColor:l.backingColor,clearModules:l.clearModules,removeWhite:l.removeWhite,
      whiteTolerance:integer(l.whiteTolerance,160,254,'logo white threshold')};
    if(typeof l.clearModules!=='boolean'||typeof l.removeWhite!=='boolean')throw Error('Invalid logo switches');
    if(!validHex(l.backingColor))throw Error('Invalid custom logo backing');
  }
  next.design.artwork=validateArtwork(d.artwork??null);
  next.design.shadows=copy(normalizeShadows(d.shadows??{})??{});
  next.design.motion=copy(normalizeMotion(d.motion??null));
  if(d.frame!=null){normalizeStyle({frame:d.frame});next.design.frame=copy(d.frame);}
  next.format=allowed(doc.format,['png','svg','animated-svg','apng','jpeg','webp','pdf','eps'],'download format');
  if(doc.print!=null){if(!object(doc.print))throw Error('Invalid print preferences');
    next.print={widthMm:bounded(doc.print.widthMm,5,1500,'print width'),marginMm:bounded(doc.print.marginMm,0,100,'print margin'),svgPhysical:!!doc.print.svgPhysical};
    if(typeof doc.print.svgPhysical!=='boolean')throw Error('Invalid SVG print option');}
  if(typeof doc.filename!=='string'||doc.filename.length>256)throw Error('Invalid filename');
  next.filename=doc.filename;
  next.quality=bounded(doc.quality,0,1,'image quality');
  if(!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(doc.jpegMatte))throw Error('Invalid JPEG background');
  next.jpegMatte=doc.jpegMatte;
  const l=next.design.logo;
  normalizeStyle({size:next.design.size,quietZone:next.design.quietZone,shape:next.design.shape,
    moduleScale:next.design.moduleScale,cornerRadius:next.design.cornerRadius,
    paints:next.design.paints,eyes:next.design.eyes,
    logo:l?{dataUrl:l.processedUrl??l.dataUrl,size:l.size,padding:l.padding,
      rounding:l.rounding,background:l.backing==='custom'?l.backingColor:l.backing==='white'?'#ffffff':l.backing,
      clearModules:l.clearModules}:null,images:artworkLayers(next.design.artwork),shadows:next.design.shadows,motion:next.design.motion});
  return next;
}
function makePayload(){const row=batchController?.getPreview();if(batchController?.mode==='batch')return String(row?.data??'');const c=state.content;switch(state.contentKind){
  case 'text':return c.text;
  case 'url':return payloads.url(c.url);
  case 'wifi':return payloads.wifi({ssid:c.ssid,password:c.password,security:c.security,hidden:c.hidden});
  case 'vcard':return payloads.vcard({firstName:c.firstName,lastName:c.lastName,organization:c.organization,phone:c.contactPhone,email:c.contactEmail});
  case 'email':return payloads.email({to:c.emailTo,subject:c.emailSubject,body:c.emailBody});
  case 'sms':return payloads.sms({to:c.smsTo,message:c.smsBody});
  case 'phone':return payloads.telephone(c.phone);
  case 'geo':return payloads.geo({latitude:c.latitude===''?null:c.latitude,longitude:c.longitude===''?null:c.longitude});
  default:return c.text;
}}
function normalizedEncoding(kind=state.qrKind,override={}){
  const v={...copy(state.technical[kind]),...override};
  if(v.version!=='auto'&&kind==='standard')v.version=Number(v.version);
  if(Object.hasOwn(v,'mask')&&v.mask!=='auto')v.mask=Number(v.mask);
  if(kind==='standard'&&v.eci!=='none'&&v.eci!=='auto')v.eci=Number(v.eci);
  return v;
}
function encodeOptions(){
  const row=batchController?.getPreview(),kind=batchController?.mode==='batch'?(row?.kind??state.qrKind):state.qrKind;
  return {kind,...normalizedEncoding(kind,row?.encoding??{})};
}

function styleFromDesign(d){let logo=null;
  if(d.logo){const l=d.logo;logo={dataUrl:l.processedUrl??l.dataUrl,size:l.size,padding:l.padding,rounding:l.rounding,
    background:l.backing==='white'?'#ffffff':l.backing==='custom'?l.backingColor:l.backing,clearModules:l.clearModules};}
  return {size:d.size,quietZone:d.quietZone,foreground:'#172554',background:'#ffffff',
    shape:d.shape,moduleScale:d.moduleScale,cornerRadius:d.cornerRadius,paints:d.paints,
    eyes:d.eyes,logo,images:artworkLayers(d.artwork),shadows:d.shadows,frame:d.frame,motion:d.motion};
}
function baseStyleOptions(){return styleFromDesign(state.design);}
// Same nested-override rules as src/batch.js normalizeRecord(). Previewing one
// batch row must never mutate or replace the shared batch design.
function styleOptions(){
  const base=baseStyleOptions(),override=batchController?.mode==='batch'?batchController.getPreview()?.style:null;
  if(!override)return base;
  return {...base,...override,...(override.paints?{paints:{...base.paints,...override.paints}}:{}),
    ...(override.images?{images:{...base.images,...override.images}}:{}),
    ...(override.shadows?{shadows:{...base.shadows,...override.shadows}}:{})};
}
function scheduleRender(){if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;renderPreview();});}
function renderPreview(){scanToken++;try{
    currentPayload=makePayload();const opts=encodeOptions(),key=JSON.stringify([currentPayload,opts]);
    if(!qr||key!==lastEncodingKey){qr=generateQR(currentPayload,opts);lastEncodingKey=key;}
    currentStyle=styleOptions();const previous=q('#qrDisplay svg');
    const previousTime=previous?.getCurrentTime?.()??0;
    const hasMotion=currentStyle.motion?.type!=='none';
    const svg=hasMotion?renderAnimatedSVG(qr,currentStyle):renderSVG(qr,currentStyle);
    $('qrDisplay').innerHTML=svg;$('previewError').hidden=true;status('Up to date');$('download').disabled=false;updateAPNGEstimate();
    syncMotionPlayback(previousTime);
    const m=qr.metadata;$('metaVersion').textContent=m.version;$('metaMatrix').textContent=`${m.width} × ${m.height}`;
    $('metaEcc').textContent=m.errorCorrection;$('metaMask').textContent=m.mask;
    const warnings=analyzeDesign(qr,currentStyle),ul=$('warnings');ul.replaceChildren();
    $('warningSummary').textContent=warnings.length>3?`${warnings.length} warnings · scroll the list to review details.`:'';
    if(!warnings.length){const li=document.createElement('li');li.className='good';li.textContent='No obvious design risks detected. Test before printing.';ul.append(li);}
    else for(const warning of warnings){const li=document.createElement('li');li.textContent=warning.message;ul.append(li);}
    $('scanResult').textContent='';updatePaintTip();queueContrastSampling();if(compareSnapshot)renderComparison();
  }catch(error){lastEncodingKey='';showError(error);}
}
function queueContrastSampling(){
  const id=++contrastToken;
  if(contrastTimer)clearTimeout(contrastTimer);
  if(!qr||!currentStyle)return;
  const hasArt=!!currentStyle.images?.background||!!currentStyle.images?.data;
  $('rasterContrast').textContent=hasArt?'Analyzing final image contrast locally…':'Pixel contrast is checked when you test the design.';
  if(!hasArt)return;
  contrastTimer=setTimeout(async()=>{
    try{
      const reference=qr,style={...currentStyle,size:420},canvas=await toCanvas(reference,style);
      const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);
      const res=sampleRasterContrast(reference,pixels,{quietZone:currentStyle.quietZone,matte:previewSurface==='dark'?'#202c45':'#ffffff',frame:currentStyle.frame});
      if(id!==contrastToken)return;
      $('rasterContrast').textContent=`${res.polarity==='inverted'?'Inverted QR · visual light/dark difference':'Pixel contrast'}: ${res.contrastRatio.toFixed(1)}:1 · scan-risk rating: ${res.score}${res.polarity==='inverted'?' (light modules on dark background; some cameras reject this)':''} · ${(res.centerMatch*100).toFixed(1)}% geometry agreement. Not a camera scan.`;
    }catch(e){if(id===contrastToken)$('rasterContrast').textContent='Contrast analysis unavailable: '+e.message;}
  },480);
}
const field=(id,label,type='text',extra='')=>`<div class="field"><label for="field-${id}">${label}</label><input id="field-${id}" data-content-field="${id}" type="${type}" ${extra}></div>`;
function renderPayloadFields(){const kind=state.contentKind,p=$('payloadFields');
  if(kind==='text')p.innerHTML=`<div class="field"><label for="field-text">Text to encode</label><textarea id="field-text" data-content-field="text" spellcheck="false" placeholder="Paste text, URL, or any Unicode content"></textarea></div>`;
  else if(kind==='url')p.innerHTML=field('url','Website URL','url','placeholder="https://example.com"');
  else if(kind==='wifi')p.innerHTML=`<div class="field-row">${field('ssid','Network name (SSID)')}${field('password','Wi-Fi password','text')}</div><div class="field-row"><div class="field"><label for="field-security">Security</label><select id="field-security" data-content-field="security"><option>WPA</option><option>WEP</option><option>nopass</option></select></div><label class="toggle-label"><input type="checkbox" id="field-hidden" data-content-field="hidden"> Hidden network</label></div>`;
  else if(kind==='vcard')p.innerHTML=`<div class="field-row">${field('firstName','First name')}${field('lastName','Last name')}</div>${field('organization','Organization')}
    <div class="field-row">${field('contactPhone','Phone','tel')}${field('contactEmail','Email','email')}</div>`;
  else if(kind==='email')p.innerHTML=`${field('emailTo','Recipient','email')}${field('emailSubject','Subject')}<div class="field"><label for="field-emailBody">Message</label><textarea id="field-emailBody" data-content-field="emailBody"></textarea></div>`;
  else if(kind==='sms')p.innerHTML=`${field('smsTo','Phone number','tel')}<div class="field"><label for="field-smsBody">SMS body</label><textarea id="field-smsBody" data-content-field="smsBody"></textarea></div>`;
  else if(kind==='phone')p.innerHTML=field('phone','Phone number','tel');
  else if(kind==='geo')p.innerHTML=`<div class="field-row">${field('latitude','Latitude','number','step="any" min="-90" max="90"')}${field('longitude','Longitude','number','step="any" min="-180" max="180"')}</div>`;
  for(const input of p.querySelectorAll('[data-content-field]')){
    const key=input.dataset.contentField;if(input.type==='checkbox')input.checked=!!state.content[key];else input.value=state.content[key]??'';
    input.addEventListener('input',()=>{change(()=>state.content[key]=input.type==='checkbox'?input.checked:input.value,{group:`field-${key}`});});
  }
  const hints={text:'Any plain text, URL, emoji, or Unicode. The QR contains exactly what you type.',url:'Most scanners will offer to open this URL.',wifi:'Scanning may offer to connect to the specified Wi-Fi network.',vcard:'Creates a vCard 3.0 contact compatible with many scanners.',email:'Creates a mailto link; messages are not sent until the scanner user confirms.',sms:'Creates an SMS draft; messages are not sent automatically.',phone:'Creates a telephone link.',geo:'Creates geo: coordinates. Location is not looked up or transmitted.'};
  $('contentHint').textContent=hints[kind];
}
function techField(label,id,html){return `<div class="field"><label for="tech-${id}">${label}</label>${html}</div>`;}
function optionSelect(id,options){return `<select data-tech="${id}" id="tech-${id}">${options.map(([v,label])=>`<option value="${v}">${label}</option>`).join('')}</select>`;}
function renderTechnical(){const k=state.qrKind,t=state.technical[k],p=$('technicalOptions'),versionOptions=[];
  if(k==='standard'){
    versionOptions.push(['auto','Automatic — smallest that fits'],...Array.from({length:40},(_,i)=>[String(i+1),`Version ${i+1} · ${21+4*i}×${21+4*i}`]));
    p.innerHTML=`<div class="control-grid two-controls">${techField('Error correction','errorCorrection',optionSelect('errorCorrection',[['L','L · 7%'],['M','M · 15%'],['Q','Q · 25%'],['H','H · 30%']]))}
    ${techField('QR version','version',optionSelect('version',versionOptions))}</div>
    <div class="control-grid two-controls">${techField('Mask pattern','mask',optionSelect('mask',[['auto','Auto'],...Array.from({length:8},(_,i)=>[String(i),`Pattern ${i}`])]))}
    ${techField('Encoding mode','mode',optionSelect('mode',[['auto','Automatic'],['numeric','Digits only'],['alphanumeric','Alphanumeric'],['byte','Bytes'],['kanji','Kanji · Japanese'],['hanzi','Hanzi · Chinese']]))}</div>
    <div class="control-grid two-controls">${techField('Character set','charset',optionSelect('charset',[['utf-8','UTF-8'],['iso-8859-1','ISO-8859-1'],['shift-jis','Shift-JIS · Japanese'],['gb2312','GB2312 · Chinese']]))}
    ${techField('ECI mode','eci',optionSelect('eci',[['none','No ECI'],['auto','Automatic for selected charset'],['26','26 · UTF-8'],['3','3 · Latin-1'],['20','20 · Shift-JIS'],['29','29 · GB18030 family']]))}</div>
    <label class="toggle-label"><input type="checkbox" id="tech-boostErrorCorrection" data-tech="boostErrorCorrection"> Boost error correction when capacity permits</label>
    <label class="toggle-label"><input type="checkbox" id="tech-optimizeSegments" data-tech="optimizeSegments"> Optimize mixed encoding segments (smaller QR for mixed text)</label>
    <label class="toggle-label"><input type="checkbox" id="tech-enableHanzi" data-tech="enableHanzi"> Include Hanzi (GB2312) in automatic optimization · limited scanner support</label>`;
  }else if(k==='micro'){
    versionOptions.push(['auto','Automatic'],...['M1','M2','M3','M4'].map(v=>[v,`${v} · ${9+2*Number(v[1])}×${9+2*Number(v[1])}`]));
    p.innerHTML=`<div class="control-grid two-controls">${techField('Error correction','errorCorrection',optionSelect('errorCorrection', [['auto','Auto · choose legal level'],['none','None · M1 only'],['L','L · low'],['M','M · medium'],['Q','Q · M4 only']]))}
    ${techField('Micro version','version',optionSelect('version',versionOptions))}</div>
    <div class="control-grid two-controls">${techField('Micro mask','mask',optionSelect('mask',[['auto','Automatic'],...Array.from({length:4},(_,i)=>[String(i),`Pattern ${i}`])]))}
    ${techField('Encoding mode','mode',optionSelect('mode',[['auto','Automatic'],['numeric','Digits only'],['alphanumeric','Alphanumeric'],['byte','Bytes']]))}</div>
    <div class="control-grid two-controls">${techField('Character encoding','charset',optionSelect('charset',[
      ['auto','Automatic · Latin-1 when possible'],['iso-8859-1','ISO-8859-1 · Western text'],['utf-8','UTF-8 · international text']]))}</div>
    <p class="inline-note">M1 has no error correction. M2/M3 support L/M; M4 also supports Q. Micro QR does not support ECI, so some scanners may interpret UTF-8 characters differently.</p>`;
  }else{
    versionOptions.push(['auto','Automatic — best fit'],...Object.entries(RMQR_VERSIONS).map(([name,v])=>[name,`${name} · ${v.width}×${v.height}`]));
    p.innerHTML=`<div class="control-grid two-controls">${techField('Error correction','errorCorrection',optionSelect('errorCorrection',[['M','M · medium'],['H','H · high']]))}
    ${techField('Rectangular size','version',optionSelect('version',versionOptions))}</div>
    <div class="control-grid two-controls">${techField('Fit strategy','fit',optionSelect('fit',[['balanced','Balanced proportions'],['min-width','Narrowest'],['min-height','Shortest'],['min-area','Smallest area']]))}
    ${techField('Encoding mode','mode',optionSelect('mode',[['auto','Automatic'],['numeric','Digits only'],['alphanumeric','Alphanumeric'],['byte','Bytes']]))}</div>
    <p class="inline-note">All 32 rMQR sizes use a fixed mask. Some phone cameras cannot read rectangular QR codes.</p>`;
  }
  $('structuredPanel').hidden=k!=='standard';
  for(const input of p.querySelectorAll('[data-tech]')){
    const key=input.dataset.tech;input.type==='checkbox'?input.checked=!!t[key]:input.value=String(t[key]);
    input.addEventListener('input',()=>change(()=>state.technical[state.qrKind][key]=input.type==='checkbox'?input.checked:input.value));
  }
}
function setSurface(surface){previewSurface=surface;$('previewViewport').classList.remove('backdrop-light','backdrop-dark','backdrop-checker');
  $('previewViewport').classList.add('backdrop-'+surface);qa('[data-surface]').forEach(b=>b.classList.toggle('surface-selected',b.dataset.surface===surface));queueContrastSampling();}
function paintMode(p){return typeof p==='string'?(p==='transparent'?'transparent':'solid'):p.type;}
const NORMAL_PAINT_TIP='Click a swatch to open the precision color picker. Dragging updates the code immediately.';
function updatePaintTip(){
  const tip=$('labTip');if(!tip)return;
  const art=state.design.artwork;
  if(art&&activePaint==='data'&&art.mode!=='background'){
    tip.textContent='The uploaded photo sits over these dark data modules. Change the visible photo under Images & shadows; this base color appears when you remove the photo or lower its opacity.';return;
  }
  if(art&&activePaint==='background'&&art.mode!=='modules'){
    tip.textContent='The photo covers the matrix background. This color remains the backing beneath the image, and can still be used for the quiet zone.';return;
  }
  if(!qr||['data','background','quietZone'].includes(activePaint)){tip.textContent=NORMAL_PAINT_TIP;return;}
  let hasRole=false;
  for(let y=0;y<qr.matrix.height&&!hasRole;y++)for(let x=0;x<qr.matrix.width;x++){
    if(qr.matrix.getRole(x,y)===activePaint){hasRole=true;break;}
    if(activePaint==='finderLight'&&qr.matrix.getRole(x,y)==='finder'){hasRole=true;break;}
  }
  tip.textContent=hasRole?NORMAL_PAINT_TIP:`This ${qr.metadata.kind} symbol has no ${paintLabels[activePaint].toLowerCase()} to recolor. The setting will remain available for other code types or versions.`;
}
function refreshControls(){
  qa('[data-content-kind]').forEach(b=>b.classList.toggle('active',b.dataset.contentKind===state.contentKind));renderPayloadFields();
  qa('[data-qr-kind]').forEach(b=>b.classList.toggle('selected',b.dataset.qrKind===state.qrKind));
  const notes={standard:'Standard QR supports versions 1–40 and is the recommended choice for most applications.',micro:'Micro QR has one finder eye, four versions (M1–M4), and reduced scanner compatibility.',rmqr:'Rectangular QR supports 32 sizes, two correction levels, and requires compatible scanning software.'};
  $('kindNote').textContent=notes[state.qrKind];
  qa('[data-shape]').forEach(b=>b.classList.toggle('selected',b.dataset.shape===state.design.shape));
  $('moduleScale').value=Math.round(state.design.moduleScale*100);$('cornerRadius').value=Math.round(state.design.cornerRadius*100);
  $('moduleScaleValue').textContent=`${$('moduleScale').value}%`;$('cornerRadiusValue').textContent=`${$('cornerRadius').value}%`;
  $('transparentBg').checked=state.design.paints.background==='transparent';
  $('outerShape').value=state.design.eyes.outerShape;$('innerShape').value=state.design.eyes.innerShape;
  // Rectangular QR uses nonstandard finder geometry: shape overlays would corrupt it.
  $('eyePanel').hidden=state.qrKind==='rmqr';
  for(const key of ['topRight','bottomLeft'])$('individualEye').querySelector(`option[value="${key}"]`).disabled=state.qrKind!=='standard';
  if(state.qrKind!=='standard' && ['topRight','bottomLeft'].includes(individualEye)) individualEye='all';
  $('individualEye').value=individualEye;
  $('clearAllEyeOverrides').disabled=!Object.values(state.design.eyes.positions??{}).some(value=>Object.keys(value).length);
  const selectedEye=individualEye==='all'?state.design.eyes:state.design.eyes.positions[individualEye]??state.design.eyes;
  $('outerShape').value=selectedEye.outerShape??state.design.eyes.outerShape;
  $('innerShape').value=selectedEye.innerShape??state.design.eyes.innerShape;
  const overrides=eyeOverrideSummary();
  $('eyeNote').textContent=(state.qrKind==='micro'?'Micro QR has only the top-left finder eye. ':
    individualEye==='all'?'Shared settings affect every finder without an individual override. ':'Settings affect '+individualEye+' only. ')+
    (overrides?`Active overrides: ${overrides}.`:'No individual overrides.');
  for(const [name,label] of [['topLeft','Top-left'],['topRight','Top-right'],['bottomLeft','Bottom-left']])
    $('individualEye').querySelector(`option[value="${name}"]`).textContent=label+((state.design.eyes.positions?.[name]&&Object.keys(state.design.eyes.positions[name]).length)?' • override':'');
  if(state.qrKind==='rmqr'&&shadowTarget==='finder')shadowTarget='modules';
  $('shadowTarget').querySelector('option[value="finder"]').disabled=state.qrKind==='rmqr';
  setSurface(previewSurface);
  renderArtworkState();renderShadowState();renderFrameState();renderMotionState();
  $('exportSize').value=state.design.size;$('quietZone').value=state.design.quietZone;
  $('fileQuality').value=Math.round(state.quality*100);$('qualityValue').textContent=Math.round(state.quality*100)+'%';
  $('filename').value=state.filename;$('format').value=state.format;
  $('printWidthMm').value=state.print.widthMm;$('printMarginMm').value=state.print.marginMm;$('svgPhysicalSize').checked=state.print.svgPhysical;
  updateFormatUI();renderTechnical();renderLogoState();renderPaintEditor();updateQuickSwatches();updateUndoButtons();
}
function updateQuickSwatches(){for(const [id,area] of [['quickDataColor','data'],['quickBgColor','background']]){
    const node=$(id)?.querySelector('.swatch-display');if(node)node.style.background=cssPaint(activeOrDefault(area));
  }
  const matte=$('jpegMatteButton')?.querySelector('.swatch-display');if(matte)matte.style.background=state.jpegMatte;
  const swatch=$('paintPreview')?.querySelector('span');if(swatch){const paint=activeOrDefault(activePaint);
    swatch.style.background=cssPaint(typeof paint==='string'?paint:paint.stops[Math.min(selectedStop,paint.stops.length-1)].color);}
  if($('gradientBar'))$('gradientBar').style.background=cssPaint(activeOrDefault(activePaint));
  qa('.gradient-handle').forEach((node,i)=>{const p=activeOrDefault(activePaint);if(typeof p!=='string'&&p.stops[i])node.style.left=`${p.stops[i].offset*100}%`;});
  const grad=activeOrDefault(activePaint);
  if(typeof grad!=='string')qa('.gradient-stop-card').forEach((node,i)=>{const stop=grad.stops[i];if(!stop)return;
    node.querySelector('.stop-swatch').style.background=stop.color;
    node.querySelector('small').textContent=`${Math.round(stop.offset*100)}% · ${stop.color.toUpperCase()}`;
  });
}
function enablePaint(area,position=individualEye){if(!isCustom(area,position))writePaint(area,copy(activeOrDefault(area,position)),position);}
function changePaintMode(mode){change(()=>{
  enablePaint(activePaint);const p=activeOrDefault(activePaint),flat=typeof p==='string'?(p==='transparent'?'#172554':p):p.stops[0].color;
  if(mode==='transparent')writePaint(activePaint,'transparent');
  else if(mode==='solid')writePaint(activePaint,flat);
  else{
    const stops=typeof p==='string'?[{offset:0,color:flat},{offset:1,color:flat==='#ffffff'?'#dbeafe':'#3b82f6'}]:copy(p.stops);
    writePaint(activePaint,{type:mode,stops,space:eyePosition(activePaint)?'eye':'global',...(mode==='linear'?{angle:0}:{cx:.5,cy:.5,radius:.71})});
  }
  selectedStop=0;
}, {refresh:false});renderPaintEditor();}
function renderPaintEditor(){
  $('paintArea').value=activePaint;const p=activeOrDefault(activePaint),custom=isCustom(activePaint);
  $('paintArea').setAttribute('aria-label','Editing '+paintEditingLabel());
  $('paintMode').value=paintMode(p);
  $('inheritRow').hidden=['data','background'].includes(activePaint);$('customPaint').checked=custom;
  $('paintMode').disabled=!custom;
  const host=$('paintEditor');host.replaceChildren();
  if(!custom){host.innerHTML=`<div class="quiet-tip">${paintEditingLabel()} currently inherits its shared color. Enable the override to customize it independently.</div>`;return;}
  if(typeof p==='string'){
    if(p==='transparent')host.innerHTML='<p class="quiet-tip">This layer is fully transparent, including in PNG, SVG and WebP exports.</p>';
    else host.innerHTML=`<div class="paint-solid"><button class="paint-preview-tile" id="paintPreview" type="button" data-picker="solid" aria-label="Change solid color"><span></span></button><div class="field color-hex"><label for="solidHex">Color (HEX / HEX8)</label><input id="solidHex" class="hex-field" autocomplete="off" spellcheck="false"></div><span class="micro-help">Click swatch to adjust hue, opacity & saturation.</span></div>`;
    if($('solidHex')){$('solidHex').value=p;$('solidHex').addEventListener('input',event=>{
      const color=validHex(event.target.value);if(!color)return;
      change(()=>writePaint(activePaint,color),{group:'solid-hex'});
    });}
  }else{
    selectedStop=Math.max(0,Math.min(selectedStop,p.stops.length-1));
    const parts=[`<div class="gradient-bar-wrap"><div class="gradient-bar" id="gradientBar" role="group" aria-label="Editable gradient stops"></div>`];
    for(const [i,s] of p.stops.entries())parts.push(`<button type="button" class="gradient-handle ${i===selectedStop?'selected':''}" data-stop="${i}" aria-label="Gradient stop ${i+1}, ${Math.round(s.offset*100)} percent" style="left:${s.offset*100}%"></button>`);
    parts.push('</div>');
    parts.push('<div class="gradient-stop-list" role="group" aria-label="Gradient colors; select a stop to edit">');
    for(const [i,stop] of p.stops.entries())parts.push(`<button type="button" class="gradient-stop-card ${i===selectedStop?'selected':''}" data-select-stop="${i}" aria-pressed="${i===selectedStop}" aria-label="Select stop ${i+1}, position ${Math.round(stop.offset*100)} percent, color ${stop.color}"><span class="stop-swatch" style="background:${stop.color}"></span><span class="stop-info"><strong>Stop ${i+1}${i===selectedStop?' · Editing':''}</strong><small>${Math.round(stop.offset*100)}% · ${stop.color.toUpperCase()}</small></span></button>`);
    parts.push('</div>');
    parts.push(`<div class="selected-stop-label" id="selectedStopLabel">Editing stop ${selectedStop+1} of ${p.stops.length} · ${paintEditingLabel()}</div>`);
    parts.push(`<div class="gradient-stop-row"><button type="button" class="paint-preview-tile" id="paintPreview" data-picker="stop" aria-label="Change color of selected gradient stop ${selectedStop+1}"><span></span></button>
      <div class="field"><label for="stopOffset">Position %</label><input id="stopOffset" type="number" min="0" max="100" step="1" value="${Math.round(p.stops[selectedStop].offset*100)}"></div>
      <button type="button" class="subtle-button" id="addStop">+ Stop</button><button type="button" class="remove-button" id="removeStop" ${p.stops.length<=2?'disabled':''}>Remove</button></div>`);
    parts.push(`<div class="field gradient-space-field"><label for="gradientSpace">Gradient scale</label><select id="gradientSpace"><option value="global">Entire QR</option><option value="component">Selected component group</option><option value="eye">Repeat in each finder eye</option><option value="module">Repeat in each module</option></select><p class="micro-help">Local scales spread the full gradient over the chosen area, not the entire QR.</p></div>`);
    if(p.type==='linear')parts.push(`<div class="field"><div class="label-row"><label for="gradientAngle">Gradient angle</label><output id="gradientAngleValue">${p.angle}°</output></div><input id="gradientAngle" type="range" min="-180" max="180" value="${p.angle}"></div>`);
    else parts.push(`<div class="gradient-params">${[['cx','Center X',0,100],['cy','Center Y',0,100],['radius','Radius',1,200]].map(([key,label,min,max])=>`<div class="field"><label for="param-${key}">${label}</label><input id="param-${key}" type="number" min="${min}" max="${max}" value="${Math.round(p[key]*100)}"></div>`).join('')}</div>`);
    host.innerHTML=parts.join('');
    $('gradientSpace').value=p.space??'global';
    $('gradientSpace').querySelector('option[value="eye"]').disabled=!Object.hasOwn(eyeAreas,activePaint);
    $('gradientSpace').querySelector('option[value="module"]').disabled=Object.hasOwn(eyeAreas,activePaint);
    $('gradientSpace').addEventListener('change',e=>change(()=>{paintTarget().space=e.target.value;},{refresh:false}));
    $('stopOffset').addEventListener('input',e=>moveStop(Number(e.target.value)/100,'stop-position'));
    $('addStop').addEventListener('click',()=>{const item=activeOrDefault(activePaint);if(item.stops.length>=8)return;
      change(()=>{const next=copy(item);const pos=selectedStop<next.stops.length-1?(next.stops[selectedStop].offset+next.stops[selectedStop+1].offset)/2:Math.max(0,next.stops[selectedStop].offset-.07);
        next.stops.push({offset:pos,color:next.stops[selectedStop].color});next.stops.sort((a,b)=>a.offset-b.offset);selectedStop=next.stops.findIndex(s=>s.offset===pos);writePaint(activePaint,next);});renderPaintEditor();});
    $('removeStop').addEventListener('click',()=>{if(itemStops().length<=2)return;change(()=>{const next=copy(activeOrDefault(activePaint));next.stops.splice(selectedStop,1);writePaint(activePaint,next);selectedStop=Math.min(selectedStop,next.stops.length-1);});renderPaintEditor();});
    if($('gradientAngle'))$('gradientAngle').addEventListener('input',e=>{const angle=Number(e.target.value);
      change(()=>paintTarget().angle=angle,{group:'gradient-angle'});$('gradientAngleValue').textContent=angle+'°';refreshPaintPreview();});
    for(const key of ['cx','cy','radius']){const el=$(`param-${key}`);if(!el)continue;el.addEventListener('input',()=>{
      change(()=>paintTarget()[key]=Math.min(key==='radius'?2:1,Math.max(key==='radius'?.01:0,number(el.value)/100)),{group:'radial-'+key});refreshPaintPreview();
    });}
    qa('[data-select-stop]').forEach(b=>b.addEventListener('click',()=>{selectedStop=Number(b.dataset.selectStop);renderPaintEditor();}));
    qa('.gradient-handle').forEach(node=>{
      node.addEventListener('pointerdown',event=>{
        selectedStop=Number(node.dataset.stop);resetHistoryGroup();beginHistory('drag-stop');node.setPointerCapture(event.pointerId);
        qa('.gradient-handle').forEach(n=>n.classList.toggle('selected',n===node));
        selectGradientStop();event.preventDefault();
      });
      node.addEventListener('pointermove',event=>{
        if(!node.hasPointerCapture(event.pointerId))return;
        const bar=$('gradientBar').getBoundingClientRect();moveStop((event.clientX-bar.left)/bar.width,'drag-stop');
      });
      node.addEventListener('pointerup',()=>{resetHistoryGroup();});
      node.addEventListener('click',()=>{selectedStop=Number(node.dataset.stop);renderPaintEditor();});
    });
    $('gradientBar').addEventListener('click',event=>{
      const r=event.currentTarget.getBoundingClientRect(),pos=(event.clientX-r.left)/r.width;
      const next=activeOrDefault(activePaint).stops.map(s=>Math.abs(s.offset-pos));selectedStop=next.indexOf(Math.min(...next));renderPaintEditor();
    });
  }
  $('paintPreview')?.querySelector('span')?.style.setProperty('background',cssPaint(typeof p==='string'?p:p.stops[selectedStop].color));
  updateQuickSwatches();updatePaintTip();
}
function itemStops(){const item=activeOrDefault(activePaint);return typeof item==='string'?[]:item.stops;}
function selectGradientStop(){const p=activeOrDefault(activePaint);const tile=$('paintPreview')?.querySelector('span');if(tile)tile.style.background=cssPaint(p.stops[selectedStop].color);
  if($('stopOffset'))$('stopOffset').value=Math.round(p.stops[selectedStop].offset*100);
  qa('.gradient-stop-card').forEach((card,i)=>{
    card.classList.toggle('selected',i===selectedStop);card.setAttribute('aria-pressed',String(i===selectedStop));
    const label=card.querySelector('strong');if(label)label.textContent=`Stop ${i+1}${i===selectedStop?' · Editing':''}`;
  });
  const label=$('selectedStopLabel');if(label)label.textContent=`Editing stop ${selectedStop+1} of ${p.stops.length} · ${paintEditingLabel()}`;
  if($('paintPreview'))$('paintPreview').setAttribute('aria-label',`Change color of selected gradient stop ${selectedStop+1}`);
}
function moveStop(pos,group){const p=activeOrDefault(activePaint);if(typeof p==='string')return;
  const prev=selectedStop>0?p.stops[selectedStop-1].offset+.002:0,
    next=selectedStop<p.stops.length-1?p.stops[selectedStop+1].offset-.002:1;
  const clamped=Math.max(prev,Math.min(next,Math.max(0,Math.min(1,Number(pos)))));
  change(()=>paintTarget().stops[selectedStop].offset=clamped,{group});
  if($('stopOffset'))$('stopOffset').value=Math.round(clamped*100);
  refreshPaintPreview();
  const selected=$(`[data-select-stop="${selectedStop}"]`);
  if(selected){const stop=p.stops[selectedStop];selected.querySelector('small').textContent=`${Math.round(clamped*100)}% · ${stop.color.toUpperCase()}`;}
}
function refreshPaintPreview(){updateQuickSwatches();
  const h=$('gradientAngleValue'),p=activeOrDefault(activePaint);
  if(h&&typeof p!=='string'&&p.type==='linear')h.textContent=p.angle+'°';
}
function validHex(text){const v=String(text).trim();if(!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(v))return null;
  const h=v.slice(1);return '#'+(h.length===3||h.length===4?[...h].map(ch=>ch+ch).join(''):h).toLowerCase();}
function parseRGBA(hex){const norm=validHex(hex)??'#172554',h=norm.slice(1);
  return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16),a:h.length===8?parseInt(h.slice(6,8),16)/255:1};}
function toHex({r,g,b,a=1}){const byte=v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');return '#'+byte(r)+byte(g)+byte(b)+(a<.999?byte(a*255):'');}
function rgbHSL({r,g,b}){
  const R=r/255,G=g/255,B=b/255,max=Math.max(R,G,B),min=Math.min(R,G,B),d=max-min,l=(max+min)/2;
  let h=0;if(d)h=max===R?60*((G-B)/d%6):max===G?60*((B-R)/d+2):60*((R-G)/d+4);
  return {h:(h+360)%360,s:d===0?0:d/(1-Math.abs(2*l-1)),l};
}
function hslRGB({h,s,l,a=1}){
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return {r:(r+m)*255,g:(g+m)*255,b:(b+m)*255,a};
}
const PALETTE_KEY='qr-studio-v2-saved-colors';
function loadSavedColors(){try{const raw=JSON.parse(localStorage.getItem(PALETTE_KEY)??'[]');return Array.isArray(raw)?raw.filter(c=>validHex(c)).slice(0,12):[];}catch{return [];}}
let savedColors=loadSavedColors();
function renderSavedColors(){const host=$('savedColors');host.replaceChildren(...savedColors.map(c=>{
  const button=document.createElement('button');button.type='button';button.title='Apply '+c;button.setAttribute('aria-label','Apply saved color '+c);
  button.style.background=cssPaint(c);button.addEventListener('click',()=>{pickerHSV=rgbHSV(parseRGBA(c));updatePickerColor('picker-saved');});return button;
}));}
function savePickedColor(){const color=toHex(hsvRGB(pickerHSV));savedColors=[color,...savedColors.filter(c=>c!==color)].slice(0,12);
  try{localStorage.setItem(PALETTE_KEY,JSON.stringify(savedColors));}catch{/* file:// storage may not be available */}
  renderSavedColors();}
function setPickerValueMode(mode){pickerValueMode=mode;
  $('pickerValueMode').value=mode;
  $('pickerHexGroup').hidden=mode!=='hex';$('pickerRgbGroup').hidden=mode!=='rgb';$('pickerHslGroup').hidden=mode!=='hsl';
  updatePickerUI();
}
function rgbHSV({r,g,b,a}){const R=r/255,G=g/255,B=b/255,max=Math.max(R,G,B),min=Math.min(R,G,B),d=max-min;
  let h=0;if(d)h=max===R?60*(((G-B)/d)%6):max===G?60*((B-R)/d+2):60*((R-G)/d+4);
  return {h:(h+360)%360,s:max===0?0:d/max,v:max,a};}
function hsvRGB({h,s,v,a}){const f=n=>{const k=(n+h/60)%6;return v-v*s*Math.max(Math.min(k,4-k,1),0);};
  return {r:f(5)*255,g:f(3)*255,b:f(1)*255,a};}
function colorValue(ctx){if(ctx.kind==='artTint')return state.design.artwork?.[ctx.target]?.tint??'#ffffff';
  if(ctx.kind==='shadow')return state.design.shadows?.[ctx.target]?.color??'#000000';
  if(ctx.kind==='motionPalette')return auroraPalette(normalizeMotion(state.design.motion))[ctx.index];
  if(ctx.kind==='motion')return state.design.motion?.color??'#1464ac';
  if(ctx.kind==='logo')return state.design.logo?.backingColor??'#ffffff';
  if(ctx.kind==='matte')return state.jpegMatte;
  if(ctx.kind==='eye')return state.design.eyes.positions?.[ctx.position]?.[ctx.field]??(ctx.field==='outerColor'?activeOrDefault('finder','all'):activeOrDefault('finderCenter','all'));
  const item=activeOrDefault(ctx.area,ctx.position??'all');return typeof item==='string'?item:item.stops[ctx.stop??selectedStop].color;
}
function assignColor(ctx,value){if(ctx.kind==='artTint'){if(state.design.artwork)state.design.artwork[ctx.target].tint=value;}
  else if(ctx.kind==='shadow'){if(state.design.shadows?.[ctx.target])state.design.shadows[ctx.target].color=value;}
  else if(ctx.kind==='motionPalette'){const m=state.design.motion;m.palette??=auroraPalette(normalizeMotion(m)).slice();m.palette[ctx.index]=value;if(ctx.index===1)m.color=value;}
  else if(ctx.kind==='motion')state.design.motion.color=value;
  else if(ctx.kind==='logo')state.design.logo.backingColor=value;
  else if(ctx.kind==='matte')state.jpegMatte=value;
  else if(ctx.kind==='eye'){
    state.design.eyes.positions??={};state.design.eyes.positions[ctx.position]??={};state.design.eyes.positions[ctx.position][ctx.field]=value;
  }else{
    enablePaint(ctx.area,ctx.position??'all');const current=activeOrDefault(ctx.area,ctx.position??'all');
    if(typeof current==='string')writePaint(ctx.area,value,ctx.position??'all');
    else current.stops[ctx.stop??selectedStop].color=value;
  }
}
function openPicker(ctx,button,title){
  // A floating dialog must have a reliable return focus target for keyboard users.
  pickerReturnFocus=button instanceof HTMLElement?button:document.activeElement;
  pickerContext=ctx;let val=colorValue(ctx);
  if(val==='transparent')val='#00000000';if(typeof val!=='string')val=val?.stops?.[0]?.color??'#172554';
  pickerHSV=rgbHSV(parseRGBA(val));$('pickerTitle').textContent=title||'Choose color';
  $('colorPopover').hidden=false;updatePickerUI();
  const pop=$('colorPopover'),r=button?.getBoundingClientRect()??{left:30,right:70,top:40,bottom:70};
  pop.style.left=`${Math.max(12,Math.min(window.innerWidth-pop.offsetWidth-12,r.left))}px`;
  pop.style.top=`${Math.max(12,Math.min(window.innerHeight-pop.offsetHeight-12,r.bottom+7))}px`;
  const initial=pickerValueMode==='rgb'?'pickerRed':pickerValueMode==='hsl'?'pickerHue':'pickerHex';
  $(initial).focus({preventScroll:true});$(initial).select();
}
function closePicker({restoreFocus=true}={}){
  if($('colorPopover').hidden)return;
  pickerContext=null;$('colorPopover').hidden=true;resetHistoryGroup();
  if(restoreFocus && pickerReturnFocus?.isConnected && !pickerReturnFocus.hidden && !pickerReturnFocus.closest('[hidden]'))
    pickerReturnFocus.focus({preventScroll:true});
  pickerReturnFocus=null;
}
function openPreviewDialog(){
  previewReturnFocus=document.activeElement;
  $('modalCode').innerHTML=isolatedSVG($('qrDisplay').innerHTML,'large-preview');
  $('previewModal').hidden=false;$('closePreview').focus({preventScroll:true});
}
function closePreviewDialog(){
  if($('previewModal').hidden)return;
  $('previewModal').hidden=true;
  if(previewReturnFocus?.isConnected)previewReturnFocus.focus({preventScroll:true});
  previewReturnFocus=null;
}
function updatePickerUI(){const hsv=pickerHSV,hex=toHex(hsvRGB(hsv));
  $('svPanel').style.background=`linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hsv.h} 100% 50%))`;
  $('svPointer').style.left=(hsv.s*100)+'%';$('svPointer').style.top=((1-hsv.v)*100)+'%';
  $('hueRange').value=Math.round(hsv.h);$('alphaRange').value=Math.round(hsv.a*100);
  $('pickerHex').value=hex;
  const rgb=hsvRGB(hsv),hsl=rgbHSL(rgb);
  $('pickerRed').value=Math.round(rgb.r);$('pickerGreen').value=Math.round(rgb.g);$('pickerBlue').value=Math.round(rgb.b);
  $('pickerHue').value=Math.round(hsl.h);$('pickerSat').value=Math.round(hsl.s*100);$('pickerLight').value=Math.round(hsl.l*100);
  $('pickerSwatch').style.background=cssPaint(hex);$('pickerAlphaText').textContent=Math.round(hsv.a*100)+'%';
  $('svPanel').setAttribute('aria-valuenow',String(Math.round(hsv.v*100)));
}
function updatePickerColor(group){if(!pickerContext)return;
  const hex=toHex(hsvRGB(pickerHSV));change(()=>assignColor(pickerContext,hex),{group});
  const tile=$('paintPreview')?.querySelector('span');if(tile){const p=activeOrDefault(activePaint);tile.style.background=cssPaint(typeof p==='string'?p:p.stops[selectedStop].color);}
  if(pickerContext?.kind==='shadow')renderShadowState();
  if(['motion','motionPalette'].includes(pickerContext?.kind))renderMotionState();
  updatePickerUI();}
function processLogo(){const logo=state.design.logo;if(!logo)return;
  const token=++logoProcessToken;delete logo.processedUrl;if(!logo.removeWhite){renderLogoState();scheduleRender();return;}
  removeLightBackground(logo.dataUrl,Math.round(logo.whiteTolerance)).then(url=>{
    if(token!==logoProcessToken||state.design.logo!==logo)return;
    logo.processedUrl=url;renderLogoState();scheduleRender();
  }).catch(e=>{if(token===logoProcessToken)$('downloadStatus').textContent=`Could not process logo: ${e.message}`;});
}
function renderLogoState(){const l=state.design.logo;
  $('logoPlaceholder').hidden=!!l;$('logoLoaded').hidden=!l;$('logoSettings').hidden=!l;
  if(!l)return;
  $('logoThumb').src=l.processedUrl??l.dataUrl;$('logoName').textContent=l.name||'Uploaded logo';
  $('logoSize').value=Math.round(l.size*100);$('logoSizeValue').textContent=Math.round(l.size*100)+'%';
  $('logoPadding').value=l.padding;$('logoPaddingValue').textContent=String(l.padding);
  $('logoRounding').value=Math.round(l.rounding*100);$('logoBacking').value=l.backing;
  $('logoCustomColorRow').hidden=l.backing!=='custom';
  $('clearBehindLogo').checked=l.clearModules;$('removeLogoWhite').checked=l.removeWhite;
  $('whiteToleranceRow').hidden=!l.removeWhite;$('whiteTolerance').value=l.whiteTolerance;
  $('whiteToleranceValue').textContent=l.whiteTolerance;
  $('logoCustomColor').style.borderLeft=`7px solid ${l.backingColor}`;
}
function renderArtworkState(){
  const a=state.design.artwork,loaded=!!a;
  $('artworkEmpty').hidden=loaded;$('artworkLoaded').hidden=!loaded;$('artworkSettings').hidden=!loaded;
  if(!loaded)return;
  $('artworkThumb').src=a.dataUrl;$('artworkName').textContent=a.name;
  qa('[data-artwork-mode]').forEach(b=>{const chosen=b.dataset.artworkMode===a.mode;b.classList.toggle('selected',chosen);b.setAttribute('aria-pressed',String(chosen));});
  $('artworkModeHint').textContent={background:'The picture appears behind the code. The quiet zone stays protected.',
    modules:'Only dark data modules use the photo; finder eyes remain conventional.',
    dual:'The background and pattern can use separate photographs and independent light/dark treatments.'}[a.mode];
  $('artworkBackgroundSettings').hidden=a.mode==='modules';$('artworkModuleSettings').hidden=a.mode==='background';
  $('artworkLayer').value=artworkEditLayer;
  $('artworkEditHint').textContent=`Editing ${artworkEditLayer==='data'?'QR-pattern':'background'} image framing. The two layers can be positioned independently.`;
  $('artSecondInfo').textContent=a.dataSource?`Pattern image: ${a.dataSource.name} · background is unchanged`:
    'QR pattern reuses the background photograph until you choose another.';
  $('removeArtSecond').hidden=!a.dataSource;
  const frame=activeArtFrame(a);$('artworkFit').value=frame.fit;
  for(const [key,id,mult] of [['zoom','artworkZoom',100],['x','artworkX',100],['y','artworkY',100],['rotation','artworkRotation',1],['opacity','artworkOpacity',100]]){
    $(id).value=Math.round(frame[key]*mult);$(id+'Value').textContent=Math.round(frame[key]*mult)+(key==='rotation'?'°':'%');
  }
  $('artworkPositionPreset').value='custom';
  const inputs={artBgBrightness:['background','brightness',100],artBgTint:['background','tintOpacity',100],
    artDataBrightness:['data','brightness',100],artDataTint:['data','tintOpacity',100]};
  for(const [id,[part,key,mult]] of Object.entries(inputs)){$(id).value=Math.round(a[part][key]*mult);$(id+'Value').textContent=Math.round(a[part][key]*mult)+'%';}
  const t=a[artworkEditLayer];$('artBlendMode').value=t.blendMode??'normal';$('artPosterize').value=String(t.posterize??0);for(const [key,id] of [['contrast','artContrast'],['saturation','artSaturation'],['blur','artBlur']]){
    $(id).value=Math.round(t[key]*100);$(id+'Value').textContent=key==='blur'?`${t[key].toFixed(2)} modules`:`${Math.round(t[key]*100)}%`;
  }
  $('artTintColor').style.borderLeft='7px solid '+t.tint;
  $('contrastProtect').checked=!!a.protection;$('protectIntensity').hidden=!a.protection;
  $('contrastStrength').value=Math.round((a.protectionStrength??.85)*100);
  $('contrastStrengthValue').textContent=Math.round((a.protectionStrength??.85)*100)+'%';
  renderPhotoPalette();
}
function renderPhotoPalette(){
  const box=$('photoPalette');box.replaceChildren();
  for(const color of photoPaletteColors){const button=document.createElement('button');button.type='button';button.title=`Use ${color} as QR-module color`;
    button.style.background=color;button.setAttribute('aria-label',`Use ${color} for QR modules`);
    button.addEventListener('click',()=>change(()=>state.design.paints.data=color,{refresh:true}));box.append(button);}
  $('applyPhotoGradient').disabled=photoPaletteColors.length<2;
}
async function chooseArtworkFile(file){if(!file)return;
  const token=++artworkLoadToken;
  try{const dataUrl=await readLogoFile(file);
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Image could not be opened'));image.src=dataUrl;});
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>25_000_000)throw Error('Image dimensions are too large');
    const aspectRatio=image.naturalWidth/image.naturalHeight;
    if(aspectRatio<.05||aspectRatio>20)throw Error('Image shape is too extreme');
    // Ignore an older file whose asynchronous decode completed after Remove or
    // a newer file selection. Never resurrect removed photographs.
    if(token!==artworkLoadToken)return;
    ++patternLoadToken;++paletteExtractToken;photoPaletteColors=[];artworkEditLayer='background';
    change(()=>{state.design.artwork={...defaultArtwork(),dataUrl,name:file.name,aspectRatio};},{refresh:true});
    $('artworkFile').value='';$('downloadStatus').textContent='Photograph added locally. Try the three image modes above.';
  }catch(e){if(token===artworkLoadToken)$('downloadStatus').textContent='Could not load photograph: '+e.message;}
  finally{if(token===artworkLoadToken)$('artworkFile').value='';}
}
function initArtworkEvents(){
  $('chooseArtwork').addEventListener('click',()=>$('artworkFile').click());
  $('replaceArtwork').addEventListener('click',()=>$('artworkFile').click());
  $('artworkFile').addEventListener('change',e=>chooseArtworkFile(e.target.files[0]));
  $('removeArtwork').addEventListener('click',()=>{++artworkLoadToken;++patternLoadToken;++paletteExtractToken;change(()=>state.design.artwork=null,{refresh:true});$('artworkFile').value='';photoPaletteColors=[];});
  const drop=$('artworkDrop');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag-over');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag-over');chooseArtworkFile(e.dataTransfer.files[0]);});
  $('replaceArtSecond').addEventListener('click',()=>$('artSecondFile').click());
  $('artSecondFile').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file||!state.design.artwork)return;
    const token=++patternLoadToken,originalArtwork=state.design.artwork;
    try{
      const dataUrl=await readLogoFile(file),image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Could not read pattern image'));image.src=dataUrl;});
      if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>25_000_000)throw Error('Image dimensions are too large');
      if(token!==patternLoadToken||state.design.artwork!==originalArtwork)return;
      change(()=>{state.design.artwork.dataSource={name:file.name,dataUrl,aspectRatio:image.naturalWidth/image.naturalHeight};
        state.design.artwork.mode='dual';artworkEditLayer='data';},{refresh:true});
      $('downloadStatus').textContent='Separate pattern image loaded locally.';
    }catch(error){if(token===patternLoadToken)$('downloadStatus').textContent='Could not load pattern picture: '+error.message;}
    finally{e.target.value='';}
  });
  $('removeArtSecond').addEventListener('click',()=>{++patternLoadToken;change(()=>{state.design.artwork.dataSource=null;},{refresh:true});});
  qa('[data-artwork-mode]').forEach(b=>b.addEventListener('click',()=>{if(!state.design.artwork)return;
    change(()=>state.design.artwork.mode=b.dataset.artworkMode,{refresh:true});
  }));
  $('artworkLayer').addEventListener('change',e=>{artworkEditLayer=e.target.value;renderArtworkState();});
  $('artworkFit').addEventListener('change',e=>change(()=>activeArtFrame().fit=e.target.value));
  for(const [id,key,mult] of [['artworkZoom','zoom',100],['artworkX','x',100],['artworkY','y',100],['artworkRotation','rotation',1],['artworkOpacity','opacity',100]])$(id).addEventListener('input',e=>{
    const val=Number(e.target.value);change(()=>activeArtFrame()[key]=val/mult,{group:'artwork-'+artworkEditLayer+'-'+key});
    $(id+'Value').textContent=val+(key==='rotation'?'°':'%');$('artworkPositionPreset').value='custom';
  });
  $('artworkPositionPreset').addEventListener('change',e=>{
    const map={center:[.5,.5],top:[.5,0],bottom:[.5,1],left:[0,.5],right:[1,.5]},point=map[e.target.value];
    if(point)change(()=>{const frame=activeArtFrame();frame.x=point[0];frame.y=point[1];},{refresh:true});
  });
  qa('[data-art-control]').forEach(el=>el.addEventListener('input',e=>{
    const [part,key]=el.dataset.artControl.split('.'),val=Number(e.target.value);
    change(()=>state.design.artwork[part][key]=val/100,{group:'artwork-'+part+'-'+key});
    $(el.id+'Value').textContent=val+'%';
  }));
  for(const [id,key] of [['artContrast','contrast'],['artSaturation','saturation'],['artBlur','blur']])$(id).addEventListener('input',e=>{
    const val=Number(e.target.value);change(()=>state.design.artwork[artworkEditLayer][key]=val/100,{group:'art-'+artworkEditLayer+'-'+key});
    $(id+'Value').textContent=key==='blur'?`${(val/100).toFixed(2)} modules`:`${val}%`;
  });
  $('artBlendMode').addEventListener('change',e=>{if(state.design.artwork)change(()=>state.design.artwork[artworkEditLayer].blendMode=e.target.value);});
  $('artPosterize').addEventListener('change',e=>{if(state.design.artwork)change(()=>state.design.artwork[artworkEditLayer].posterize=Number(e.target.value));});
  $('artTintColor').addEventListener('click',e=>openPicker({kind:'artTint',target:artworkEditLayer},e.currentTarget,
    `${artworkEditLayer==='data'?'QR pattern':'Background'} photograph tint`));
  $('contrastProtect').addEventListener('change',e=>change(()=>state.design.artwork.protection=e.target.checked,{refresh:true}));
  $('contrastStrength').addEventListener('input',e=>{const val=Number(e.target.value);change(()=>state.design.artwork.protectionStrength=val/100,{group:'contrast-protection'});
    $('contrastStrengthValue').textContent=val+'%';});
  $('extractPalette').addEventListener('click',async()=>{
    const a=state.design.artwork;if(!a)return;
    const token=++paletteExtractToken;
    const source=artworkEditLayer==='data'&&a.dataSource?a.dataSource.dataUrl:a.dataUrl;
    $('paletteHint').textContent='Extracting palette locally…';
    try{const colors=await extractImagePalette(source,{count:5});
      if(token!==paletteExtractToken||state.design.artwork!==a)return;
      photoPaletteColors=colors;renderPhotoPalette();
      $('paletteHint').textContent='Click a swatch to use it for modules, or build a matching gradient.';
    }catch(e){if(token===paletteExtractToken)$('paletteHint').textContent='Could not extract colors: '+e.message;}
  });
  $('applyPhotoGradient').addEventListener('click',()=>{
    if(photoPaletteColors.length<2)return;
    const swatches=photoPaletteColors.slice(0,5);change(()=>{state.design.paints.data={type:'linear',angle:30,
      stops:swatches.map((color,i)=>({color,offset:i/(swatches.length-1)}))};activePaint='data';selectedStop=0;},{refresh:true});
  });
}
const shadowControls={opacity:'shadowOpacity',blur:'shadowBlur',offsetX:'shadowX',offsetY:'shadowY'};
function shadowValueText(key,value){
  if(key==='opacity')return Math.round(value*100)+'%';
  const moduleSize=qr?$('qrDisplay').getBoundingClientRect().width/(qr.matrix.width+2*state.design.quietZone):0;
  return `${value.toFixed(2)} modules${moduleSize?` · ~${(Math.abs(value)*moduleSize).toFixed(1)} px in preview`:''}`;
}
function renderShadowState(){
  if(state.qrKind==='rmqr'&&shadowTarget==='finder')shadowTarget='modules';
  $('shadowTarget').querySelector('option[value="finder"]').disabled=state.qrKind==='rmqr';
  $('shadowTarget').value=shadowTarget;
  const sh=state.design.shadows?.[shadowTarget];
  const preset=!sh?'none':Object.entries(defaultShadows).find(([,p])=>Object.keys(p).every(k=>p[k]===sh[k]))?.[0]??'custom';
  $('shadowPreset').value=preset;$('shadowControls').hidden=!sh;
  if(!sh){$('shadowHint').textContent=shadowTarget==='logo'?'Add a logo before applying a logo shadow.':'Choose a preset or Custom to enable a real exported shadow.';return;}
  for(const [key,id] of Object.entries(shadowControls)){
    $(id).value=Math.round(sh[key]*(key==='opacity'?100:10));
    $(id+'Value').textContent=shadowValueText(key,sh[key]);
    if($(id+'Exact'))$(id+'Exact').value=sh[key].toFixed(2);
  }
  $('shadowColor').querySelector('.swatch-display').style.background=sh.color;
  $('shadowHint').textContent=shadowTarget==='logo'&&!state.design.logo?'Add a logo to see its shadow.':
    'A single shadow is drawn behind the selected shapes; soft edges may enter the quiet zone. For best scanning, preserve actual dark/light contrast.';
}
function initShadowEvents(){
  $('shadowTarget').addEventListener('change',e=>{shadowTarget=e.target.value;renderShadowState();});
  $('shadowPreset').addEventListener('change',e=>{
    const preset=e.target.value;
    change(()=>{if(preset==='none')delete state.design.shadows[shadowTarget];
      else state.design.shadows[shadowTarget]=copy(preset==='custom'?{...defaultShadows.soft,opacity:.56}:defaultShadows[preset]);},{refresh:true});
  });
  for(const [key,id] of Object.entries(shadowControls)){
    const limits=key==='opacity'?[0,1]:key==='blur'?[0,1.5]:[-2,2];
    const apply=(value,group)=>{
      if(!state.design.shadows?.[shadowTarget]||!Number.isFinite(value)||value<limits[0]||value>limits[1])return;
      change(()=>state.design.shadows[shadowTarget][key]=value,{group});
      $('shadowPreset').value='custom';$(id+'Value').textContent=shadowValueText(key,value);
      if($(id+'Exact'))$(id+'Exact').value=value.toFixed(2);
      $(id).value=Math.round(value*(key==='opacity'?100:10));
    };
    $(id).addEventListener('input',e=>apply(Number(e.target.value)/(key==='opacity'?100:10),'shadow-'+shadowTarget+'-'+key));
    if($(id+'Exact'))$(id+'Exact').addEventListener('change',e=>apply(Number(e.target.value),'shadow-exact-'+shadowTarget+'-'+key));
  }
  $('shadowColor').addEventListener('click',e=>{if(state.design.shadows?.[shadowTarget])openPicker({kind:'shadow',target:shadowTarget},e.currentTarget,`${shadowTarget} shadow color`);});
}
async function chooseLogoFile(file){if(!file)return;
  const token=++logoLoadToken;
  try{const url=await readLogoFile(file);
    if(token!==logoLoadToken)return;
    ++logoProcessToken;
    change(()=>state.design.logo={dataUrl:url,name:file.name,size:.16,padding:.5,rounding:.12,
      backing:'match',backingColor:'#ffffff',clearModules:true,removeWhite:false,whiteTolerance:245},{refresh:true});
    $('logoFile').value='';$('downloadStatus').textContent='Logo added. Use Remove logo to clear it.';
  }catch(e){if(token===logoLoadToken)$('downloadStatus').textContent=e.message;}
  finally{if(token===logoLoadToken)$('logoFile').value='';}
}
function updateAPNGEstimate(){
  const hint=$('apngEstimate');
  if(!hint)return;
  const needsAnimation=['apng','animated-svg'].includes(state.format),motion=normalizeMotion(state.design.motion);
  if(!needsAnimation){hint.textContent='';$('download').disabled=!qr;return;}
  if(motion.type==='none'){
    hint.textContent=state.format==='apng'?'Choose a Motion effect before downloading an animation.':'';
    $('download').disabled=true;return;
  }
  if(state.format!=='apng'){$('download').disabled=!qr;hint.textContent='';return;}
  const fps=Number($('apngFPS').value),moving=Math.ceil(motion.duration*fps),frames=moving+(motion.hold>0?1:0),tooMany=moving>120;
  hint.textContent=tooMany?
    `${moving} moving frames exceed the 120-frame safety limit. Lower Motion duration or choose a lower frame rate before downloading.`:
    `${frames} frames · ${motionCycle(motion).toFixed(1)}s total (${motion.duration.toFixed(1)}s moving + ${motion.hold.toFixed(1)}s still). The still hold is encoded as one frame.`;
  hint.classList.toggle('error',tooMany);
  $('download').disabled=!qr||tooMany;
}
function updateFormatUI(){$('apngOptions').hidden=state.format!=='apng';$('jpegMatteRow').hidden=!['jpeg','pdf','eps'].includes(state.format);
  if(['apng','animated-svg'].includes(state.format)&&state.design.motion.type==='none'){
    $('downloadStatus').textContent='Choose an animation effect in Motion before exporting this animated format.';updateAPNGEstimate();return;
  }
  updateAPNGEstimate();
  $('downloadStatus').textContent=state.format==='apng'?'Animated PNG (APNG) preserves alpha, the moving colors, and your still hold. Export stays entirely in your browser.':state.format==='animated-svg'?'Animated SVG keeps the moving and still-hold cycle in compatible viewers. Static exports use the first animation frame.':
    ['jpeg','pdf','eps'].includes(state.format)?'This print/raster format flattens transparency to the matte color. PDF uses lossless RGB; EPS embeds JPEG artwork.':'';}
function setPreset(name){const p={classic:{data:'#111827',background:'#ffffff'},indigo:{data:'#172554',background:'#e8edff'},
  ocean:{data:{type:'linear',angle:25,stops:[{offset:0,color:'#124c82'},{offset:.5,color:'#087f8c'},{offset:1,color:'#16b3a2'}]},background:'#ffffff'},
  sunset:{data:{type:'linear',angle:45,stops:[{offset:0,color:'#7024a4'},{offset:.55,color:'#d13980'},{offset:1,color:'#ed6e39'}]},background:'#fffaf4'},
  forest:{data:{type:'linear',angle:20,stops:[{offset:0,color:'#064e3b'},{offset:1,color:'#357d42'}]},background:'#f4faed'}}[name];
  if(!p)return;change(()=>{
    state.design.paints=copy(p);
    state.design.shape=name==='classic'?'square':'rounded';
    state.design.eyes={outerShape:name==='classic'?'square':'rounded',innerShape:'square',positions:{}};
    activePaint='data';
  },{refresh:true});
}
/** Window 3: UI adapters around the same immutable encoder + renderer contracts. */
function renderFrameState(){
  const f=state.design.frame;
  $('frameEnabled').checked=!!f;$('frameControls').hidden=!f;
  if(!f)return;
  for(const [id,value] of [['frameLabel',f.label],['frameFill',f.fill],['frameTextColor',f.labelColor],
    ['frameFontSize',f.fontSize],['framePadding',f.padding]])$(id).value=value;
}
/** Accept only valid numeric edits; keep the last working design on transient
 * blanks/out-of-range typing, then restore the previous value on blur. */
function bindBoundedNumber(id,{min,max,integer=false,event='input',read,write,group=id}){
  const el=$(id);
  const valid=()=>{
    if(!el.value.trim())return null;
    const value=Number(el.value);
    if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))return null;
    return value;
  };
  el.addEventListener(event,()=>{
    const value=valid();
    if(value===null){el.setAttribute('aria-invalid','true');return;}
    el.removeAttribute('aria-invalid');change(()=>write(value),{group});
  });
  const restore=()=>{
    if(valid()!==null)return;
    el.value=String(read());el.removeAttribute('aria-invalid');
  };
  // A change event can fire before blur for number inputs; both paths must
  // restore invalid entries without silently storing illegal export values.
  el.addEventListener('change',()=>{if(event!=='change')restore();});
  el.addEventListener('blur',restore);
}
function initFrameEvents(){
  const base=()=>({label:'SCAN ME',fill:'#172554',labelColor:'#ffffff',fontSize:2.4,padding:1.5,borderColor:'#172554',borderWidth:0,radius:0});
  $('frameEnabled').addEventListener('change',e=>change(()=>state.design.frame=e.target.checked?base():null,{refresh:true}));
  const fields={frameLabel:'label',frameFill:'fill',frameTextColor:'labelColor',frameFontSize:'fontSize',framePadding:'padding'};
  for(const [id,key] of Object.entries(fields)){
    if(['fontSize','padding'].includes(key)){
      bindBoundedNumber(id,{min:key==='fontSize'?.75:0,max:6,read:()=>state.design.frame?.[key]??(key==='fontSize'?2.4:1.5),
        write:n=>{if(state.design.frame)state.design.frame[key]=n;},group:`frame-${key}`});
    }else $(id).addEventListener('input',e=>{
      if(state.design.frame)change(()=>{state.design.frame[key]=e.target.value;},{group:`frame-${key}`});
    });
  }
}
function toggleInspector(on){
  inspectMode=!!on;$('inspectPreview').setAttribute('aria-pressed',String(inspectMode));
  $('inspectPreview').classList.toggle('selected',inspectMode);
  $('inspectHint').hidden=!inspectMode;
  $('qrDisplay').style.cursor=inspectMode?'crosshair':'';
}
function inspectClick(event){
  if(!inspectMode||!qr)return;
  const svg=$('qrDisplay').querySelector('svg');if(!svg)return;
  const box=svg.getBoundingClientRect(),view=svg.viewBox.baseVal;
  if(!box.width||!box.height)return;
  // Convert through the SVG's actual viewBox origin. Outer artwork uses
  // negative viewBox coordinates; ignoring them selected the wrong QR roles.
  const x=view.x+(event.clientX-box.left)/box.width*view.width-state.design.quietZone;
  const y=view.y+(event.clientY-box.top)/box.height*view.height-state.design.quietZone;
  const ix=Math.floor(x),iy=Math.floor(y);
  let area='background';
  if(ix<0||iy<0||ix>=qr.matrix.width||iy>=qr.matrix.height)area='quietZone';
  else if(qr.matrix.getModule(ix,iy)){
    const role=qr.matrix.getRole(ix,iy);
    area=role==='finder'?'finder':role==='finderCenter'?'finderCenter':
      role==='darkModule'?'darkModule':role==='data'?'data':
      paints.includes(role)?role:'data';
  }
  activePaint=area;selectedStop=0;renderPaintEditor();toggleInspector(false);
  $('colorLab').scrollIntoView({behavior:'smooth',block:'center'});
  $('inspectHint').textContent=`Selected ${paintLabels[area]??area}. Click Inspect colors again to choose another component.`;
}
const SNAPSHOT_STORAGE='qr-studio-v3-named-snapshots';
function persistSnapshots(){
  try{const json=JSON.stringify(snapshots);if(json.length>3_500_000)throw Error('Snapshots exceed browser storage limit');
    localStorage.setItem(SNAPSHOT_STORAGE,json);return true;
  }catch(e){$('snapshotStatus').textContent='Snapshot saved in this tab, but could not be persisted: '+e.message;return false;}
}
function loadSnapshots(){
  try{const source=JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE)??'[]');
    if(!Array.isArray(source))return [];
    return source.slice(0,12).flatMap(s=>{
      try{if(typeof s.name!=='string'||s.name.length>60||!s.name)return [];
        const validated=validateDocument(s.document);return [{name:s.name,document:validated}];
      }catch{return [];}
    });
  }catch{return [];}
}
function renderSnapshots(chosen){
  const select=$('snapshotList'),value=chosen??select.value;
  select.replaceChildren();
  for(let i=0;i<snapshots.length;i++){
    const o=document.createElement('option');o.value=String(i);o.textContent=snapshots[i].name;select.append(o);
  }
  if(!snapshots.length){const o=document.createElement('option');o.value='';o.textContent='No saved snapshots';select.append(o);}
  select.value=snapshots.length?(value!==''&&Number(value)<snapshots.length?value:String(snapshots.length-1)):'';
  for(const id of ['snapshotRestore','snapshotCompare','snapshotDelete'])$(id).disabled=!snapshots.length;
}
function selectedSnapshot(){const i=Number($('snapshotList').value);return snapshots.length&&Number.isInteger(i)?snapshots[i]:null;}
/** Display more than one SVG without duplicating <defs> IDs in the document.
 * SVG fragment references are document-scoped in browsers, not scoped to <svg>.
 * Keep the encoded geometry untouched and rewrite only fragment identifiers. */
function isolatedSVG(markup,namespace){
  const template=document.createElement('template');template.innerHTML=markup;
  const svg=template.content.querySelector('svg');if(!svg)return markup;
  const rename=new Map();
  for(const element of svg.querySelectorAll('[id]')){
    const original=element.getAttribute('id'),replacement=`${namespace}-${original}`;
    rename.set(original,replacement);element.setAttribute('id',replacement);
  }
  const rewrite=val=>String(val).replace(/url\(\s*(['"]?)#([\w-]+)\1\s*\)/g,
    (whole,quote,key)=>rename.has(key)?`url(${quote}#${rename.get(key)}${quote})`:whole);
  for(const element of svg.querySelectorAll('*')){
    for(const attr of [...element.attributes]){
      if(attr.name==='id')continue;
      const old=attr.value;
      let next=rewrite(old);
      if((attr.name==='href'||attr.name==='xlink:href')&&old.startsWith('#'))
        next='#'+(rename.get(old.slice(1))??old.slice(1));
      if(next!==old)element.setAttribute(attr.name,next);
    }
    if(element.localName==='style' && element.textContent)
      element.textContent=rewrite(element.textContent);
  }
  return svg.outerHTML;
}
function renderComparison(){
  if(!compareSnapshot||!qr)return;
  try{
    $('comparisonBefore').innerHTML=isolatedSVG(renderSVG(qr,styleFromDesign(compareSnapshot.document.design)),'comparison-before');
    $('comparisonAfter').innerHTML=isolatedSVG(renderSVG(qr,currentStyle),'comparison-after');
    $('comparisonPanel').hidden=false;
  }catch(error){compareSnapshot=null;$('comparisonPanel').hidden=true;$('snapshotStatus').textContent=error.message;}
}
function initSnapshotEvents(){
  snapshots=loadSnapshots();renderSnapshots();
  $('snapshotAdd').addEventListener('click',()=>{
    const name=$('snapshotName').value.trim()||`Design ${snapshots.length+1}`;
    if(name.length>60){$('snapshotStatus').textContent='Snapshot names must be 60 characters or shorter.';return;}
    if(snapshots.length>=12){$('snapshotStatus').textContent='Maximum 12 snapshots. Delete a version to create another.';return;}
    const validated=validateDocument(copy(state));snapshots.push({name,document:validated});
    const saved=persistSnapshots();renderSnapshots(String(snapshots.length-1));
    if(saved)$('snapshotStatus').textContent=`Saved “${name}” in this browser. JSON Save design is available separately.`;
  });
  $('snapshotRestore').addEventListener('click',()=>{
    const s=selectedSnapshot();if(!s)return;
    change(()=>{state=validateDocument(copy(s.document));photoPaletteColors=[];logoLoadToken++;artworkLoadToken++;patternLoadToken++;paletteExtractToken++;logoProcessToken++;},{refresh:true});
    $('snapshotStatus').textContent=`Restored “${s.name}”. Undo returns to the previous design.`;
  });
  $('snapshotCompare').addEventListener('click',()=>{
    const s=selectedSnapshot();if(!s)return;
    compareSnapshot=s;renderComparison();$('snapshotStatus').textContent=`Comparing current QR content styled two ways: “${s.name}” versus now.`;
  });
  $('snapshotDelete').addEventListener('click',()=>{
    const index=Number($('snapshotList').value);if(!Number.isInteger(index)||index<0||index>=snapshots.length)return;
    const removed=snapshots.splice(index,1)[0];if(compareSnapshot===removed){compareSnapshot=null;$('comparisonPanel').hidden=true;}
    persistSnapshots();renderSnapshots('');$('snapshotStatus').textContent=`Deleted “${removed.name}” from local snapshots.`;
  });
}
function downloadLocalBlob(blob,filename){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function initStructuredEvents(){
  $('downloadStructured').addEventListener('click',async()=>{
    const button=$('downloadStructured'),status=$('structuredStatus');button.disabled=true;status.textContent='Preparing linked symbols…';
    try{
      if(state.qrKind!=='standard')throw Error('Structured Append requires Standard QR');
      const symbolCount=$('structuredCount').value==='auto'?'auto':Number($('structuredCount').value);
      const {kind,...encoding}=encodeOptions();encoding.mode='auto';
      const result=encodeStructuredAppend(makePayload(),{...encoding,symbolCount});
      const format=$('structuredFormat').value;
      const rows=result.records.map(row=>({...row,style:styleOptions(),format}));
      const archive=await createBatchZip(rows,{kind:'standard',style:styleOptions(),format,
        printOptions:{...state.print},maxRecords:16,includeManifest:true,stopOnError:true,yieldEvery:1});
      if(archive.failed)throw Error(`${archive.failed} symbols failed; cannot use partial sequence`);
      downloadLocalBlob(archive.blob,prepareFilename('qr-structured-sequence','svg').replace(/\.svg$/i,'.zip'));
      status.textContent=`Exported ${result.metadata.count} ${result.metadata.structuredAppend?'linked Structured Append':'standard'} QR symbol(s) in a local ZIP. Specialized scanners may be required.`;
    }catch(error){status.textContent=`Cannot create sequence: ${error.message}`;}
    finally{button.disabled=false;}
  });
}

function renderMotionState(){
  const m=normalizeMotion(state.design.motion),fluid=AURORA_TYPES.includes(m.type),hasInk=m.coverage!=='background';
  $('motionEffect').value=m.type;$('motionControls').hidden=m.type==='none';
  $('motionPlayback').hidden=m.type==='none';
  $('motionColor').querySelector('.swatch-display').style.background=m.color;
  $('motionColorField').hidden=fluid;$('motionPaletteField').hidden=!fluid;
  if(fluid){
    const colors=auroraPalette(m),target=$('motionPaletteSwatches');target.replaceChildren();
    colors.forEach((color,index)=>{
      const button=document.createElement('button');button.type='button';button.className='motion-palette-swatch';
      button.style.setProperty('--motion-swatch',color);
      const label=index===0?'Ink base':`Ribbon ${index}`;
      button.setAttribute('aria-label',`${label}: ${color}. Edit color`);
      const chip=document.createElement('span');chip.className='motion-palette-chip';
      const name=document.createElement('span');name.textContent=label;
      const hex=document.createElement('small');hex.textContent=color;
      button.append(chip,name,hex);
      button.addEventListener('click',()=>openPicker({kind:'motionPalette',index},button,label+' color'));
      target.append(button);
    });
  }
  $('motionDuration').value=m.duration;
  $('motionHold').value=m.hold;$('motionHoldValue').textContent=m.hold.toFixed(1)+'s';
  $('motionCycleHint').textContent=`${m.duration.toFixed(1)}s moving + ${m.hold.toFixed(1)}s still · ${motionCycle(m).toFixed(1)}s total loop`;
  $('motionHoldPhase').value=Math.round(m.holdPhase*100);
  $('motionHoldPhaseValue').textContent=m.holdPhase===0?'Start of loop':Math.round(m.holdPhase*100)+'% of loop';
  $('motionHoldPhaseField').hidden=!fluid;
  $('motionStrength').value=Math.round(m.strength*100);$('motionStrengthValue').textContent=Math.round(m.strength*100)+'%';
  $('motionWidth').value=Math.round(m.width*100);$('motionWidthValue').textContent=Math.round(m.width*100)+'%';
  $('motionAngle').value=m.angle;$('motionAngleValue').textContent=m.angle+'°';
  $('motionArtboard').value=m.artboard;$('motionArtboardValue').textContent=m.artboard+' modules';
  $('motionCoverage').value=m.coverage;$('motionContrast').value=m.contrast;
  $('motionInkCheck').checked=hasInk;$('motionBgCheck').checked=m.coverage!=='ink';
  // Both checkboxes stay keyboard focusable; if the user tries to uncheck the
  // final target, restore it and explain the constraint rather than silently
  // activating another effect or greying out a selected, active QR layer.
  $('motionCoverageTip').textContent=m.coverage!=='ink'&&m.artboard===0?'Choose either or both. To see artwork beyond the QR, increase Outer artwork margin; coverage does not resize the canvas.':'Choose either or both targets. The last enabled target stays selected. Neither changes canvas size or field coordinates.';
  $('motionContrastHint').textContent=m.coverage!=='background'&&state.design.paints.background==='transparent'?
    'Transparent QR: Scan-focused darkens the animated ink, but cannot supply a light surface. Use the Light preview and test on the actual final background.':
    'Scan-focused darkens moving QR ink and keeps a light backing when background artwork is enabled. Artistic colors require extra testing.';
  $('motionTransparent').textContent=state.design.paints.background==='transparent'?'Restore opaque background':'Make background transparent';
  $('motionDetail').value=Math.round(m.detail*100);$('motionDetailValue').textContent=Math.round(m.detail*100)+'%';
  $('motionFieldScale').value=Math.round(m.fieldScale*100);$('motionFieldScaleValue').textContent=Math.round(m.fieldScale*100)+'%';
  $('motionFieldRotation').value=m.fieldRotation;$('motionFieldRotationValue').textContent=m.fieldRotation+'°';
  $('motionGlow').value=Math.round(m.glow*100);$('motionGlowValue').textContent=Math.round(m.glow*100)+'%';
  $('motionProtectEyes').checked=m.protectEyes;
  $('motionWidthField').hidden=fluid||m.type==='glow';
  $('motionAngleField').hidden=fluid||m.type==='glow';
  $('motionEyesField').hidden=!(m.type==='wave'||fluid&&hasInk);
  $('motionCoverageField').hidden=!fluid;
  $('motionContrastField').hidden=!fluid;
  $('motionTransparentField').hidden=!fluid;
  $('motionArtboardField').hidden=!(fluid||m.type==='background');
  $('motionAdvanced').hidden=!fluid;
  $('motionPlay').textContent=motionPlaying?'Pause':'Play';
  $('motionPlay').setAttribute('aria-label',motionPlaying?'Pause animation':'Play animation');
  updateAPNGEstimate();
}
function motionClock(timestamp){
  motionFrame=0;
  if(!motionPlaying||document.hidden||state.design.motion.type==='none')return;
  if(timestamp-motionLastUpdate>110){
    const svg=q('#qrDisplay svg'),m=normalizeMotion(state.design.motion);
    if(svg?.getCurrentTime){const t=svg.getCurrentTime()%motionCycle(m);
      $('motionScrub').value=Math.round(t/motionCycle(m)*100);
      $('motionPlayTime').textContent=(t>=m.duration?'Still · ':'')+t.toFixed(1)+'s';
    }
    motionLastUpdate=timestamp;
  }
  motionFrame=requestAnimationFrame(motionClock);
}
function syncMotionPlayback(previousTime=0){
  const svg=q('#qrDisplay svg'),m=normalizeMotion(state.design.motion);
  if(m.type==='none'||!svg)return;
  svg.setCurrentTime?.(previousTime%motionCycle(m));
  svg.classList.toggle('qr-motion-user-play',motionPlaying);
  if(motionPlaying){svg.unpauseAnimations?.();if(!motionFrame)motionFrame=requestAnimationFrame(motionClock);}
  else svg.pauseAnimations?.();
}
function initMotionEvents(){
  document.addEventListener('visibilitychange',()=>{
    if(motionPlaying&&state.design.motion.type!=='none'&&!document.hidden&&!motionFrame)
      motionFrame=requestAnimationFrame(motionClock);
  });
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)motionPlaying=false;
  $('motionEffect').addEventListener('change',e=>change(()=>{
    const m=state.design.motion,type=e.target.value,wasNone=m.type==='none';
    m.type=type;
    // A custom aurora palette is invalid for Wave / Glow / None. Previously
    // switching out of an edited aurora caused an uncaught validation error.
    if(!AURORA_TYPES.includes(type))m.palette=null;
    // Switching visual presets preserves user timing, coverage, margin and the
    // previous user's custom values. Only entering Motion for the first time
    // establishes useful defaults for a flowing QR-ink animation.
    if(AURORA_TYPES.includes(type)){
      m.color=AURORA_COLORS[type];m.palette=null;
      if(wasNone){m.duration=6;m.hold=2;m.coverage='ink';m.protectEyes=false;m.artboard=0;m.strength=.86;}
    }
  },{refresh:true}));
  $('motionPaletteReset').addEventListener('click',()=>change(()=>{state.design.motion.palette=null;state.design.motion.color=AURORA_COLORS[state.design.motion.type];},{refresh:true}));
  for(const id of ['motionInkCheck','motionBgCheck'])$(id).addEventListener('change',event=>{
    const ink=$('motionInkCheck').checked,background=$('motionBgCheck').checked;
    if(!ink&&!background){
      event.target.checked=true;
      $('motionCoverageTip').textContent='At least one animation target is required. Enable the other target first, or choose None under Effect.';
      return;
    }
    change(()=>{state.design.motion.coverage=ink&&background?'both':ink?'ink':'background';},{refresh:true});
  });
  $('motionTransparent').addEventListener('click',()=>change(()=>{
    const transparent=state.design.paints.background==='transparent';
    state.design.paints.background=transparent?(lastOpaqueBackground==='transparent'?'#ffffff':lastOpaqueBackground):'transparent';
    if(!transparent)state.design.paints.quietZone='transparent';
    else if(state.design.paints.quietZone==='transparent')delete state.design.paints.quietZone;
  },{refresh:true}));
  $('motionColor').addEventListener('click',e=>openPicker({kind:'motion'},e.currentTarget,'Motion highlight color'));
  $('motionProtectEyes').addEventListener('change',e=>change(()=>state.design.motion.protectEyes=e.target.checked));
  for(const [id,key] of [['motionCoverage','coverage'],['motionContrast','contrast']])
    $(id).addEventListener('change',e=>change(()=>state.design.motion[key]=e.target.value,{refresh:true}));
  for(const [id,key,parse] of [['motionDuration','duration',Number],['motionHold','hold',Number],
    ['motionStrength','strength',x=>Number(x)/100],['motionWidth','width',x=>Number(x)/100],
    ['motionAngle','angle',Number],['motionArtboard','artboard',Number],
    ['motionHoldPhase','holdPhase',x=>Number(x)/100],['motionFieldScale','fieldScale',x=>Number(x)/100],['motionFieldRotation','fieldRotation',Number],['motionDetail','detail',x=>Number(x)/100],['motionGlow','glow',x=>Number(x)/100]]){
    $(id).addEventListener(['motionDuration'].includes(id)?'change':'input',e=>{
      const value=parse(e.target.value),limits={duration:[.8,30],hold:[0,20],strength:[0,1],width:[.08,1],
        angle:[-180,180],artboard:[0,24],holdPhase:[0,1],fieldScale:[.6,2.5],fieldRotation:[-180,180],detail:[0,1],glow:[0,1]};
      const [min,max]=limits[key];if(!Number.isFinite(value)||value<min||value>max)return;
      change(()=>state.design.motion[key]=value,{group:'motion-'+key});renderMotionState();
    });
  }
  $('motionPlay').addEventListener('click',()=>{
    motionPlaying=!motionPlaying;
    const svg=q('#qrDisplay svg');svg?.classList.toggle('qr-motion-user-play',motionPlaying);
    if(motionPlaying){svg?.unpauseAnimations?.();if(!motionFrame)motionFrame=requestAnimationFrame(motionClock);}
    else{svg?.pauseAnimations?.();if(motionFrame){cancelAnimationFrame(motionFrame);motionFrame=0;}}
    renderMotionState();
  });
  $('motionScrub').addEventListener('input',e=>{
    if(motionFrame){cancelAnimationFrame(motionFrame);motionFrame=0;}
    motionPlaying=false;const m=normalizeMotion(state.design.motion),t=Number(e.target.value)/100*motionCycle(m),svg=q('#qrDisplay svg');
    svg?.classList.remove('qr-motion-user-play');svg?.pauseAnimations?.();svg?.setCurrentTime?.(t);
    $('motionPlayTime').textContent=(t>=m.duration?'Still · ':'')+t.toFixed(1)+'s';renderMotionState();
  });
}
function initEvents(){
  $('undo').addEventListener('click',undoDoc);$('redo').addEventListener('click',redoDoc);
  document.addEventListener('keydown',e=>{
    if(e.key==='Tab'&&!$('previewModal').hidden){
      // The enlarged preview is a true modal: keyboard focus must not escape behind it.
      e.preventDefault();$('closePreview').focus({preventScroll:true});return;
    }
    if(e.key==='Escape'){
      if(!$('previewModal').hidden){e.preventDefault();closePreviewDialog();return;}
      if(!$('colorPopover').hidden){e.preventDefault();closePicker();return;}
      if(inspectMode){e.preventDefault();toggleInspector(false);return;}
      return;
    }
    if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();$('saveDesign').click();return;}
    if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='z'){
      if(e.target.closest('input,textarea,[contenteditable]'))return;e.preventDefault();if(e.shiftKey)redoDoc();else undoDoc();
    }
  });
  document.addEventListener('focusout',e=>{if(e.target.matches('input,textarea,select'))resetHistoryGroup();});
  qa('[data-content-kind]').forEach(b=>b.addEventListener('click',()=>{
    if(state.contentKind===b.dataset.contentKind)return;change(()=>state.contentKind=b.dataset.contentKind,{refresh:true});}));
  qa('[data-qr-kind]').forEach(b=>b.addEventListener('click',()=>{
    if(state.qrKind===b.dataset.qrKind)return;change(()=>{state.qrKind=b.dataset.qrKind;
      if(state.qrKind!=='standard' && state.design.quietZone===4)state.design.quietZone=2;
      else if(state.qrKind==='standard'&&state.design.quietZone===2)state.design.quietZone=4;
    },{refresh:true});}));
  qa('[data-shape]').forEach(b=>b.addEventListener('click',()=>change(()=>state.design.shape=b.dataset.shape,{refresh:true})));
  qa('[data-preset]').forEach(b=>b.addEventListener('click',()=>setPreset(b.dataset.preset)));
  for(const [id,key,parse] of [['moduleScale','moduleScale',v=>Number(v)/100],['cornerRadius','cornerRadius',v=>Number(v)/100]]){
    $(id).addEventListener('input',e=>{
      change(()=>state.design[key]=parse(e.target.value),{group:'range-'+key});
      $(id+'Value').textContent=e.target.value+'%';
    });
  }
  $('resetLook').addEventListener('click',()=>change(()=>{state.design=defaults().design;activePaint='data';},{refresh:true}));
  $('transparentBg').addEventListener('change',e=>{
    change(()=>state.design.paints.background=e.target.checked?'transparent':copy(lastOpaqueBackground));
    if(activePaint==='background')renderPaintEditor();updateFormatUI();
  });
  qa('[data-inspect]').forEach(b=>b.addEventListener('click',()=>{activePaint=b.dataset.inspect;renderPaintEditor();$('colorLab').scrollIntoView({behavior:'smooth',block:'center'});}));
  qa('[data-pick]').forEach(b=>b.addEventListener('click',()=>{
    activePaint=b.dataset.pick;enablePaint(activePaint);renderPaintEditor();
    const paint=activeOrDefault(activePaint);
    if(typeof paint==='string'&&paint==='transparent'){changePaintMode('solid');}
    openPicker({kind:'paint',area:activePaint,position:individualEye,stop:typeof paint==='string'?null:selectedStop},b,paintEditingLabel());
  }));
  $('paintArea').addEventListener('change',e=>{activePaint=e.target.value;selectedStop=0;renderPaintEditor();});
  $('paintMode').addEventListener('change',e=>changePaintMode(e.target.value));
  $('customPaint').addEventListener('change',e=>change(()=>{if(e.target.checked)enablePaint(activePaint);else deletePaint(activePaint);},{refresh:false})||renderPaintEditor());
  $('clearPaint').addEventListener('click',()=>{change(()=>deletePaint(activePaint));renderPaintEditor();});
  $('paintEditor').addEventListener('click',e=>{const b=e.target.closest('[data-picker]');if(!b)return;
    const item=activeOrDefault(activePaint),stop=typeof item==='string'?null:selectedStop;
    openPicker({kind:'paint',area:activePaint,position:individualEye,stop},b,typeof item==='string'?`${paintEditingLabel()} · solid color`:`${paintEditingLabel()} · stop ${selectedStop+1} of ${item.stops.length}`);
  });
  for(const key of ['outerShape','innerShape'])$(key).addEventListener('change',e=>change(()=>{
    if(individualEye==='all')state.design.eyes[key]=e.target.value;
    else{state.design.eyes.positions[individualEye]??={};state.design.eyes.positions[individualEye][key]=e.target.value;}
  }));
  $('individualEye').addEventListener('change',e=>{individualEye=e.target.value;refreshControls();});
  $('eyeOuterEdit').addEventListener('click',()=>openEyeColor('outerColor'));
  $('eyeCenterEdit').addEventListener('click',()=>openEyeColor('innerColor'));
  $('eyeLightEdit').addEventListener('click',()=>openEyeColor('lightColor'));
  $('clearAllEyeOverrides').addEventListener('click',()=>change(()=>{state.design.eyes.positions={};},{refresh:true}));
  $('clearEyeOverride').addEventListener('click',()=>{
    if(individualEye==='all')change(()=>{delete state.design.paints.finder;delete state.design.paints.finderCenter;delete state.design.paints.finderLight;},{refresh:true});
    else change(()=>delete state.design.eyes.positions[individualEye],{refresh:true});
  });
  initArtworkEvents();
  initShadowEvents();
  $('chooseLogo').addEventListener('click',()=>$('logoFile').click());$('replaceLogo').addEventListener('click',()=>$('logoFile').click());
  $('logoFile').addEventListener('change',e=>chooseLogoFile(e.target.files[0]));
  $('removeLogo').addEventListener('click',()=>{logoLoadToken++;logoProcessToken++;change(()=>state.design.logo=null,{refresh:true});$('logoFile').value='';});
  const zone=$('logoDrop');zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag-over');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag-over');chooseLogoFile(e.dataTransfer.files[0]);});
  for(const [id,key,fn] of [['logoSize','size',v=>v/100],['logoPadding','padding',v=>v],['logoRounding','rounding',v=>v/100]])$(id).addEventListener('input',e=>{
    change(()=>state.design.logo[key]=fn(Number(e.target.value)),{group:'logo-'+key});
    if(key!=='rounding')$(id+'Value').textContent=key==='size'?e.target.value+'%':e.target.value;
  });
  $('logoBacking').addEventListener('change',e=>change(()=>state.design.logo.backing=e.target.value,{refresh:true}));
  $('logoCustomColor').addEventListener('click',e=>openPicker({kind:'logo'},e.currentTarget,'Logo backing color'));
  $('clearBehindLogo').addEventListener('change',e=>change(()=>state.design.logo.clearModules=e.target.checked));
  $('removeLogoWhite').addEventListener('change',e=>{change(()=>state.design.logo.removeWhite=e.target.checked,{refresh:true});processLogo();});
  $('whiteTolerance').addEventListener('input',e=>{change(()=>state.design.logo.whiteTolerance=Number(e.target.value),{group:'white-threshold'});
    $('whiteToleranceValue').textContent=e.target.value;processLogo();});
  for(const [id,key,min,max] of [['exportSize','size',64,8192],['quietZone','quietZone',0,32]])
    bindBoundedNumber(id,{min,max,integer:true,read:()=>state.design[key],write:n=>{state.design[key]=n;},group:'export-'+key});
  for(const [id,key,min,max] of [['printWidthMm','widthMm',5,1500],['printMarginMm','marginMm',0,100]])
    bindBoundedNumber(id,{min,max,event:'change',read:()=>state.print[key],write:n=>{state.print[key]=n;},group:'print-'+key});
  $('svgPhysicalSize').addEventListener('change',e=>change(()=>state.print.svgPhysical=e.target.checked));
  $('fileQuality').addEventListener('input',e=>{change(()=>state.quality=Number(e.target.value)/100,{group:'file-quality'});$('qualityValue').textContent=e.target.value+'%';});
  $('filename').addEventListener('input',e=>{change(()=>state.filename=e.target.value,{group:'filename'});});
  $('format').addEventListener('change',e=>{change(()=>state.format=e.target.value);updateFormatUI();});
  $('jpegMatteButton').addEventListener('click',e=>openPicker({kind:'matte'},e.currentTarget,'JPEG matte color'));
  $('cancelAPNG').addEventListener('click',()=>animationExportController?.abort());
  $('apngFPS').addEventListener('change',updateAPNGEstimate);
  $('apngSize').addEventListener('change',updateAPNGEstimate);
  $('download').addEventListener('click',async()=>{
    if(!qr||!currentStyle)return;
    const btn=$('download');btn.disabled=true;btn.textContent='Preparing…';
    animationExportController=state.format==='apng'?new AbortController():null;
    $('cancelAPNG').hidden=!animationExportController;
    try{const generated=prepareFilename(state.filename,state.format);await downloadQR(qr,{format:state.format,style:currentStyle,
      filename:state.filename,quality:state.quality,jpegMatte:state.jpegMatte,animationOptions:{size:Number($('apngSize').value),fps:Number($('apngFPS').value),signal:animationExportController?.signal,onProgress:({done,total})=>{$('downloadStatus').textContent=`Rendering animated PNG: ${done} / ${total} frames…`;}},printOptions:state.format==='svg'&&!state.print.svgPhysical?{}:{...state.print,title:'QR Studio'}});
      $('downloadStatus').textContent=`Downloaded ${generated} · all processing stayed on your device.`;
    }catch(e){$('downloadStatus').textContent=e.code==='CANCELLED'?'Animation export cancelled.':'Download failed: '+e.message;}
    finally{animationExportController=null;$('cancelAPNG').hidden=true;btn.disabled=!qr;btn.innerHTML='<span aria-hidden="true">↓</span> Download';}
  });
  $('expandPreview').addEventListener('click',()=>{if(qr)openPreviewDialog();});
  $('closePreview').addEventListener('click',closePreviewDialog);
  $('previewModal').addEventListener('click',e=>{if(e.target===$('previewModal'))closePreviewDialog();});
  qa('[data-surface]').forEach(b=>b.addEventListener('click',()=>setSurface(b.dataset.surface)));
  $('inspectPreview').addEventListener('click',()=>toggleInspector(!inspectMode));
  $('qrDisplay').addEventListener('click',inspectClick);
  $('closeCompare').addEventListener('click',()=>{compareSnapshot=null;$('comparisonPanel').hidden=true;});
  initSnapshotEvents();
  initFrameEvents();
  initStructuredEvents();
  initMotionEvents();
  $('scanTest').addEventListener('click',async()=>{
    const result=$('scanResult');if(!qr)return;
    const token=++scanToken,originalQR=qr,design=currentStyle,payload=currentPayload,
      matte=previewSurface==='dark'?'#202c45':'#ffffff',base={quietZone:design.quietZone,matte,frame:design.frame,motion:design.motion};
    result.textContent='Analyzing rendered pixels and trying a local QR decoder…';
    try{
      const canvas=await toCanvas(originalQR,{...design,size:512});
      const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);
      const contrast=sampleRasterContrast(originalQR,pixels,base);
      let detection=originalQR.metadata.kind==='QR Model 2'?await decodeWithBrowser(canvas,payload):
        {available:false,message:'Micro QR and rMQR decoding requires a specialized scanner.'};
      if(!detection.available&&originalQR.metadata.kind==='QR Model 2')
        detection=verifyStandardQRBitmap(originalQR,pixels,{...base,expected:payload});
      if(token!==scanToken)return;
      const contrastLabel=contrast.polarity==='inverted'?'Inverted QR · visual light/dark difference':'Pixel contrast';
      const prefix=`${contrastLabel}: ${contrast.contrastRatio.toFixed(1)}:1 · scan-risk rating: ${contrast.score}${contrast.polarity==='inverted'?' (light modules on a dark background; some cameras may reject this)':''}. ${detection.message}`;
      result.textContent=prefix;
      // Deterministic frame snapshots ensure we inspect motion at actual phase
      // positions. This does not locate an arbitrary QR in a photograph, nor
      // guarantee decoding on consumer phones or displays.
      if(design.motion?.type!=='none'){
        if(originalQR.metadata.kind!=='QR Model 2'){
          result.textContent+=' Motion frames cannot be parity-verified for this QR variant; test with a compatible scanner.';
        }else{
          const samples=8,failed=[],inverted=[];let matched=0;
          for(let i=0;i<samples;i++){
            if(token!==scanToken)return;
            const time=i*motionCycle(normalizeMotion(design.motion))/samples;
            result.textContent=`${prefix} Testing animated appearance ${i+1}/${samples}…`;
            const frame=await toCanvas(originalQR,{...design,size:448},{frameTime:time});
            const pixels=frame.getContext('2d',{willReadFrequently:true}).getImageData(0,0,frame.width,frame.height);
            const c=sampleRasterContrast(originalQR,pixels,base);
            const v=verifyStandardQRBitmap(originalQR,pixels,{...base,expected:payload});
            if(v.matched)matched++;else failed.push(time.toFixed(2)+'s');
            if(c.polarity==='inverted'||c.score==='weak')inverted.push(time.toFixed(2)+'s');
          }
          if(token!==scanToken)return;
          result.textContent=prefix+` Sampled animation: ${matched}/${samples} frames recovered the exact payload using known-grid parity checks.`+
            (failed.length?` Failed samples: ${failed.join(', ')}.`:'')+
            (inverted.length?` ${inverted.length}/${samples} frames had weak or inverted contrast.`:'')+
            ' Frame sampling is not a phone-camera scan; test the exported SVG on real devices.';
        }
      }
    }catch(e){if(token===scanToken)result.textContent='Local analysis could not finish: '+e.message;}
  });
  $('saveDesign').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(packDesign(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='qr-studio-design.json';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('loadDesign').addEventListener('click',()=>$('designFile').click());
  $('designFile').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>20_000_000)throw Error('Design file is too large');
      const parsed=JSON.parse(await file.text());const restored=validateDocument(unpackDesign(parsed));
      change(()=>{state=restored;activePaint='data';individualEye='all';artworkEditLayer='background';photoPaletteColors=[];logoLoadToken++;artworkLoadToken++;patternLoadToken++;paletteExtractToken++;logoProcessToken++;},{refresh:true});
      $('downloadStatus').textContent='Design imported locally.';
    }catch(err){$('downloadStatus').textContent='Could not load design: '+err.message;}
    finally{e.target.value='';}
  });
  initPicker();
  batchController=createBatchController({engine:{parseDelimited,mapBatchColumns,generateSequence,serializeManifest,createBatchZip,prepareFilename},
    getStyle:baseStyleOptions,getKind:()=>state.qrKind,getEncoding:()=>normalizedEncoding(state.qrKind),
    getQuality:()=>state.quality,getMatte:()=>state.jpegMatte,getPrintOptions:()=>({...state.print}),onPreview:scheduleRender});
  batchController.init();
}
function openEyeColor(field){
  // One editor for both all-eyes paints and per-eye overrides, including gradients.
  activePaint={outerColor:'finder',innerColor:'finderCenter',lightColor:'finderLight'}[field];
  selectedStop=0;renderPaintEditor();
  $('colorLab').scrollIntoView({behavior:'smooth',block:'center'});
  $('paintArea').focus({preventScroll:true});
}

function initPicker(){
  $('closePicker').addEventListener('click',closePicker);
  document.addEventListener('pointerdown',e=>{
    if($('colorPopover').hidden)return;
    if(!e.target.closest('#colorPopover')&&!e.target.closest('[data-picker],[data-pick],#logoCustomColor,#jpegMatteButton,#eyeOuterEdit,#eyeCenterEdit,#artTintColor,#motionColor'))closePicker({restoreFocus:false});
  });
  const sv=$('svPanel');function setSV(e){const r=sv.getBoundingClientRect();pickerHSV.s=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
    pickerHSV.v=1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));updatePickerColor('picker-sv');}
  sv.addEventListener('pointerdown',e=>{resetHistoryGroup();sv.setPointerCapture(e.pointerId);setSV(e);});
  sv.addEventListener('pointermove',e=>{if(sv.hasPointerCapture(e.pointerId))setSV(e);});
  sv.addEventListener('pointerup',resetHistoryGroup);
  sv.addEventListener('keydown',e=>{let delta=0;if(e.key==='ArrowUp'){pickerHSV.v=Math.min(1,pickerHSV.v+.01);delta=1;}
    if(e.key==='ArrowDown'){pickerHSV.v=Math.max(0,pickerHSV.v-.01);delta=1;}
    if(e.key==='ArrowRight'){pickerHSV.s=Math.min(1,pickerHSV.s+.01);delta=1;}
    if(e.key==='ArrowLeft'){pickerHSV.s=Math.max(0,pickerHSV.s-.01);delta=1;}
    if(delta){e.preventDefault();updatePickerColor('picker-sv-keys');}
  });
  $('hueRange').addEventListener('input',e=>{pickerHSV.h=Number(e.target.value);updatePickerColor('picker-hue');});
  $('alphaRange').addEventListener('input',e=>{pickerHSV.a=Number(e.target.value)/100;updatePickerColor('picker-alpha');});
  $('pickerHex').addEventListener('input',e=>{
    const valid=validHex(e.target.value);e.target.setAttribute('aria-invalid',valid?'false':'true');if(!valid)return;
    pickerHSV=rgbHSV(parseRGBA(valid));change(()=>assignColor(pickerContext,valid),{group:'picker-hex'});
    updateQuickSwatches();
  });
  $('pickerValueMode').addEventListener('change',e=>setPickerValueMode(e.target.value));
  for(const [kind,ids,maxima] of [
    ['rgb',['pickerRed','pickerGreen','pickerBlue'],[255,255,255]],
    ['hsl',['pickerHue','pickerSat','pickerLight'],[360,100,100]]
  ]) for(const id of ids)$(id).addEventListener('input',()=>{
    const values=ids.map(name=>Number($(name).value));
    const valid=ids.every((name,i)=>$(name).value.trim()!==''&&Number.isInteger(values[i])&&values[i]>=0&&values[i]<=maxima[i]);
    ids.forEach(name=>$(name).setAttribute('aria-invalid',String(!valid)));
    if(!valid)return;
    const rgba=kind==='rgb'?{r:values[0],g:values[1],b:values[2],a:pickerHSV.a}:
      hslRGB({h:values[0],s:values[1]/100,l:values[2]/100,a:pickerHSV.a});
    pickerHSV=rgbHSV(rgba);
    // Leave actively edited numbers alone so typing does not move the caret.
    change(()=>assignColor(pickerContext,toHex(rgba)),{group:'picker-'+kind});
    $('pickerSwatch').style.background=cssPaint(toHex(rgba));
    $('hueRange').value=Math.round(pickerHSV.h);
    $('svPanel').style.background=`linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${pickerHSV.h} 100% 50%))`;
    $('svPointer').style.left=(pickerHSV.s*100)+'%';$('svPointer').style.top=((1-pickerHSV.v)*100)+'%';
  });
  $('saveColor').addEventListener('click',savePickedColor);
  renderSavedColors();
  const presets=['#111827','#ffffff','#172554','#2563eb','#14b8a6','#a21caf','#e11d48','#f97316','#facc15','#00000000'];
  $('pickerPresets').replaceChildren(...presets.map(c=>{const b=document.createElement('button');b.type='button';b.title=c;
    b.style.background=cssPaint(c==='transparent'?'#00000000':c);b.addEventListener('click',()=>{pickerHSV=rgbHSV(parseRGBA(c));updatePickerColor('picker-preset');});return b;}));
}
refreshControls();initEvents();scheduleRender();
