/** Procedural light field inspired by the supplied Python aurora-curtain generator.
 * This module has no QR/canvas/background policy. One periodic spatial field is
 * reusable for an ink mask, a background layer, or both. No external assets.
 */
import {motionCycle,motionPhase,auroraPalette} from './motion.js';
const TAU=Math.PI*2;
const f=n=>Number(n.toFixed(3)).toString();
const types={
  'aurora-veils':{y:[.42,.72],slope:[-.17,.14],sky:['#081932','#0c3561','#071930']},
  'aurora-ribbons':{y:[.23,.53,.81],slope:[-.26,.27,-.14],sky:['#07172f','#085380','#051d43']},
  'aurora-northern':{y:[.28,.54,.76,.37],slope:[-.18,.17,-.19,.23],sky:['#0c1532','#163b56','#171b3b']},
  'ocean-crosscurrents':{y:[.27,.73],slope:[.23,-.2],sky:['#072148','#097eac','#072452']}
};
/** Cross-fade each luminous palette stop toward ink base as strength approaches 0. */
function tint(base,accent,intensity){
  // Palette swatches support RGB and RGBA hex. Preserve alpha while mixing:
  // silently discarding it made the color picker disagree with SVG output.
  const channels=h=>[1,3,5,7].map(i=>i===7 && h.length===7 ? 255 :parseInt(h.slice(i,i+2),16));
  const b=channels(base),a=channels(accent),factor=Math.min(1,Math.max(0,intensity));
  const mixed=b.map((v,i)=>Math.round(v+(a[i]-v)*factor));
  return '#'+mixed.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('')+
    (mixed[3]===255?'':mixed[3].toString(16).padStart(2,'0'));
}
function drift(m,box,phase){
  const p=phase*TAU;
  return [f(box.width*.24*Math.sin(p)),f(box.height*.13*(Math.cos(p)-1))];
}
function contour(u,phase,index,m){
  const type=types[m.type],p=TAU*phase,seed=index*1.61+1.41,
    fluid=m.type==='ocean-crosscurrents',d=m.detail;
  const wide=Math.sin(2.3*u*Math.PI+seed+.85*Math.sin(p+seed));
  const mid=Math.sin(4.8*u*Math.PI+seed*.62+1.13*Math.cos(2*p-seed));
  const fine=Math.sin(10.1*u*Math.PI+seed*.41+.7*Math.sin(p+seed));
  return type.y[index%type.y.length]+type.slope[index%type.slope.length]*(u-.5)
    +(.07+(fluid?.027:.05)*d)*wide+(.028+.02*d)*mid+(fluid?.005:.014)*d*fine;
}
function ribbonPath(index,phase,m,box,part){
  const fluid=m.type==='ocean-crosscurrents',points=56,
    thickness=(fluid?.22:.27)*(.8+.36*m.detail),
    [upper,lower]=part==='veil'?[-1.7,.60]:part==='ridge'?[-.20,.14]:[-.45,.3];
  let d='';
  for(let i=0;i<=points;i++){
    const u=i/points,x=box.x+u*box.width,y=box.y+(contour(u,phase,index,m)+upper*thickness)*box.height;
    d+=(i?'L':'M')+f(x)+' '+f(y);
  }
  for(let i=points;i>=0;i--){
    const u=i/points,x=box.x+u*box.width,y=box.y+(contour(u,phase,index,m)+lower*thickness)*box.height;
    d+='L'+f(x)+' '+f(y);
  }
  return d+'Z';
}
function filamentPath(index,k,phase,m,box){
  const count=Math.round(12+16*m.detail),u=(k+.5)/count,
    y=contour(u,phase,index,m),
    x=box.x+(u+.009*Math.sin(k*.72+phase*TAU+index))*box.width,
    bend=.015*m.detail*Math.sin(k*2.17+phase*TAU+index);
  return `M${f(x)} ${f(box.y+(y-.23)*box.height)}Q${f(x+bend*box.width)} ${f(box.y+(y-.045)*box.height)} ${f(x+bend*box.width*.35)} ${f(box.y+(y+.055)*box.height)}`;
}
function movingPath(index,part,m,box,animate,seconds,k=0){
  const path=phase=>part==='filament'?filamentPath(index,k,phase,m,box):ribbonPath(index,phase,m,box,part);
  const d=path(motionPhase(m,seconds));
  if(!animate)return {d,animation:''};
  const steps=16,frames=Array.from({length:steps+1},(_,i)=>path((m.holdPhase+i/steps)%1)),
    cycle=motionCycle(m),fraction=m.duration/cycle,
    times=Array.from({length:steps+1},(_,i)=>f(i/steps*fraction));
  if(m.hold>0){frames.push(frames[0]);times.push('1');}
  return {d,animation:`<animate attributeName="d" dur="${f(cycle)}s" repeatCount="indefinite" calcMode="linear" keyTimes="${times.join(';')}" values="${frames.join(';')}"/>`};
}
/** Reusable scene: one coherent field, two independently composable surfaces.
 * Ink uses a luminous tinted base instead of the formerly mandatory dark sky.
 * Backdrop is only inserted by the caller when explicitly requested.
 */
export function buildAuroraField(m,box,{animate=false,time=0}={}){
  const type=types[m.type];if(!type)throw Error('Unknown aurora preset');
  const palette=auroraPalette(m),id='qr-aurora',defs=[],art=[],fallback=[],
    rect=`x="${f(box.x)}" y="${f(box.y)}" width="${f(box.width)}" height="${f(box.height)}"`;
  const base=palette[0],sky=type.sky;
  const positions=[0,.26,.52,.75,1],
    mix=[base,palette[1]??base,palette[2]??palette[1]??base,palette[3]??palette[1]??base,base],
    stops=positions.map((o,i)=>`<stop offset="${f(o*100)}%" stop-color="${tint(base,mix[i],m.strength)}"/>`).join(''),
    start=drift(m,box,motionPhase(m,time)),frameTransform=`translate(${start.join(' ')})`;
  let moveGradient='';
  if(animate){
    const frames=16,fraction=m.duration/motionCycle(m),values=[],times=[];
    for(let i=0;i<=frames;i++){
      const shift=drift(m,box,(m.holdPhase+i/frames)%1);
      values.push(shift.join(' '));times.push(f(i/frames*fraction));
    }
    if(m.hold>0){values.push(values[0]);times.push('1');}
    moveGradient=`<animateTransform attributeName="gradientTransform" type="translate" dur="${f(motionCycle(m))}s" repeatCount="indefinite" calcMode="linear" keyTimes="${times.join(';')}" values="${values.join(';')}"/>`;
  }
  defs.push(`<linearGradient id="${id}-base" x1="${f(box.x-box.width*.22)}" y1="${f(box.y)}" x2="${f(box.x+box.width*1.1)}" y2="${f(box.y+box.height*.8)}" gradientUnits="userSpaceOnUse" spreadMethod="reflect" gradientTransform="${frameTransform}">${stops}${moveGradient}</linearGradient>`);
  defs.push(`<linearGradient id="${id}-sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".52" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>`);
  const blur=f(.007*box.height*(.35+.65*m.glow)),haze=f(.026*box.height*(.3+.7*m.glow));
  defs.push(`<filter id="${id}-haze" x="-35%" y="-50%" width="170%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${haze}"/></filter>`);
  defs.push(`<filter id="${id}-soft" x="-35%" y="-50%" width="170%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${blur}"/></filter>`);
  const ribbons=type.y.length;
  for(let i=0;i<ribbons;i++){
    const color=palette[1+(i%(palette.length-1))];
    for(const [part,opacity,filter] of [['veil',.54,'haze'],['core',.94,'soft'],['ridge',.86,'soft']]){
      const path=movingPath(i,part,m,box,animate,time),attrs=`fill="${color}" opacity="${f(opacity*m.strength)}" filter="url(#${id}-${filter})"`;
      art.push(`<path d="${path.d}" ${attrs} class="qr-motion">${path.animation}</path>`);
      if(animate)fallback.push(`<path d="${movingPath(i,part,m,box,false,0).d}" ${attrs}/>`);
    }
    if(m.type!=='ocean-crosscurrents'){
      const count=Math.round(12+16*m.detail);
      for(let k=0;k<count;k++){
        const path=movingPath(i,'filament',m,box,animate,time,k),
          opacity=(.28+.47*Math.pow(.5+.5*Math.sin(k*2.71+i),2))*m.strength,
          attrs=`fill="none" stroke="${color}" stroke-width="${f(box.width*(.002+.002*m.detail))}" stroke-linecap="round" opacity="${f(opacity)}"`;
        art.push(`<path d="${path.d}" ${attrs} class="qr-motion">${path.animation}</path>`);
        if(animate)fallback.push(`<path d="${movingPath(i,'filament',m,box,false,0,k).d}" ${attrs}/>`);
      }
    }
  }
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  const transform=`translate(${f(cx)} ${f(cy)}) rotate(${f(m.fieldRotation)}) scale(${f(m.fieldScale)}) translate(${-f(cx)} ${-f(cy)})`;
  defs.push(`<g id="${id}-art" transform="${transform}">${animate?`<g class="qr-aurora-still">${fallback.join('')}</g><g class="qr-aurora-animated">${art.join('')}</g>`:art.join('')}</g>`);
  defs.push(`<g id="${id}-field"><rect ${rect} fill="url(#${id}-base)"/><use href="#${id}-art"/></g>`);
  defs.push(`<g id="${id}-background"><rect ${rect} fill="url(#${id}-sky)"/><use href="#${id}-art"/></g>`);
  return {defs,inkField:`<use href="#${id}-field"/>`,backgroundField:`<use href="#${id}-background"/>`};
}
