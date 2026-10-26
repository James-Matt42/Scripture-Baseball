/** QR segment minimizer: dynamic programming over numeric, alphanumeric,
 * byte, Shift-JIS Kanji and optionally GB2312 Hanzi modes. The optimize flag
 * is opt-in for backwards-compatible golden matrices. Exact bit accounting
 * uses the character-count width of the applicable QR version group.
 */
import {unicodeKanjiCode, unicodeHanziCode} from './charset-data.js';
import {fail} from './errors.js';
const alnum=/^[A-Z0-9 $%*+.\/:\-]$/;
const numeric=/^[0-9]$/;
const maxOptimizedChars=900;
const ccbits={numeric:[10,12,14],alphanumeric:[9,11,13],byte:[8,16,16],kanji:[8,10,12],hanzi:[8,10,12]};
function dataBits(mode,len){
  if(mode==='numeric')return Math.floor(len/3)*10+[0,4,7][len%3];
  if(mode==='alphanumeric')return Math.floor(len/2)*11+(len%2)*6;
  if(mode==='byte')return len*8;
  return len*13;
}
/** Returns a manually encodable sequence, or null for long inputs (fallback). */
export function planOptimizedSegments(text,{charset='utf-8',version=1,enableHanzi=false}={}){
  if(typeof text!=='string')fail('INVALID_INPUT','Segment planner requires text');
  const characters=Array.from(text),n=characters.length;
  if(!n)return [];
  if(n>maxOptimizedChars)return null; // avoids quadratic work for long text
  const tier=version<10?0:version<27?1:2;
  const encoder=new TextEncoder();
  const valid=(mode,c)=>mode==='numeric'?numeric.test(c):mode==='alphanumeric'?alnum.test(c):
    mode==='kanji'?unicodeKanjiCode(c)!=null:mode==='hanzi'?enableHanzi&&unicodeHanziCode(c)!=null:
    charset==='utf-8'||c.codePointAt(0)<=255;
  const byteLen=c=>charset==='utf-8'?encoder.encode(c).length:1;
  const modes=['numeric','alphanumeric','byte','kanji',...(enableHanzi?['hanzi']:[])];
  const costs=Array(n+1).fill(Infinity),hops=Array(n+1).fill(Infinity),prev=Array(n+1);
  costs[0]=0;hops[0]=0;
  for(let i=0;i<n;i++){
    if(!Number.isFinite(costs[i]))continue;
    for(const mode of modes){
      const countBits=ccbits[mode][tier],maxCount=(1<<countBits)-1;
      let units=0;
      for(let j=i;j<n;j++){
        const char=characters[j];if(!valid(mode,char))break;
        units+=mode==='byte'?byteLen(char):1;
        if(units>maxCount)break;
        const bits=costs[i]+4+countBits+(mode==='hanzi'?4:0)+dataBits(mode,units);
        const count=hops[i]+1;
        if(bits<costs[j+1]||(bits===costs[j+1]&&count<hops[j+1])){
          costs[j+1]=bits;hops[j+1]=count;prev[j+1]={start:i,mode};
        }
      }
    }
  }
  if(!Number.isFinite(costs[n]))fail('CHARSET_UNREPRESENTABLE',`Some text characters cannot be represented with charset ${charset}`);
  const result=[];let pos=n;
  while(pos>0){
    const p=prev[pos];if(!p)fail('SEGMENT_OPTIMIZATION','Internal segment planner error');
    result.push({mode:p.mode,text:characters.slice(p.start,pos).join('')});pos=p.start;
  }
  return result.reverse();
}
