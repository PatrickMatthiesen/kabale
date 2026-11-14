const suits = ['♠','♥','♦','♣'];
const red = c => c.s === '♥' || c.s === '♦';
export const shuffle = a => { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
function deck(n=1, suitCount=4) { return shuffle(Array.from({length:n},(_,d)=>suits.slice(0,suitCount).flatMap(s=>Array.from({length:13},(_,i)=>({r:i+1,s,id:`${d}-${s}-${i+1}`,up:false})))).flat()); }
export function deal(mode,difficulty='normal') {
 const g={mode,difficulty,moves:0,won:false,cols:[],stock:[],waste:[],found:[],cells:[],removed:[]};
 if(mode==='klondike'){const d=deck();g.drawCount=difficulty==='hard'?3:1;g.cols=Array.from({length:7},(_,i)=>d.splice(0,i+1).map((c,j)=>({...c,up:j===i})));g.stock=d;g.found=Array.from({length:4},()=>[]);}
 else if(mode==='freecell'){const d=deck();g.cols=Array.from({length:8},()=>[]);d.forEach((c,i)=>{c.up=true;g.cols[i%8].push(c)});g.cells=Array(difficulty==='hard'?2:4).fill(null);g.found=Array.from({length:4},()=>[]);}
 else if(mode==='spider'){g.suitCount=difficulty==='easy'?1:difficulty==='hard'?4:2;const d=shuffle(Array.from({length:8/g.suitCount},(_,pack)=>suits.slice(0,g.suitCount).flatMap(s=>Array.from({length:13},(_,i)=>({r:i+1,s,id:`sp-${pack}-${s}-${i+1}`,up:false})))).flat());g.cols=Array.from({length:10},(_,i)=>{const c=d.splice(0,i<4?6:5);c.forEach((x,j)=>x.up=j===c.length-1);return c});g.stock=d;}
 else if(mode==='pyramid'){const d=deck();for(let y=0;y<7;y++)g.cols.push(d.splice(0,y+1).map(c=>({...c,up:true})));g.stock=d;g.pairWaste=[];g.redealsLeft=difficulty==='easy'?2:difficulty==='normal'?1:0;}
 else throw Error('Unknown game mode'); return g;
}
export const runValid=(a,m)=>a.length>0&&a.every(c=>c?.up)&&a.slice(1).every((c,i)=>m==='spider'?a[i].r===c.r+1&&a[i].s===c.s:a[i].r===c.r+1&&red(a[i])!==red(c));
const parts=k=>String(k).split(':');
function src(g,k){const [t,x,y]=parts(k);if(t==='col'){const a=g.cols[+x];return a?{a,i:y===undefined?a.length-1:+y,t,x:+x}:null}if(t==='cell')return g.cells[+x]?{a:[g.cells[+x]],i:0,t,x:+x}:null;if(t==='waste')return g.waste?.length?{a:g.waste,i:g.waste.length-1,t}:null;if(t==='found')return g.mode!=='spider'&&g.found?.[+x]?.length?{a:g.found[+x],i:g.found[+x].length-1,t,x:+x}:null;return null;}
function seq(g,k){const s=src(g,k);return s?{...s,c:s.a.slice(s.i)}:null}
function tableOK(g,c,to){const [t,x]=parts(to),a=g.cols[+x];if(t!=='col'||!a||!runValid(c,g.mode)||c[0]?.id&&a.some(v=>v.id===c[0].id))return false;const top=a.at(-1);if(g.mode==='spider')return !top||top.r===c[0].r+1;if(g.mode==='freecell'&&c.length>(g.cells.filter(v=>!v).length+1)*2**g.cols.filter((v,i)=>!v.length&&i!==+x).length)return false;return top?top.r===c[0].r+1&&red(top)!==red(c[0]):g.mode==='freecell'||c[0].r===13;}
function valid(g,f,t){if(f===t)return false;const [tt,tx]=parts(t),s=seq(g,f);if(!s)return false;const c=s.c[0],n=s.c.length;if(!c||!c.up)return false;if(tableOK(g,s.c,t))return true;if(tt==='cell')return g.mode==='freecell'&&Number.isInteger(+tx)&&+tx>=0&&+tx<g.cells.length&&!g.cells[+tx]&&n===1;if(tt==='found'){const a=g.found[+tx];return a&&n===1&&g.mode!=='spider'&&(a.length?a.at(-1).s===c.s&&a.at(-1).r+1===c.r:c.r===1);}return false;}
export function canMove(g,f,t,start){return valid(g,start===undefined?`col:${f}`:`col:${f}:${start}`,`col:${t}`)}
function pop(g,s){const out=s.a.splice(s.i);if(s.t==='cell')g.cells[s.x]=null;if(s.t==='col'&&s.a.length)s.a.at(-1).up=true;return out;}
function spiderRuns(g,a){while(a.length>=13){const r=a.slice(-13);if(!r.every((c,i)=>c.up&&c.s===r[0].s&&c.r===13-i))break;a.splice(-13);g.found.push(r);if(a.length)a.at(-1).up=true;}g.won=g.found.length===8;}
export function applyMove(g,from,to){if(!g||g.won)return false;if(from==='stock')return draw(g);if(g.mode==='pyramid'){const card=k=>{if(k==='pw')return g.pairWaste.at(-1);const [t,y,x]=parts(k);return t==='p'&&pyramidPlayable(g,+y,+x)?g.cols[+y][+x]:null}, remove=k=>{if(k==='pw')return g.pairWaste.pop();const [,y,x]=parts(k);const c=g.cols[y][x];g.cols[y][x]=null;return c;};const c=card(from);if(!c)return false;if(c.r===13){remove(from);g.removed.push(c);}else{const d=card(to);if(!d||c===d||c.r+d.r!==13)return false;remove(from);remove(to);g.removed.push(c,d);}g.moves++;g.won=g.cols.every(r=>r.every(c=>!c));return true;}
 const s=seq(g,from);if(!s||!valid(g,from,to))return false;const [t,x]=parts(to);if(t==='col'){g.cols[+x].push(...pop(g,s));g.moves++;if(g.mode==='spider')spiderRuns(g,g.cols[+x]);return true;}const c=pop(g,s)[0];if(t==='cell')g.cells[+x]=c;else{g.found[+x].push(c);g.won=g.found.every(a=>a.length===13);}g.moves++;return true;}
export function move(g,f,t,start){return applyMove(g,start===undefined?`col:${f}`:`col:${f}:${start}`,`col:${t}`)}
export function toCell(g,f,c,start){return applyMove(g,start===undefined?`col:${f}`:`col:${f}:${start}`,`cell:${c}`)}
export function cellToCol(g,c,t){return applyMove(g,`cell:${c}`,`col:${t}`)}
export function toFoundation(g,f,start){for(let i=0;i<g.found.length;i++)if(applyMove(g,start===undefined?`col:${f}`:`col:${f}:${start}`,`found:${i}`))return true;return false;}
export function draw(g){if(g.mode==='klondike'){if(g.stock.length){const count=Math.min(g.drawCount||1,g.stock.length);for(let i=0;i<count;i++)g.waste.push({...g.stock.pop(),up:true});}else if(g.waste.length)g.stock=g.waste.splice(0).reverse().map(c=>({...c,up:false}));else return false;g.moves++;return true;}if(g.mode==='spider'){if(g.stock.length<10||g.cols.some(c=>!c.length))return false;for(const a of g.cols){a.push({...g.stock.pop(),up:true});spiderRuns(g,a);}g.moves++;return true;}if(g.mode==='pyramid'){if(!g.stock.length){if(!g.pairWaste.length||!g.redealsLeft)return false;g.stock=g.pairWaste.splice(0).reverse();g.redealsLeft--;}else g.pairWaste.push({...g.stock.pop(),up:true});g.moves++;return true;}return false;}
export function pyramidPlayable(g,y,x){return !!g.cols[y]?.[x]&&(y===6||(!g.cols[y+1][x]&&!g.cols[y+1][x+1]));}
export function removePyramid(g,a,b){if(!a||!b||a.r+b.r!==13)return false;g.removed.push(a,b);g.moves++;return true;}
export function legalMoves(g){if(g.mode==='pyramid'){const k=[];for(let y=0;y<7;y++)for(let x=0;x<=y;x++)if(pyramidPlayable(g,y,x))k.push(`p:${y}:${x}`);if(g.pairWaste.length)k.push('pw');const a=[];for(const f of k){const c=f==='pw'?g.pairWaste.at(-1):g.cols[parts(f)[1]][parts(f)[2]];if(c.r===13)a.push({from:f,to:f,label:'Remove king'});for(const t of k)if(t!==f){const d=t==='pw'?g.pairWaste.at(-1):g.cols[parts(t)[1]][parts(t)[2]];if(c.r+d.r===13)a.push({from:f,to:t,label:'Pair to 13'});}}if(g.stock.length||g.pairWaste.length&&g.redealsLeft)a.push({from:'stock',to:'',label:'Deal'});return a;}
 const keys=[];g.cols.forEach((a,i)=>a.forEach((_,j)=>{if(runValid(a.slice(j),g.mode))keys.push(`col:${i}:${j}`)}));g.cells.forEach((c,i)=>{if(c)keys.push(`cell:${i}`)});if(g.waste.length)keys.push('waste');if(g.mode!=='spider')g.found.forEach((a,i)=>{if(a.length)keys.push(`found:${i}`)});const out=[];for(const f of keys){g.cols.forEach((_,i)=>{const t=`col:${i}`;if(valid(g,f,t))out.push({from:f,to:t,label:'Move to tableau'});});g.found.forEach((_,i)=>{const t=`found:${i}`;if(valid(g,f,t))out.push({from:f,to:t,label:'Move to foundation'});});g.cells.forEach((_,i)=>{const t=`cell:${i}`;if(valid(g,f,t))out.push({from:f,to:t,label:'Move to free cell'});});}if((g.mode==='klondike'&&(g.stock.length||g.waste.length))||(g.mode==='spider'&&g.stock.length>=10&&g.cols.every(c=>c.length)))out.push({from:'stock',to:'',label:'Deal'});return out;}
export function autoMove(g,key) {
  if (g.mode === 'pyramid') {
    return legalMoves(g).some(m => m.from === key && applyMove(g,key,m.to));
  }
  const source = seq(g,key);
  if (!source) return false;
  const targets = [
    ...g.found.map((_,i) => `found:${i}`),
    ...g.cols.flatMap((a,i) => a.length ? [`col:${i}`] : []),
    ...g.cells.map((_,i) => `cell:${i}`),
    ...g.cols.flatMap((a,i) => !a.length ? [`col:${i}`] : [])
  ];
  for (const target of targets) if (valid(g,key,target)) return applyMove(g,key,target);
  return false;
}
export function availableMoves(g){return legalMoves(g).filter(m=>m.from!=='stock').map(m=>[m.from,m.to]);}




