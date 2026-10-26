import {fail} from './errors.js';

/** Motion is independent of encoding, layout, and paints. Older motion JSON remains valid. */
export const MOTION_DEFAULTS=Object.freeze({
  type:'none',color:'#1464ac',strength:.72,duration:3.2,width:.38,angle:0,
  protectEyes:true,hold:0,holdPhase:0,coverage:'ink',artboard:0,contrast:'protected',
  detail:.58,glow:.58,fieldScale:1,fieldRotation:0,palette:null
});
export const MOTION_TYPES=Object.freeze(['none','wave','background','glow',
  'aurora-veils','aurora-ribbons','aurora-northern','ocean-crosscurrents']);
export const AURORA_TYPES=Object.freeze(MOTION_TYPES.slice(4));
/** First entry is ink-base color, remaining entries color the flowing ribbons. */
export const AURORA_PALETTES=Object.freeze({
  'aurora-veils':Object.freeze(['#103467','#0dd1df','#166bdb','#48dfea']),
  'aurora-ribbons':Object.freeze(['#073a76','#0cd5ed','#1979e9','#25dcff']),
  'aurora-northern':Object.freeze(['#1c3365','#8a4ddd','#25d6a5','#2aca77','#9f50cb']),
  'ocean-crosscurrents':Object.freeze(['#094276','#29d9e9','#086dc4','#5cdeee'])
});
export const AURORA_COLORS=Object.freeze({'aurora-veils':'#18d4e7','aurora-ribbons':'#12dcf1',
  'aurora-northern':'#47eeb2','ocean-crosscurrents':'#51dce9'});
export const isAurora=type=>AURORA_TYPES.includes(type);
export function auroraPalette(m){
  const original=AURORA_PALETTES[m.type]??AURORA_PALETTES['aurora-veils'];
  return m.palette??[original[0],m.color??original[1],...original.slice(2)];
}
export function motionCycle(m){return m.duration+(m.hold??0);}
/** Periodic fluid motion begins and ends on the selected hold frame. */
export function motionPhase(m,seconds){
  const cycle=motionCycle(m),local=((seconds%cycle)+cycle)%cycle;
  const progress=Math.min(local,m.duration)/m.duration;
  const offset=m.holdPhase??0;
  return progress===1&&offset===0?1:(progress+offset)%1;
}
export function normalizeMotion(value=null){
  if(value==null)return MOTION_DEFAULTS;
  if(typeof value!=='object'||Array.isArray(value))fail('INVALID_MOTION','motion must be an object');
  for(const key of Object.keys(value))if(!Object.hasOwn(MOTION_DEFAULTS,key))fail('INVALID_MOTION',`Unknown motion option: ${key}`);
  const result={...MOTION_DEFAULTS,...value};
  if(isAurora(result.type)){
    const preset={color:AURORA_COLORS[result.type],strength:.86,duration:6,hold:2,
      artboard:0,coverage:'ink',protectEyes:false};
    for(const [key,v] of Object.entries(preset))if(value[key]===undefined)result[key]=v;
  }
  if(!MOTION_TYPES.includes(result.type))fail('INVALID_MOTION','Unknown animation type');
  const hex=/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
  if(!hex.test(result.color))fail('INVALID_MOTION','Motion color must be #RRGGBB or #RRGGBBAA');
  if(result.palette!==null){
    if(!isAurora(result.type)||!Array.isArray(result.palette)||result.palette.length<3||result.palette.length>8||result.palette.some(c=>typeof c!=='string'||!hex.test(c)))
      fail('INVALID_MOTION','Aurora palette must have 3–8 opaque hex colors');
    result.palette=Object.freeze([...result.palette]);
  }
  for(const [key,min,max] of [['strength',0,1],['duration',.8,30],['hold',0,20],['holdPhase',0,1],
    ['width',.08,1],['angle',-180,180],['fieldScale',.6,2.5],['fieldRotation',-180,180],['artboard',0,24],['detail',0,1],['glow',0,1]]){
    if(typeof result[key]!=='number'||!Number.isFinite(result[key])||result[key]<min||result[key]>max)
      fail('INVALID_MOTION',`motion.${key} must be between ${min} and ${max}`);
  }
  if(typeof result.protectEyes!=='boolean')fail('INVALID_MOTION','protectEyes must be a boolean');
  if(!['both','ink','background'].includes(result.coverage))fail('INVALID_MOTION','motion.coverage must be both, ink or background');
  if(!['protected','artistic'].includes(result.contrast))fail('INVALID_MOTION','motion.contrast must be protected or artistic');
  return Object.freeze(result);
}
