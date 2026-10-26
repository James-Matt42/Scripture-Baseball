import {ROLES, ROLE_NAMES} from './roles.js';
import {normalizeStyle,logoBounds} from './styles.js';
import {fail} from './errors.js';
import {isAurora,motionCycle,motionPhase} from './motion.js';
import {buildAuroraField} from './aurora-field.js';

const escapeText=v=>String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const fmt=n=>Number(n.toFixed(4)).toString();
const rect=(x,y,w,h,r=0)=>{
  r=Math.min(Math.max(r,0),w/2,h/2);
  if(!r)return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h-${fmt(w)}Z`;
  return `M${fmt(x+r)} ${fmt(y)}H${fmt(x+w-r)}Q${fmt(x+w)} ${fmt(y)} ${fmt(x+w)} ${fmt(y+r)}V${fmt(y+h-r)}Q${fmt(x+w)} ${fmt(y+h)} ${fmt(x+w-r)} ${fmt(y+h)}H${fmt(x+r)}Q${fmt(x)} ${fmt(y+h)} ${fmt(x)} ${fmt(y+h-r)}V${fmt(y+r)}Q${fmt(x)} ${fmt(y)} ${fmt(x+r)} ${fmt(y)}Z`;
};
function centerPath(x,y,n,shape){
  if(shape==='circle'){const cx=x+n/2,cy=y+n/2,r=n/2;return `M${fmt(cx+r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 -${fmt(2*r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2*r)} 0Z`;}
  return rect(x,y,n,n,shape==='rounded'?n*.33:0);
}
function ringPath(x,y,outer,inner,shape){
  if(shape==='circle'){
    const cx=x+outer/2,cy=y+outer/2,ro=outer/2,ri=inner/2;
    return `M${fmt(cx+ro)} ${fmt(cy)}a${fmt(ro)} ${fmt(ro)} 0 1 0 -${fmt(2*ro)} 0a${fmt(ro)} ${fmt(ro)} 0 1 0 ${fmt(2*ro)} 0Z`
     +`M${fmt(cx+ri)} ${fmt(cy)}a${fmt(ri)} ${fmt(ri)} 0 1 0 -${fmt(2*ri)} 0a${fmt(ri)} ${fmt(ri)} 0 1 0 ${fmt(2*ri)} 0Z`;
  }
  const gap=(outer-inner)/2;
  return rect(x,y,outer,outer,shape==='rounded'?1.55:0)+rect(x+gap,y+gap,inner,inner,shape==='rounded'?.9:0);
}
function modulePath(x,y,opts,qr,moduleX,moduleY){
  const shape=opts.shape,scale=shape==='connected-rounded'?1:opts.moduleScale,inset=(1-scale)/2;
  const a=x+inset,b=y+inset,w=scale;
  if(shape==='square')return rect(a,b,w,w);
  if(shape==='rounded')return rect(a,b,w,w,w*opts.cornerRadius);
  if(shape==='circle')return centerPath(a,b,w,'circle');
  if(shape==='diamond')return `M${fmt(a+w/2)} ${fmt(b)}L${fmt(a+w)} ${fmt(b+w/2)}L${fmt(a+w/2)} ${fmt(b+w)}L${fmt(a)} ${fmt(b+w/2)}Z`;
  if(shape==='horizontal')return rect(a,b+w*.28,w,w*.44,Math.min(opts.cornerRadius*w*.4,w*.2));
  if(shape==='vertical')return rect(a+w*.28,b,w*.44,w,Math.min(opts.cornerRadius*w*.4,w*.2));
  if(shape==='connected-rounded'){
    const c=(xx,yy)=>qr.matrix.getModule(xx,yy)&&qr.matrix.getRoleId(xx,yy)===ROLES.DATA;
    const r=opts.cornerRadius,tl=!c(moduleX-1,moduleY)&&!c(moduleX,moduleY-1)?r:0,
      tr=!c(moduleX+1,moduleY)&&!c(moduleX,moduleY-1)?r:0,
      br=!c(moduleX+1,moduleY)&&!c(moduleX,moduleY+1)?r:0,
      bl=!c(moduleX-1,moduleY)&&!c(moduleX,moduleY+1)?r:0;
    return `M${fmt(x+tl)} ${fmt(y)}H${fmt(x+1-tr)}`+(tr?`Q${fmt(x+1)} ${fmt(y)} ${fmt(x+1)} ${fmt(y+tr)}`:'')+`V${fmt(y+1-br)}`+(br?`Q${fmt(x+1)} ${fmt(y+1)} ${fmt(x+1-br)} ${fmt(y+1)}`:'')+`H${fmt(x+bl)}`+(bl?`Q${fmt(x)} ${fmt(y+1)} ${fmt(x)} ${fmt(y+1-bl)}`:'')+`V${fmt(y+tl)}`+(tl?`Q${fmt(x)} ${fmt(y)} ${fmt(x+tl)} ${fmt(y)}`:'')+'Z';
  }
  throw Error('Unexpected module shape');
}
function paintEquals(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function legacyGradient(g){return {type:g.type,stops:g.colors.map((color,i)=>({offset:i/(g.colors.length-1),color})),angle:g.rotation,cx:.5,cy:.5,radius:.71};}
/** Pure SVG renderer. Layer order: substrate -> background image -> shadows ->
 * canonical QR paints -> photographic module fill -> finder eyes -> logo.
 * Filters, clips, gradients and user images are embedded: no remote fetches.
 */
export function renderSVG(qr,style={}, {animate=false,frameTime=null}={}){
  if(frameTime!==null&&(!Number.isFinite(frameTime)||frameTime<0))fail('INVALID_MOTION','frameTime must be a nonnegative number of seconds');
  if(!qr?.matrix||!qr?.metadata)fail('INVALID_INPUT','renderSVG requires an encoded QR object');
  const s=normalizeStyle(style),w=qr.matrix.width??qr.matrix.size,h=qr.matrix.height??qr.matrix.size,
    margin=s.quietZone,totalW=w+2*margin,totalH=h+2*margin+(s.frame?.label?s.frame.fontSize+s.frame.padding*2:0),
    artboard=s.motion.type==='none'?0:s.motion.artboard,
    view={x:-artboard,y:-artboard,width:totalW+2*artboard,height:totalH+2*artboard},
    outputWidth=s.size,outputHeight=Math.max(1,Math.round(outputWidth*view.height/view.width));
  const keys=s.paints??{},eye=s.eyes??{},legacy=s.gradient?legacyGradient(s.gradient):null;
  const bg=keys.background??s.background,quiet=keys.quietZone??bg;
  const data=keys.data??(legacy??s.foreground);
  const colorOf=(role,dark)=>{
    if(!dark){if(role===ROLES.FINDER||role===ROLES.FINDER_CENTER)return keys.finderLight??eye.lightColor??s.components?.finder?.light??bg;
      return s.components?.[ROLE_NAMES[role]]?.light??bg;}
    const roleName=ROLE_NAMES[role];
    if(keys[roleName])return keys[roleName];
    if(role===ROLES.FINDER && eye.outerColor)return eye.outerColor;
    if(role===ROLES.FINDER_CENTER && eye.innerColor)return eye.innerColor;
    if(s.components?.[roleName]?.dark)return s.components[roleName].dark;
    if(legacy && (s.gradient.applyTo==='all'||role===ROLES.DATA))return legacy;
    return data;
  };
  // Bounds for named roles are calculated once. A paint can be in symbol,
  // component, eye, or single-module coordinates without changing QR geometry.
  const finderCoords=qr.metadata.kind==='Micro QR'?[[0,0,'topLeft']]:qr.metadata.kind==='QR Model 2'?[[0,0,'topLeft'],[w-7,0,'topRight'],[0,h-7,'bottomLeft']]:[];
  const roleBounds=new Map();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const role=ROLE_NAMES[qr.matrix.getRoleId(x,y)];
    const b=roleBounds.get(role)??{x:x+margin,y:y+margin,x2:x+margin+1,y2:y+margin+1};
    b.x=Math.min(b.x,x+margin);b.y=Math.min(b.y,y+margin);
    b.x2=Math.max(b.x2,x+margin+1);b.y2=Math.max(b.y2,y+margin+1);
    roleBounds.set(role,b);
  }
  const eyeBounds=new Map(finderCoords.map(([x,y,key])=>[key,{x:x+margin,y:y+margin,width:7,height:7}]));
  const globalBounds={x:0,y:0,width:totalW,height:totalH};
  const boundsFor=(paint,context={})=>{
    const space=paint.space??'global';
    if(space==='global')return globalBounds;
    if(space==='module'&&context.cell)return {x:context.cell.x,y:context.cell.y,width:context.cell.width??1,height:context.cell.height??1};
    if((space==='eye'||space==='module')&&context.eye&&eyeBounds.has(context.eye))return eyeBounds.get(context.eye);
    const role=context.role??'data';
    if(role==='background')return {x:margin,y:margin,width:w,height:h};
    if(role==='quietZone')return {x:0,y:0,width:totalW,height:h+2*margin};
    const region=roleBounds.get(role==='finderLight'?'finder':role);
    return region?{x:region.x,y:region.y,width:region.x2-region.x,height:region.y2-region.y}:globalBounds;
  };
  let paintIndex=0;
  const defs=[],paintIds=new Map();
  const resolvePaint=(paint,context={})=>{
    if(typeof paint==='string')return paint;
    const box=boundsFor(paint,context),key=JSON.stringify([paint,box]);
    if(paintIds.has(key))return paintIds.get(key);
    const id=`qr-paint-${paintIndex++}`,stops=paint.stops.map(v=>`<stop offset="${fmt(v.offset*100)}%" stop-color="${v.color}"/>`).join('');
    if(paint.type==='radial'){
      const centerX=box.x+paint.cx*box.width,centerY=box.y+paint.cy*box.height,r=paint.radius*Math.max(box.width,box.height);
      defs.push(`<radialGradient id="${id}" cx="${fmt(centerX)}" cy="${fmt(centerY)}" r="${fmt(r)}" gradientUnits="userSpaceOnUse">${stops}</radialGradient>`);
    }else{
      const theta=(paint.angle??0)*Math.PI/180,cx=box.x+box.width/2,cy=box.y+box.height/2,dx=Math.cos(theta)*box.width/2,dy=Math.sin(theta)*box.height/2;
      defs.push(`<linearGradient id="${id}" x1="${fmt(cx-dx)}" y1="${fmt(cy-dy)}" x2="${fmt(cx+dx)}" y2="${fmt(cy+dy)}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>`);
    }
    const ref=`url(#${id})`;paintIds.set(key,ref);return ref;
  };
  const overlays=[],paths=new Map(),dataSilhouette=[],moduleSilhouette=[];
  const add=(paint,path,context={})=>{const fill=resolvePaint(paint,context);if(fill==='transparent')return;if(!paths.has(fill))paths.set(fill,[]);paths.get(fill).push(path);};
  const logo=logoBounds(qr,s.logo);
  const overlap=(r,x,y)=>x<r.x+r.size && x+1>r.x && y<r.y+r.size && y+1>r.y;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(logo && s.logo.clearModules && overlap(logo,x,y))continue;
    const role=qr.matrix.getRoleId(x,y),dark=qr.matrix.getModule(x,y);
    if((role===ROLES.FINDER||role===ROLES.FINDER_CENTER)&&finderCoords.length)continue;
    const path=role===ROLES.DATA&&dark?modulePath(x+margin,y+margin,s,qr,x,y):rect(x+margin,y+margin,1,1);
    if(dark){moduleSilhouette.push(path);if(role===ROLES.DATA)dataSilhouette.push(path);}
    const paint=role===ROLES.DATA&&dark?data:colorOf(role,dark);
    if(!dark && paintEquals(paint,bg))continue;
    add(paint,path,{role:ROLE_NAMES[role],cell:{x:x+margin,y:y+margin}});
  }
  const eyeShapes=[],eyeSilhouette=[];
  for(const [fx,fy,key] of finderCoords){
    const perEye=eye.positions?.[key]??{},x=fx+margin,y=fy+margin,
      outer=perEye.outerColor??keys.finder??eye.outerColor??colorOf(ROLES.FINDER,true),
      inner=perEye.innerColor??keys.finderCenter??eye.innerColor??colorOf(ROLES.FINDER_CENTER,true),
      light=perEye.lightColor??keys.finderLight??eye.lightColor??colorOf(ROLES.FINDER,false),
      outerShape=perEye.outerShape??eye.outerShape??'square',innerShape=perEye.innerShape??eye.innerShape??'square';
    if(light!=='transparent')eyeShapes.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="7" height="7" fill="${resolvePaint(light,{role:'finderLight',eye:key})}"/>`);
    const ring=ringPath(x,y,7,5,outerShape),center=centerPath(x+2,y+2,3,innerShape);
    if(outer!=='transparent'){
      eyeShapes.push(`<path d="${ring}" fill="${resolvePaint(outer,{role:'finder',eye:key})}" fill-rule="evenodd"/>`);
      eyeSilhouette.push(`<path d="${ring}" fill="black" fill-rule="evenodd" clip-rule="evenodd"/>`);
    }
    if(inner!=='transparent'){
      eyeShapes.push(`<path d="${center}" fill="${resolvePaint(inner,{role:'finderCenter',eye:key})}"/>`);
      eyeSilhouette.push(`<path d="${center}" fill="black"/>`);
    }
  }
  const regionClip='qr-matrix-region';
  if(s.images||s.shadows||animate||frameTime!==null)defs.push(`<clipPath id="${regionClip}"><rect x="${margin}" y="${margin}" width="${w}" height="${h}"/></clipPath>`);
  if(s.images?.data&&dataSilhouette.length)defs.push(`<clipPath id="qr-data-image-clip"><path d="${dataSilhouette.join('')}"/></clipPath>`);
  // A filter is applied to the image alone, then the optional tint is layered on top.
  const imageSvg=(layer,key,clip)=>{
    const filterId=`qr-image-filter-${key}`;
    const slope=layer.brightness*layer.contrast,intercept=(1-layer.contrast)*.5;
    defs.push(`<filter id="${filterId}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">`
      +`<feColorMatrix type="saturate" values="${fmt(layer.saturation)}"/>`
      +`<feComponentTransfer><feFuncR type="linear" slope="${fmt(slope)}" intercept="${fmt(intercept)}"/><feFuncG type="linear" slope="${fmt(slope)}" intercept="${fmt(intercept)}"/><feFuncB type="linear" slope="${fmt(slope)}" intercept="${fmt(intercept)}"/></feComponentTransfer>`
      +(layer.blur>0?`<feGaussianBlur stdDeviation="${fmt(layer.blur)}"/>`:'')
      +(layer.tone!=='none'&&layer.toneStrength>0?`<feComponentTransfer><feFuncR type="linear" slope="${fmt(1-.72*layer.toneStrength)}" intercept="${fmt(layer.tone==='light'?.72*layer.toneStrength:0)}"/><feFuncG type="linear" slope="${fmt(1-.72*layer.toneStrength)}" intercept="${fmt(layer.tone==='light'?.72*layer.toneStrength:0)}"/><feFuncB type="linear" slope="${fmt(1-.72*layer.toneStrength)}" intercept="${fmt(layer.tone==='light'?.72*layer.toneStrength:0)}"/></feComponentTransfer>`:'') +(layer.posterize>=2?`<feComponentTransfer>${['R','G','B'].map(c=>`<feFunc${c} type="discrete" tableValues="${Array.from({length:layer.posterize},(_,i)=>fmt(i/(layer.posterize-1))).join(' ')}"/>`).join('')}</feComponentTransfer>`:'')+'</filter>');
    // With source aspect ratio, compute precise cover/contain geometry so focal position
    // pans even when zoom=100% (for example, a landscape photo cropped square).
    // Without it, retain the compatible SVG built-in aspect-ratio behavior.
    let iw=w*layer.zoom,ih=h*layer.zoom;
    if(layer.aspectRatio){
      const ratio=layer.aspectRatio,target=w/h;
      if((layer.fit==='cover'&&ratio>=target)||(layer.fit==='contain'&&ratio<target)){
        ih=h*layer.zoom;iw=ih*ratio;
      }else{iw=w*layer.zoom;ih=iw/ratio;}
    }
    const x=margin+(w-iw)*layer.x,y=margin+(h-ih)*layer.y;
    const aspect=layer.aspectRatio?'none':`xMidYMid ${layer.fit==='cover'?'slice':'meet'}`;
    const transform=layer.rotation?` transform="rotate(${fmt(layer.rotation)} ${fmt(margin+w/2)} ${fmt(margin+h/2)})"`:'';
    const image=`<image x="${fmt(x)}" y="${fmt(y)}" width="${fmt(iw)}" height="${fmt(ih)}" preserveAspectRatio="${aspect}" href="${layer.dataUrl}"${transform} filter="url(#${filterId})"/>`;
    const tint=(layer.tone==='none'||layer.toneStrength===0)&&layer.tintOpacity>0?`<rect x="${margin}" y="${margin}" width="${w}" height="${h}" fill="${layer.tint}" opacity="${fmt(layer.tintOpacity)}"/>`:'';
    return `<g clip-path="url(#${clip})" opacity="${fmt(layer.opacity)}"${layer.blendMode==='normal'?'':` style="mix-blend-mode:${layer.blendMode}"`}>${image}${tint}</g>`;
  };
  const shadows=[];
  const shadowSvg=(target,silhouette)=>{
    const sh=s.shadows?.[target];if(!sh||sh.opacity===0||!silhouette)return;
    const id=`qr-shadow-${target}`;
    // Shadow is filtered as one silhouette, not individual modules. Permit its
    // feathering into the quiet zone; do not hard-clip at the QR matrix edge.
    const extent=Math.max(margin,sh.blur*4+Math.abs(sh.offsetX)+Math.abs(sh.offsetY)+1);
    defs.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="${fmt(-extent)}" y="${fmt(-extent)}" width="${fmt(totalW+extent*2)}" height="${fmt(h+margin*2+extent*2)}" color-interpolation-filters="sRGB">`
      +`<feGaussianBlur in="SourceAlpha" stdDeviation="${fmt(sh.blur)}" result="soft"/>`
      +`<feOffset in="soft" dx="${fmt(sh.offsetX)}" dy="${fmt(sh.offsetY)}" result="shift"/>`
      +`<feFlood flood-color="${sh.color}" flood-opacity="${fmt(sh.opacity)}" result="ink"/>`
      +`<feComposite in="ink" in2="shift" operator="in"/></filter>`);
    shadows.push(`<g filter="url(#${id})">${silhouette}</g>`);
  };
  shadowSvg('modules',moduleSilhouette.length?`<path d="${moduleSilhouette.join('')}" fill="black"/>`:'');
  shadowSvg('finder',eyeSilhouette.join(''));
  const clipId='qr-logo-clip';
  if(logo && s.logo.rounding>0)defs.push(`<clipPath id="${clipId}"><rect x="${fmt(logo.imageX+margin)}" y="${fmt(logo.imageY+margin)}" width="${fmt(logo.imageSize)}" height="${fmt(logo.imageSize)}" rx="${fmt(logo.imageSize*s.logo.rounding)}"/></clipPath>`);
  if(logo){
    const logoShadow=s.shadows?.logo;
    if(logoShadow?.opacity>0){
      // A separate logo shadow is deliberately not clipped to the QR region.
      const id='qr-shadow-logo';
      defs.push(`<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${fmt(logoShadow.blur)}" result="soft"/><feOffset in="soft" dx="${fmt(logoShadow.offsetX)}" dy="${fmt(logoShadow.offsetY)}" result="shift"/><feFlood flood-color="${logoShadow.color}" flood-opacity="${fmt(logoShadow.opacity)}" result="ink"/><feComposite in="ink" in2="shift" operator="in"/></filter>`);
      overlays.push(`<path d="${rect(logo.imageX+margin,logo.imageY+margin,logo.imageSize,logo.imageSize,s.logo.rounding*logo.imageSize)}" fill="black" filter="url(#${id})"/>`);
    }
    if(s.logo.background!=='match'&&s.logo.background!=='transparent')overlays.push(`<path d="${rect(logo.x+margin,logo.y+margin,logo.size,logo.size,s.logo.rounding*logo.imageSize+s.logo.padding)}" fill="${s.logo.background}"/>`);
    overlays.push(`<image x="${fmt(logo.imageX+margin)}" y="${fmt(logo.imageY+margin)}" width="${fmt(logo.imageSize)}" height="${fmt(logo.imageSize)}" href="${s.logo.dataUrl}" preserveAspectRatio="xMidYMid meet"${s.logo.rounding>0?` clip-path="url(#${clipId})"`:''}/>`);
  }
  // One shared procedural field is composed into the full artwork and into
  // only the QR dark ink (data modules and optionally finder ring/centers).
  const isFluid=isAurora(s.motion.type);
  let auroraBackground='',auroraInk='';
  if(isFluid){
    const scene=buildAuroraField(s.motion,view,{animate,time:frameTime??0});
    defs.push(...scene.defs);
    if(s.motion.coverage!=='ink')auroraBackground=`<g class="qr-motion-scene">${scene.backgroundField}</g>`;
    if(s.motion.coverage!=='background'){
      const clip='qr-aurora-ink-clip';
      const movingModules=s.motion.protectEyes?dataSilhouette:moduleSilhouette;
      defs.push(`<clipPath id="${clip}"><path d="${movingModules.join('')}"/>${s.motion.protectEyes?'':eyeSilhouette.join('')}</clipPath>`);
      const slope=s.motion.contrast==='protected'?.50:.90;
      defs.push(`<filter id="qr-aurora-ink-tone" color-interpolation-filters="sRGB" x="-5%" y="-5%" width="110%" height="110%"><feComponentTransfer><feFuncR type="linear" slope="${fmt(slope*1.20)}"/><feFuncG type="linear" slope="${fmt(slope*.93)}"/><feFuncB type="linear" slope="${fmt(slope*1.62)}"/></feComponentTransfer></filter>`);
      auroraInk=`<g clip-path="url(#${clip})" class="qr-motion-ink"><g filter="url(#qr-aurora-ink-tone)">${scene.inkField}</g></g>`;
    }
  }
  // Shared motion geometry for SMIL animation and deterministic frame snapshots.
  // The encoded modules never change.
  let motionBelow='',motionAbove='';
  if((animate||frameTime!==null)&&s.motion.type!=='none'&&!isFluid){
    const m=s.motion,band=Math.max(2,w*m.width),theta=m.angle*Math.PI/180,
      centerX=margin+w/2,centerY=margin+h/2,
      projection=(Math.abs(Math.cos(theta))*totalW+Math.abs(Math.sin(theta))*totalH)/2,
      start=centerX-projection-band,end=centerX+projection,
      longSide=3*Math.hypot(totalW,totalH),
      time=frameTime===null?0:motionPhase(m,frameTime),
      cycle=motionCycle(m),fraction=m.duration/cycle,
      accentOpacity=m.type==='background'?Math.min(.22,m.strength*.23):m.strength,
      duration=`${fmt(cycle)}s`;
    const gradientId='qr-motion-gradient';
    if(m.type==='wave'||m.type==='background'){
      defs.push(`<linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${m.color}" stop-opacity="0"/><stop offset=".23" stop-color="${m.color}" stop-opacity=".08"/><stop offset=".5" stop-color="${m.color}" stop-opacity="1"/><stop offset=".77" stop-color="${m.color}" stop-opacity=".08"/><stop offset="1" stop-color="${m.color}" stop-opacity="0"/></linearGradient>`);
      const fixedX=start+(end-start)*time;
      const bandSvg=`<g transform="rotate(${fmt(m.angle)} ${fmt(centerX)} ${fmt(centerY)})"><rect x="${fmt(frameTime===null?start:fixedX)}" y="${fmt(centerY-longSide/2)}" width="${fmt(band)}" height="${fmt(longSide)}" fill="url(#${gradientId})" opacity="${fmt(accentOpacity)}">${frameTime===null?`<animate attributeName="x" values="${fmt(start)};${fmt(end)}${m.hold?';'+fmt(end):''}" ${m.hold?`keyTimes="0;${fmt(fraction)};1"`:''} dur="${duration}" repeatCount="indefinite"/>`:''}</rect></g>`;
      if(m.type==='wave'){
        // Safest default: do not animate finder, timing, alignment or other
        // function modules. The user can explicitly include all dark ink.
        const clip='qr-motion-ink-clip',silhouette=m.protectEyes?dataSilhouette:moduleSilhouette;
        defs.push(`<clipPath id="${clip}"><path d="${silhouette.join('')}"/>${m.protectEyes?'':eyeSilhouette.join('')}</clipPath>`);
        motionAbove=`<g class="qr-motion" clip-path="url(#${clip})">${bandSvg}</g>`;
      }else{
        // Restrained alpha reduces the chance a moving background tint will
        // destroy QR/light-cell separation. This is not a scan guarantee.
        // Keep even a 100% intensity setting subtle enough to avoid turning
        // light modules into dark ones on an ordinary light background. The
        // rect already has the capped opacity; do not multiply it a second
        // time or this mode becomes almost invisible.
        motionBelow=`<g class="qr-motion"${artboard?'':` clip-path="url(#${regionClip})"`}>${bandSvg}</g>`;
      }
    }else if(m.type==='glow'){
      const low=m.strength*.08,high=m.strength*.72;
      defs.push('<filter id="qr-motion-halo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".85"/></filter>');
      const level=low+(high-low)*(time<=.5?2*time:2*(1-time));
      motionBelow=`<g class="qr-motion" opacity="${fmt(frameTime===null?low:level)}"><rect x="${fmt(margin-1)}" y="${fmt(margin-1)}" width="${fmt(w+2)}" height="${fmt(h+2)}" rx="1.7" fill="none" stroke="${m.color}" stroke-width="1.1" filter="url(#qr-motion-halo)"/>${frameTime===null?`<animate attributeName="opacity" values="${fmt(low)};${fmt(high)};${fmt(low)}${m.hold?';'+fmt(low):''}" ${m.hold?`keyTimes="0;${fmt(fraction/2)};${fmt(fraction)};1"`:''} dur="${duration}" repeatCount="indefinite"/>`:''}</g>`;
    }
  }
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="${fmt(view.x)} ${fmt(view.y)} ${fmt(view.width)} ${fmt(view.height)}" role="img">`];
  if(s.title)out.push(`<title>${escapeText(s.title)}</title>`);
  const quietFill=resolvePaint(quiet,{role:'quietZone'}),bgFill=resolvePaint(bg,{role:'background'});
  if(artboard && !auroraBackground && quietFill!=='transparent')out.push(`<rect x="${fmt(view.x)}" y="${fmt(view.y)}" width="${fmt(view.width)}" height="${fmt(view.height)}" fill="${quietFill}"/>`);
  if(auroraBackground)out.push(auroraBackground);
  if(isFluid&&auroraBackground){
    // Full-artboard animation continues underneath the light, scan-aware QR
    // backing; the moving ink is the same spatial field with a darker treatment.
    const alpha=s.motion.contrast==='protected'?.98:.72;
    out.push(`<rect x="0" y="0" width="${fmt(totalW)}" height="${fmt(h+2*margin)}" fill="#f4faff" opacity="${fmt(alpha)}"/>`);
  }else{
    if(quietFill!=='transparent')out.push(`<path d="M0 0H${totalW}V${totalH}H0Z" fill="${quietFill}"/>`);
    if(!paintEquals(quiet,bg)&&bgFill!=='transparent')out.push(`<rect x="${margin}" y="${margin}" width="${w}" height="${h}" fill="${bgFill}"/>`);
  }
  if(s.images?.background)out.push(imageSvg(s.images.background,'background',regionClip));
  if(motionBelow)out.push(motionBelow);
  out.push(...shadows);
  for(const [fill,d] of paths)out.push(`<path fill="${fill}" d="${d.join('')}"${s.shape==='square'?' shape-rendering="crispEdges"':''}/>`);
  if(s.images?.data && dataSilhouette.length)out.push(imageSvg(s.images.data,'data','qr-data-image-clip'));
  out.push(...eyeShapes);
  if(motionAbove)out.push(motionAbove);
  if(auroraInk)out.push(auroraInk);
  out.push(...overlays);
  if(s.frame?.label){
    const top=h+2*margin,height=totalH-top,fontSize=Math.min(s.frame.fontSize,(totalW-2)/(Math.max(1,Array.from(s.frame.label).length)*.64));
    if(s.frame.fill!=='transparent')out.push(`<rect x="0" y="${fmt(top)}" width="${fmt(totalW)}" height="${fmt(height)}" fill="${s.frame.fill}"/>`);
    out.push(`<text x="${fmt(totalW/2)}" y="${fmt(top+(height+fontSize*.72)/2)}" font-size="${fmt(fontSize)}" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle" fill="${s.frame.labelColor}">${escapeText(s.frame.label)}</text>`);
  }
  if(s.frame?.borderWidth>0){
    const b=s.frame.borderWidth;out.push(`<rect x="${fmt(b/2)}" y="${fmt(b/2)}" width="${fmt(totalW-b)}" height="${fmt(totalH-b)}" rx="${fmt(s.frame.radius)}" fill="none" stroke="${s.frame.borderColor}" stroke-width="${fmt(b)}"/>`);
  }
  if(defs.length)out.splice(s.title?2:1,0,`<defs>${defs.join('')}</defs>`);
  if(animate&&s.motion.type!=='none')out.splice(s.title?2:1,0,
    '<style>.qr-aurora-still{display:none}@media (prefers-reduced-motion: reduce){.qr-motion{display:none}.qr-aurora-still{display:inline}.qr-aurora-animated{display:none}}.qr-motion-user-play .qr-motion,.qr-motion-user-play .qr-aurora-animated{display:inline!important}.qr-motion-user-play .qr-aurora-still{display:none!important}</style>');
  out.push('</svg>');return out.join('');
}

/** Animated, vector-native SVG. Never changes the QR data matrix. */
export function renderAnimatedSVG(qr,style={}){return renderSVG(qr,style,{animate:true});}
/** Render exactly one animation frame as static SVG, for offline frame tests,
 * thumbnails, or user-selected still exports. Does not contain SVG animation.
 */
export function renderAnimationFrameSVG(qr,style={},timeSeconds=0){
  return renderSVG(qr,style,{frameTime:timeSeconds});
}
