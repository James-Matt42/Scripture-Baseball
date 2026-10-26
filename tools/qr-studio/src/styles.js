import { fail } from './errors.js';
import { ROLES, ROLE_NAMES } from './roles.js';
import { normalizeImages, normalizeShadows } from './media.js';
import {normalizeMotion,isAurora,auroraPalette} from './motion.js';

/** Color and paint descriptions are validated before insertion into SVG. */
const HEX = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const SHAPES = ['square','rounded','circle','diamond','horizontal','vertical','connected-rounded'];
const EYE_SHAPES = ['square','rounded','circle'];
export const PAINT_AREAS = Object.freeze(['data','background','quietZone','finder','finderCenter','finderLight',
  'timing','alignment','format','version','separator','darkModule']);
const STYLE_KEYS = ['size','quietZone','foreground','background','shape','moduleScale','cornerRadius','gradient',
  'eyes','components','paints','logo','title','images','shadows','frame','motion'];
export const DEFAULT_STYLE = Object.freeze({ size: 512, quietZone: 4, foreground:'#172554', background:'#ffffff',
  shape:'square', moduleScale:1, cornerRadius:.32, gradient:null, eyes:null, components:null, paints:null, logo:null, images:null, shadows:null, frame:null, motion:null, title:'' });

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_STYLE', `${name} must be an object`);
}
function onlyKeys(obj, keys, context) {
  for (const key of Object.keys(obj)) if (!keys.includes(key)) fail('INVALID_STYLE', `Unknown ${context} option: ${key}`);
}
function between(v,min,max,name) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail('INVALID_STYLE', `${name} must be between ${min} and ${max}`);
  return v;
}
function validColor(v,name) {
  if (typeof v !== 'string' || !(HEX.test(v) || v === 'transparent')) fail('INVALID_COLOR', `${name} must be a hex color or transparent`);
  return v.toLowerCase();
}
/** Solid hex or transparent, or a 2-8-stop linear/radial SVG paint. */
export function normalizePaint(value, name='paint') {
  if (typeof value === 'string') return validColor(value,name);
  assertObject(value,name);
  onlyKeys(value,['type','color','stops','angle','cx','cy','radius','space'],name);
  if (value.type === 'solid') return validColor(value.color,name+'.color');
  if (!['linear','radial'].includes(value.type)) fail('INVALID_STYLE', `${name}.type must be solid, linear or radial`);
  if (!Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > 8) {
    fail('INVALID_STYLE', `${name}.stops needs 2–8 ordered color stops`);
  }
  const stops = value.stops.map((item,i) => {
    assertObject(item,`${name}.stops[${i}]`);
    onlyKeys(item,['offset','color'], `${name}.stops[${i}]`);
    return Object.freeze({offset:between(item.offset,0,1,`${name}.stops[${i}].offset`),color:validColor(item.color,`${name}.stops[${i}].color`)});
  });
  if (stops.some((s,i)=>i && stops[i-1].offset > s.offset)) fail('INVALID_STYLE', `${name}.stops must be sorted by position`);
  const space=value.space??'global';
  if(!['global','component','eye','module'].includes(space))fail('INVALID_STYLE',`${name}.space must be global, component, eye, or module`);
  const normalized = {type:value.type,stops:Object.freeze(stops),space};
  if (value.type === 'linear') normalized.angle = between(value.angle??0,-360,360,`${name}.angle`);
  else {
    normalized.cx = between(value.cx??.5,0,1,`${name}.cx`);
    normalized.cy = between(value.cy??.5,0,1,`${name}.cy`);
    normalized.radius = between(value.radius??.71,.01,2,`${name}.radius`);
  }
  return Object.freeze(normalized);
}
export function normalizeStyle(style={}) {
  assertObject(style,'style'); onlyKeys(style,STYLE_KEYS,'style');
  const s={...DEFAULT_STYLE,...style};
  if (!Number.isInteger(s.size) || s.size<64 || s.size>8192) fail('INVALID_STYLE','size must be 64–8192 px');
  if (!Number.isInteger(s.quietZone) || s.quietZone<0 || s.quietZone>32) fail('INVALID_STYLE','quietZone must be an integer from 0 to 32');
  if (!SHAPES.includes(s.shape)) fail('INVALID_STYLE', `shape must be one of: ${SHAPES.join(', ')}`);
  between(s.moduleScale,.45,1,'moduleScale'); between(s.cornerRadius,0,.5,'cornerRadius');
  s.foreground=validColor(s.foreground,'foreground'); s.background=validColor(s.background,'background');
  if (typeof s.title!=='string' || s.title.length>500) fail('INVALID_STYLE','title must be text with at most 500 characters');
  if (s.gradient!=null) {
    assertObject(s.gradient,'gradient'); onlyKeys(s.gradient,['type','colors','rotation','applyTo'],'gradient');
    if (!['linear','radial'].includes(s.gradient.type) || !Array.isArray(s.gradient.colors) || s.gradient.colors.length<2 || s.gradient.colors.length>8) fail('INVALID_STYLE','Invalid legacy gradient');
    s.gradient=Object.freeze({type:s.gradient.type, colors:Object.freeze(s.gradient.colors.map((c,i)=>validColor(c,`gradient.colors[${i}]`))),
      rotation:between(s.gradient.rotation??0,-360,360,'gradient.rotation'),applyTo:s.gradient.applyTo??'all'});
    if (!['all','data'].includes(s.gradient.applyTo)) fail('INVALID_STYLE','gradient.applyTo must be all or data');
  }
  if (s.eyes!=null) {
    assertObject(s.eyes,'eyes'); onlyKeys(s.eyes,['outerShape','innerShape','outerColor','innerColor','lightColor','positions'],'eyes');
    const e={...s.eyes};
    for (const key of ['outerShape','innerShape']) if (e[key]!=null && !EYE_SHAPES.includes(e[key])) fail('INVALID_STYLE',`Unsupported eye shape ${e[key]}`);
    for (const key of ['outerColor','innerColor','lightColor']) if (e[key]!=null) e[key]=validColor(e[key],`eyes.${key}`);
    const positions = {};
    if (e.positions!=null) {
      assertObject(e.positions,'eyes.positions');onlyKeys(e.positions,['topLeft','topRight','bottomLeft'],'eyes.positions');
      for(const [key,v] of Object.entries(e.positions)) {
        assertObject(v,`eyes.positions.${key}`);
        onlyKeys(v,['outerShape','innerShape','outerColor','innerColor','lightColor'],`eyes.positions.${key}`);
        for(const shape of ['outerShape','innerShape']) if(v[shape]!=null && !EYE_SHAPES.includes(v[shape])) fail('INVALID_STYLE','Invalid eye shape');
        positions[key]=Object.freeze(Object.fromEntries(Object.entries(v).map(([field,value]) => [field,field.endsWith('Color')?normalizePaint(value,`eyes.positions.${key}.${field}`):value])));
      }
    }
    s.eyes=Object.freeze({outerShape:e.outerShape??'square',innerShape:e.innerShape??'square',outerColor:e.outerColor??null,innerColor:e.innerColor??null,lightColor:e.lightColor??null,positions:Object.freeze(positions)});
  }
  if(s.components!=null){
    assertObject(s.components,'components');onlyKeys(s.components,ROLE_NAMES,'components');
    const result={};for(const [role,v] of Object.entries(s.components)){
      const obj=typeof v==='string'?{dark:v}:v;assertObject(obj,`components.${role}`);onlyKeys(obj,['dark','light'],`components.${role}`);
      result[role]=Object.freeze({dark:obj.dark==null?null:validColor(obj.dark,`components.${role}.dark`),
        light:obj.light==null?null:validColor(obj.light,`components.${role}.light`)});
    }s.components=Object.freeze(result);
  }
  if(s.paints!=null){
    assertObject(s.paints,'paints');onlyKeys(s.paints,PAINT_AREAS,'paints');
    s.paints=Object.freeze(Object.fromEntries(Object.entries(s.paints).filter(([,v])=>v!=null).map(([key,v])=>[key,normalizePaint(v,`paints.${key}`)])));
  }
  if(s.frame!=null){
    assertObject(s.frame,'frame');onlyKeys(s.frame,['label','labelColor','fill','fontSize','padding','borderColor','borderWidth','radius'],'frame');
    if(typeof s.frame.label!=='string'||s.frame.label.length>60||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s.frame.label))fail('INVALID_STYLE','Frame label must be <= 60 printable characters');
    s.frame=Object.freeze({label:s.frame.label.trim(),
      labelColor:validColor(s.frame.labelColor??'#ffffff','frame.labelColor'),
      fill:validColor(s.frame.fill??'#172554','frame.fill'),
      borderColor:validColor(s.frame.borderColor??'#172554','frame.borderColor'),
      fontSize:between(s.frame.fontSize??2.4,.75,6,'frame.fontSize'),
      padding:between(s.frame.padding??1.5,0,6,'frame.padding'),
      borderWidth:between(s.frame.borderWidth??0,0,1.5,'frame.borderWidth'),
      radius:between(s.frame.radius??0,0,5,'frame.radius')});
  }
  s.motion=normalizeMotion(s.motion);
  s.images=normalizeImages(s.images);
  s.shadows=normalizeShadows(s.shadows);
  if(s.logo!=null){
    assertObject(s.logo,'logo');onlyKeys(s.logo,['dataUrl','size','padding','rounding','background','clearModules'],'logo');
    if(typeof s.logo.dataUrl!=='string' || !/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i.test(s.logo.dataUrl) || s.logo.dataUrl.length>16_000_000)
      fail('INVALID_IMAGE','Only embedded raster logo data URLs up to 16 MB are allowed');
    if(s.logo.clearModules!=null && typeof s.logo.clearModules!=='boolean') fail('INVALID_STYLE','logo.clearModules must be a boolean');
    s.logo=Object.freeze({dataUrl:s.logo.dataUrl,size:between(s.logo.size??.16,.04,.30,'logo.size'),
      padding:between(s.logo.padding??.5,0,4,'logo.padding'),rounding:between(s.logo.rounding??.12,0,.5,'logo.rounding'),
      background:['match','transparent'].includes(s.logo.background??'match')?(s.logo.background??'match'):validColor(s.logo.background,'logo.background'),
      clearModules:s.logo.clearModules??true});
  }
  return Object.freeze(s);
}
export function logoBounds(qr, logo) {
  if(!logo) return null;
  const width=qr.matrix.width??qr.matrix.size, height=qr.matrix.height??qr.matrix.size;
  const imageSize=Math.min(width,height)*logo.size;
  const imageX=(width-imageSize)/2,imageY=(height-imageSize)/2,pad=logo.padding;
  return Object.freeze({imageX,imageY,imageSize,x:imageX-pad,y:imageY-pad,size:imageSize+pad*2});
}
function luminance(hex){
  if(hex==='transparent')return null;
  let h=hex.slice(1);if(h.length===3||h.length===4)h=[...h].map(x=>x+x).join('');
  if(h.length===8 && parseInt(h.slice(6),16)<255)return null;
  const a=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return .2126*a[0]+.7152*a[1]+.0722*a[2];
}
const paintColors = p => typeof p==='string'?[p]:p?.stops?.map(s=>s.color)??[];
export function analyzeDesign(qr,style={}) {
  const s=normalizeStyle(style),warnings=[...qr.warnings];
  const warn=(code,message,severity='warning')=>warnings.push({code,message,severity});
  const micro=qr.metadata.kind==='Micro QR';
  const minQuiet=(micro || qr.metadata.kind==='rMQR')?2:4;
  if(s.quietZone<minQuiet)warn('QUIET_ZONE_SMALL',`The ${minQuiet}-module recommended quiet zone is reduced; scanners may fail.`);
  const bg=s.paints?.background??s.background, fg=s.paints?.data??(s.gradient ? {stops:s.gradient.colors.map(color=>({color}))} : s.foreground);
  if(paintColors(bg).includes('transparent') || bg==='transparent')warn('TRANSPARENT_BACKGROUND','Transparent exports need a contrasting final surface; test against your intended background.');
  if(s.moduleScale<.82)warn('SMALL_MODULES','Large gaps between modules can make the code difficult to scan.');
  if(['circle','diamond','horizontal','vertical'].includes(s.shape))warn('DECORATIVE_MODULES','Decorative modules may be less robust than full squares.');
  if(s.eyes && (s.eyes.outerShape==='circle'||s.eyes.innerShape==='circle'))warn('DECORATIVE_EYES','Circular finder patterns are less robust than square finders.');
  const backgrounds=paintColors(bg),foregrounds=paintColors(fg);
  if(backgrounds.some(c=>luminance(c)===null))warn('TRANSPARENT_OR_TRANSLUCENT','Check QR contrast after compositing transparent or translucent colors onto the final surface.');
  if(foregrounds.some(c=>backgrounds.some(b=>{
    const a=luminance(c),z=luminance(b);return a!=null&&z!=null&&(Math.max(a,z)+.05)/(Math.min(a,z)+.05)<4.5;
  })))warn('LOW_CONTRAST','Some QR colors may have insufficient contrast against the background.');
  // A finder eye is a structural locator: invisible frames/centers cannot be
  // treated as a safe design merely because the data-module colors contrast.
  if(qr.metadata.kind!=='rMQR'){
    const base=(area,fallback)=>s.paints?.[area]??fallback;
    const finderBase=base('finder',s.eyes?.outerColor??fg),centerBase=base('finderCenter',s.eyes?.innerColor??fg),
      finderLight=base('finderLight',s.eyes?.lightColor??bg);
    const eyes=qr.metadata.kind==='Micro QR'?['topLeft']:['topLeft','topRight','bottomLeft'];
    const lowContrastParts={frame:[],center:[]};
    for(const position of eyes){
      const override=s.eyes?.positions?.[position]??{};
      const light=override.lightColor??finderLight;
      const substrate=paintColors(light).every(c=>c==='transparent')?bg:light;
      for(const [part,paint] of [['frame',override.outerColor??finderBase],['center',override.innerColor??centerBase]]){
        const colors=paintColors(paint),backgroundColors=paintColors(substrate);
        const invisible=colors.length===0||colors.every(c=>luminance(c)===null);
        if(invisible){warn('INVISIBLE_FINDER',`${position} finder ${part} is transparent or invisible.`,'error');continue;}
        const low=colors.some(c=>backgroundColors.some(b=>{
          const dark=luminance(c),lightL=luminance(b);
          if(dark===null||lightL===null)return true;
          return lightL<=dark || (lightL+.05)/(dark+.05)<3;
        }));
        if(low)lowContrastParts[part].push(position);
      }
    }
    // Aggregate repetitive per-eye contrast alerts into two actionable warnings,
    // while preserving which individual eyes require attention.
    for(const [part,positions] of Object.entries(lowContrastParts))if(positions.length){
      const label=positions.length===eyes.length?'All finder eyes':positions.map(p=>({topLeft:'top-left',topRight:'top-right',bottomLeft:'bottom-left'}[p])).join(', ');
      warn('FINDER_CONTRAST',`${label} ${part==='frame'?'frames':'centers'} may lack dark-on-light contrast. A bright QR on black is inverted and may fail phone cameras.`);
    }
  }
  const structuralRoles=['timing','alignment','format','version','darkModule'];
  for(const role of structuralRoles){
    const paint=s.paints?.[role]??s.components?.[role]?.dark;
    if(paint&&paintColors(paint).every(c=>luminance(c)===null))
      warn('INVISIBLE_FUNCTION',`The ${role} function pattern is invisible.`,'error');
  }

  if(s.logo){
    if(s.logo.size>.18)warn('LARGE_LOGO','Large logos can exceed available error correction.');
    if(['L','M'].includes(qr.metadata.errorCorrection))warn('LOW_ECC_WITH_LOGO','Use Q or H correction when obscuring modules with a logo.');
    if(s.logo.clearModules){
      const rect=logoBounds(qr,s.logo),w=qr.matrix.width??qr.matrix.size,h=qr.matrix.height??qr.matrix.size;
      let overlaps=0;
      for(let y=Math.max(0,Math.floor(rect.y));y<Math.min(h,Math.ceil(rect.y+rect.size));y++)
        for(let x=Math.max(0,Math.floor(rect.x));x<Math.min(w,Math.ceil(rect.x+rect.size));x++)
          if(x+1>rect.x&&y+1>rect.y&&x<rect.x+rect.size&&y<rect.y+rect.size&&qr.matrix.getRoleId(x,y)!==ROLES.DATA)overlaps++;
      if(overlaps)warn('LOGO_OVER_FUNCTION','Logo covers function patterns. Try a smaller logo or a larger QR version.');
    }
  }
  if(micro && qr.metadata.errorCorrection==='None')warn('MICRO_NO_ECC','Micro M1 has no error correction. Avoid logos, decorative patterns, and damage-prone printing.');
  if(s.images?.background)warn('IMAGE_BACKGROUND','An image background may reduce local contrast. Check the finished design on the intended surface.');
  if(s.images?.data)warn('IMAGE_MODULE_FILL','Photo-filled modules can be difficult to scan; prefer high contrast and test the final export.');
  if(s.motion.type!=='none')warn('MOTION_SCAN','Every animated frame must remain readable. Use the scan-focused treatment and test the exported SVG on your phone; pixel self-tests alone cannot guarantee scanning.');
  if(isAurora(s.motion.type)){
    if(s.motion.contrast==='artistic')warn('MOTION_ARTISTIC','Artistic aurora mode lets moving colors through the QR backing. Camera recognition may fail; use Scan-focused for reliable signage.');
    if(s.motion.coverage==='background')warn('MOTION_BACKDROP','Only the background animates; the QR ink remains fixed. Check the quiet zone against all moving colors.');
    if(!s.motion.protectEyes && s.motion.coverage!=='background')warn('MOTION_EYES','Finder eyes and structural QR modules can animate. Their shapes remain fixed and light eye rings remain clear, but test every frame.');
    if(s.motion.coverage==='ink' && s.motion.contrast==='protected' && bg==='transparent')warn('MOTION_TRANSPARENT_SURFACE','Scan-focused darkens animated ink but does not add an opaque light backing to a transparent QR. Test the exported code on its intended surface.');
    const translucentColors=auroraPalette(s.motion).some(color=>color.length===9&&parseInt(color.slice(7),16)<255);
    if(translucentColors&&s.motion.coverage!=='background')warn('MOTION_ALPHA_PALETTE','Translucent motion colors blend over static QR ink and may appear different than their color swatches. Use opaque palette colors for more predictable scanning.');
    if(s.motion.artboard===0 && s.motion.coverage!=='ink')warn('MOTION_ARTBOARD','Increase artwork margin to carry the animation outside the QR code.');
  }
  if(s.motion.type==='wave'){
    const waveL=luminance(s.motion.color);
    if(waveL===null||paintColors(bg).some(color=>{const light=luminance(color);return light!=null&&(light<=waveL|| (light+.05)/(waveL+.05)<4.5)}))
      warn('MOTION_WAVE_CONTRAST','The moving wave color may lack enough dark-on-light contrast. Choose a darker accent or lighten the background.');
  }
  if(s.motion.type==='background'&&s.motion.strength>.8)warn('MOTION_BACKGROUND','Strong animated backgrounds may weaken QR separation. Reduce intensity if scans become unreliable.');
  if(s.shadows && Object.values(s.shadows).some(v=>v.opacity>0))warn('SHADOW_EFFECT','Shadows are decorative, not a substitute for sufficient module-to-background contrast.');
  if(qr.metadata.kind==='rMQR'&&s.shadows?.finder?.opacity>0)warn('RMQR_FINDER_SHADOW_UNSUPPORTED','Finder-only shadows are not rendered for rectangular rMQR codes. Use the QR-pattern shadow instead.');
  if(qr.metadata.kind==='rMQR')warn('RMQR_COMPATIBILITY','Rectangular QR is not supported by every phone camera scanner.');
  if(micro)warn('MICRO_COMPATIBILITY','Micro QR is not supported by every general-purpose scanner.');
  return warnings;
}
