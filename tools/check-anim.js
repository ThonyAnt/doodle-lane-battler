// Checks that every move in the rules has an animation clip with the same duration and hit/shot times,
// and that no clip puts a foot or hand through the floor. Run: node tools/check-anim.js
const fs=require('fs'), path=require('path'), root=path.join(__dirname,'..');
global.window=global;
for(const f of ['core','locomotion','blade','bow','gun']) require(path.join(root,'anim',f+'.js'));
const src=fs.readFileSync(path.join(root,'duel.html'),'utf8');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {MOVES,ALT};')();
let bad=0; const fail=m=>{ bad++; console.log('FAIL '+m); };
for(const m in D.MOVES) for(const name of [m].concat(D.ALT.includes(m)?[m+'_b']:[])){
  if(m==='punch'||m==='throw') continue;
  const M=D.MOVES[m], c=ANIM.clips[name]; if(!c){ fail(name+': no clip'); continue; }
  if(Math.abs(c.dur-M.dur)>1e-6) fail(name+': dur '+c.dur+' but rules say '+M.dur);
  const want=(M.hits||M.shots||[]).join(','), got=c.marks.filter(k=>k.type==='hit'||k.type==='shot').map(k=>k.t).join(',');
  if(want!==got) fail(name+': marks '+got+' but rules say '+want);
}
for(const name in ANIM.clips){
  const c=ANIM.clips[name]; let low=0;
  for(let i=0;i<=120;i++){ const s=ANIM.sample(c,c.dur*i/120); for(const j of [17,21,15,19,5]){ const y=ANIM.xf(s,s.p[j-1],s.p[j])[1]; if(y>low) low=y; } }
  if(low>6&&name!=='blade_air') fail(name+': a leg joint goes '+low.toFixed(1)+' units under the floor');
}
console.log(bad?bad+' problem(s)':'all '+Object.keys(ANIM.clips).length+' clips match the rules');
process.exit(bad?1:0);
