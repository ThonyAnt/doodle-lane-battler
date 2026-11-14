// Tests for the trained CPU: the feature reader and network in the rules, the evolution strategy, the headless arena,
// the trainer and the switch in the game. Run: node tools/test-bot.js   (takes about a minute: it starts child processes)
const fs=require('fs'), path=require('path'), os=require('os'), cp=require('child_process'), http=require('http');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'duel.html'),'utf8').replace(/\r\n/g,'\n');
const opt=n=>'typeof '+n+'!=="undefined"?'+n+':undefined';      // so a missing piece is a FAIL below and not a crash here
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+
  ';return {createDuel,makeBot,stockItem,botLoadout,MOVES,NET_SHAPE:'+opt('NET_SHAPE')+',netForward:'+opt('netForward')+',botFeatures:'+opt('botFeatures')+',makeNetBot:'+opt('makeNetBot')+'};')();
let bad=0;
// cond may be a function, so a test that throws is reported as a FAIL with the error and the rest still run.
const ok=(name,cond,info)=>{ try{ if(typeof cond==='function') cond=cond(); if(typeof info==='function') info=info(); }catch(e){ cond=false; info=String(e&&e.message||e); } if(!cond) bad++; console.log((cond?'ok   ':'FAIL ')+name+(info!==undefined?'  '+JSON.stringify(info):'')); };
const mulberry=a=>()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const close=(a,b,eps)=>a.length===b.length&&Array.from(a).every((v,i)=>Math.abs(v-b[i])<=eps);
const add=(a,b)=>Array.from(a).map((v,i)=>v+b[i]), scale=(a,k)=>Array.from(a).map(v=>v*k);
const N=1232, L2=28*24+24, L3=L2+24*16+16;          // where the second and third layers start in the weights
function randomTheta(seed,size){ const r=mulberry(seed), th=new Float32Array(N); for(let i=0;i<N;i++) th[i]=(r()+r()+r()+r()-2)*(size||1); return th; }
const HELD={l:0,r:0,d:0,j:0,a:0,b:0,m:0,q:0,h:0,u:0};

// A fight two seconds in, the same one every time: Blue (sword, gun) has been hit, has shot back and is coming down from
// a jump towards Red (bow, shield), who is mid-shot with an arrow already in the air.
function fight(){
  const R=Math.random; Math.random=mulberry(7);
  try{
    const S=D.createDuel(); S.snapW=960;
    S.setItem(0,0,D.stockItem('sword','fire').spec,46); S.setItem(0,1,D.stockItem('gun','none').spec,34);
    S.setItem(1,0,D.stockItem('bow','water').spec,46); S.setItem(1,1,D.stockItem('shield','none').spec,34);
    S.setReady(0); S.setReady(1);
    for(let i=0;i<400&&S.phase!=='fight';i++) S.step(1/60);
    const blue=Object.assign({},HELD), red=Object.assign({},HELD);
    for(let i=0;i<118;i++){
      blue.r=1; if(i===40||i===84) blue.j++; if(i===50) blue.b++;
      if(i===2||i===50||i===75) red.a++;
      S.setInput(0,blue); S.setInput(1,red); S.step(1/60);
    }
    S.events.length=0;
    return S;
  }finally{ Math.random=R; }
}
// The same fight seen in a mirror: the fighters swap sides and the arena is flipped left to right.
function mirrored(S){
  const W=960;
  S.f.reverse(); S.f.forEach((f,s)=>{ f.side=s; f.x=W-f.x; f.vx=-f.vx; f.face=-f.face; });
  S.items.reverse(); S.cnt.reverse(); S.inp.reverse(); for(const i of S.inp){ const l=i.l; i.l=i.r; i.r=l; }
  for(const p of S.pr){ p.side=1-p.side; p.x=W-p.x; p.vx=-p.vx; }
  return S;
}
// A quiet fight for timing tests: both stand where they start, Blue holds a hammer.
function calm(){
  const S=D.createDuel(); S.snapW=960;
  S.setItem(0,0,D.stockItem('hammer','none').spec,46); S.setItem(1,0,D.stockItem('sword','none').spec,46);
  S.setReady(0); S.setReady(1);
  for(let i=0;i<400&&S.phase!=='fight';i++) S.step(1/60);
  return S;
}
// A network wired by hand: `input` feeds `output` through one unit of each hidden layer and nothing else is connected.
function wire(input,output,bias){ const th=new Float32Array(N); if(input>=0){ th[input]=3; th[L2]=3; th[L3+output*16]=1; } if(bias) for(const o in bias) th[L3+8*16+(+o)]=bias[o]; return th; }
// Red's jump is wired to "the foe is mid-move" (feature 11). Blue starts a swing after `lead` ticks; how long until Red's jump press?
function msFromFoeMoveToJump(skill,lead){
  const S=calm(), b=D.makeNetBot(1,wire(11,1),()=>skill), blue=Object.assign({},HELD); let t0=-1;
  for(let i=0;i<lead+90;i++){
    if(i===lead){ if(S.cnt[1].j!==0) return -1; blue.a++; S.setInput(0,blue); }      // it must not have jumped before there was anything to see
    b(S,1/60);
    if(t0>=0&&S.cnt[1].j>0) return (i-t0)*1000/60;
    S.step(1/60);
    if(t0<0&&S.f[0].act) t0=i+1;                                                  // the swing exists from the end of this tick
  }
  return 1e9;
}

{ // 1. the network and what it sees, in the rules
  ok('the network has 1232 weights',()=>D.NET_SHAPE.reduce((n,k,i,a)=>i?n+a[i-1]*k+k:0,0)===1232);
  ok('zero weights give zero outputs',()=>Array.from(D.netForward(new Float32Array(1232),new Float32Array(28).fill(1))).every(v=>v===0));
  ok('a hand-set weight gives the hand-computed output',()=>{ const th=new Float32Array(1232); th[0]=1; th[28*24+24+0]=1; th[28*24+24+24*16+16+0]=1; const x=new Float32Array(28); x[0]=0.5;
    return Math.abs(D.netForward(th,x)[0]-Math.tanh(Math.tanh(0.5)))<1e-6; });          // weights stored layer by layer, row by row (output index major), then that layer's biases
  ok('biases are added after each layer\'s weights',()=>{ const th=new Float32Array(1232); th[28*24+3]=0.7; th[L2+5*24+3]=1; th[L2+24*16+5]=0.25; th[L3+2*16+5]=2; th[L3+8*16+2]=-0.5;
    const want=2*Math.tanh(Math.tanh(0.7)+0.25)-0.5, got=D.netForward(th,new Float32Array(28)); return Math.abs(got[2]-want)<1e-6&&got.length===8&&Array.from(got).every((v,i)=>i===2||v===0); });
  { const S=fight(), a=S.f[0], b=S.f[1];
    ok('the test fight is a real, lopsided moment',!a.ground&&a.x>300&&!!b.act&&S.pr.some(p=>p.side===1)&&a.hp!==b.hp,{blue:[Math.round(a.x),Math.round(a.y),Math.round(a.hp)],red:[Math.round(b.x),Math.round(b.hp),b.act&&b.act.m],shots:S.pr.map(p=>p.side)}); }
  ok('features have 28 finite numbers in a sane range',()=>(f=>f.length===28&&Array.from(f).every(v=>Number.isFinite(v)&&Math.abs(v)<=4))(D.botFeatures(fight(),0)));
  ok('features are mirrored: swapping sides and flipping the arena changes nothing',()=>close(D.botFeatures(fight(),0),D.botFeatures(mirrored(fight()),1),1e-6));
  ok('and the same from Red\'s seat',()=>close(D.botFeatures(fight(),1),D.botFeatures(mirrored(fight()),0),1e-6));
  ok('the two fighters do not see the same thing',()=>!close(D.botFeatures(fight(),0),D.botFeatures(fight(),1),1e-3));
  ok('what it sees: the foe ahead, its own speed towards them, the arrow coming, the wall behind',()=>{ const S=fight(), f=D.botFeatures(S,0), g=D.botFeatures(S,1), a=S.f[0], b=S.f[1], p=S.pr.find(p=>p.side===1);
    return Math.abs(f[0]-(b.x-a.x)/480)<1e-5&&Math.abs(g[0]-(b.x-a.x)/480)<1e-5&&f[2]>0&&Math.abs(f[2]-a.vx/600)<1e-5&&Math.abs(g[4]+a.vx/600)<1e-5&&f[8]===0&&g[8]===1&&f[11]===1&&g[10]===1&&f[12]>0&&f[12]<=1
      &&f[23]===1&&Math.abs(f[24]-(p.x-a.x)/480)<1e-5&&g[23]===0&&Math.abs(f[26]-(a.x-18)/480)<1e-5&&Math.abs(g[26]-(960-18-b.x)/480)<1e-5&&f[18]===0&&f[19]===1&&f[20]===1&&g[20]===(S.items[0][a.held].kind==='ranged'?1:0); });
  ok('a fighter with its back to the foe sees the distance as negative',()=>{ const S=fight(); S.f[0].face=-1; return D.botFeatures(S,0)[0]<0; });
  ok('a net bot presses buttons through setInput and never throws',()=>{ const S=fight(), b=D.makeNetBot(1,randomTheta(1),()=>0.55); for(let i=0;i<600;i++){ b(S,1/60); S.step(1/60); } const c=S.cnt[1]; return c.j+c.a+c.b>0; });
  ok('it reacts no faster than its delay',()=>Math.min(...[30,31,32,33,34,35,37,41].map(lead=>msFromFoeMoveToJump(0.55,lead)))>=0.12*1000+0.2*0.45*1000-17,()=>[30,31,32,33,34,35,37,41].map(lead=>Math.round(msFromFoeMoveToJump(0.55,lead))));      // theta wired by hand so only the "foe mid-move" feature drives the jump output; the foe starts a move and we time the first jump press
  ok('and no slower than its delay plus one decision',()=>Math.max(...[30,31,32,33,34,35,37,41].map(lead=>msFromFoeMoveToJump(0.55,lead)))<=210+100+34);
  ok('a sharper bot reacts sooner',()=>{ const at=s=>[30,32,34,36].reduce((n,lead)=>n+msFromFoeMoveToJump(s,lead),0)/4; return at(1)>=120-17&&at(1)<at(0.55)&&at(0.55)<at(0); });
  ok('it presses a button at most 8 times a second',()=>{ const S=calm(), b=D.makeNetBot(1,wire(-1,0,{1:1,2:1,3:1}),()=>0.55); for(let i=0;i<300;i++){ b(S,1/60); S.step(1/60); } const c=S.cnt[1];
    return c.a>=30&&c.a<=41&&c.b<=41&&c.j<=41; });
  ok('the same weights walk towards the foe from either side',()=>{ const S=calm(), th=wire(-1,0,{0:1}), b0=D.makeNetBot(0,th,()=>0.55), b1=D.makeNetBot(1,th,()=>0.55), x0=S.f[0].x, x1=S.f[1].x;
    for(let i=0;i<60;i++){ b0(S,1/60); b1(S,1/60); S.step(1/60); } return S.f[0].x>x0+40&&S.f[1].x<x1-40&&S.inp[0].r===1&&S.inp[1].l===1; });
  ok('and back away from them when the move output is negative',()=>{ const S=calm(), b1=D.makeNetBot(1,wire(-1,0,{0:-1}),()=>0.55), x1=S.f[1].x; for(let i=0;i<60;i++){ b1(S,1/60); S.step(1/60); } return S.f[1].x>x1+40; });
  ok('a small move output stands still',()=>{ const S=calm(), b1=D.makeNetBot(1,wire(-1,0,{0:0.3}),()=>0.55), x1=S.f[1].x; for(let i=0;i<60;i++){ b1(S,1/60); S.step(1/60); } return S.f[1].x===x1; });
  ok('it lets go of the stick between rounds',()=>{ const S=calm(), b1=D.makeNetBot(1,wire(-1,0,{0:1}),()=>0.55); for(let i=0;i<60;i++){ b1(S,1/60); S.step(1/60); } S.phase='end'; b1(S,1/60); return S.inp[1].l===0&&S.inp[1].r===0; });
}

{ // 2. the evolution strategy, on a toy problem: find 20 numbers; fitness is minus the squared distance to them
  let ES=null; try{ ES=require('../bot/es.js'); }catch(e){ ok('bot/es.js loads',false,String(e.message).split('\n')[0]); }
  if(ES){
    const r=mulberry(3), target=Array.from({length:20},()=>r()*2-1), loss=th=>target.reduce((n,t,i)=>n+(th[i]-t)*(th[i]-t),0);
    const run=(gens,seed)=>{ let s=ES.esInit(20,seed||11); for(let g=0;g<gens;g++) s=ES.esTell(s,ES.esAsk(s,{pop:64,sigma:0.1}).map(c=>-loss(c)),{lr:0.03,decay:0.005}); return s; };
    const lossAfter=gens=>loss(run(gens).theta), st=run(3);
    const tellWith=fn=>ES.esTell(st,ES.esAsk(st,{pop:64,sigma:0.1}).map(c=>fn(-loss(c))),{lr:0.03,decay:0.005});
    ok('a new state starts at zero, generation 0',()=>(s=>s.gen===0&&s.seed===11&&s.theta instanceof Float32Array&&s.theta.length===20&&s.theta.every(v=>v===0))(ES.esInit(20,11)));
    ok('ask returns mirrored pairs around theta',()=>(c=>c.length===64&&close(add(c[0],c[1]),scale(st.theta,2),1e-5))(ES.esAsk(st,{pop:64,sigma:0.1})));
    ok('the same state asks the same candidates',()=>close(ES.esAsk(st,{pop:64,sigma:0.1})[5],ES.esAsk(st,{pop:64,sigma:0.1})[5],0));
    ok('so does a state rebuilt from a checkpoint\'s theta, gen and seed',()=>close(ES.esAsk({theta:Float32Array.from(JSON.parse(JSON.stringify(Array.from(st.theta)))),gen:st.gen,seed:st.seed},{pop:64,sigma:0.1})[7],ES.esAsk(st,{pop:64,sigma:0.1})[7],0));
    ok('another generation or another seed asks different ones',()=>{ const a=ES.esAsk(st,{pop:64,sigma:0.1})[0], b=ES.esAsk({theta:st.theta,gen:st.gen+1,seed:st.seed},{pop:64,sigma:0.1})[0], c=ES.esAsk({theta:st.theta,gen:st.gen,seed:st.seed+1},{pop:64,sigma:0.1})[0]; return !close(a,b,1e-3)&&!close(a,c,1e-3); });
    ok('the noise is as big as asked',()=>{ const c=ES.esAsk(st,{pop:64,sigma:0.1}); let n=0, q=0; for(let k=0;k<64;k+=2) for(let i=0;i<20;i++){ const e=(c[k][i]-st.theta[i])/0.1; q+=e*e; n++; } const sd=Math.sqrt(q/n); return sd>0.9&&sd<1.1; });
    ok('tell moves on one generation and leaves the old state alone',()=>{ const before=Array.from(st.theta), s2=tellWith(f=>f); return s2.gen===st.gen+1&&s2.seed===st.seed&&close(st.theta,before,0)&&!close(s2.theta,before,1e-6); });
    ok('150 generations cut the toy loss by 90%',()=>lossAfter(150)<0.1*lossAfter(0),()=>[lossAfter(0),lossAfter(150)]);
    ok('rank shaping ignores the scale of fitness',()=>close(tellWith(f=>f).theta,tellWith(f=>f*1000).theta,1e-6));
    ok('with nothing to tell candidates apart, only the weight decay acts',()=>close(tellWith(f=>1).theta,scale(st.theta,1-0.03*0.005),1e-7));
    ok('a better half pulls theta its way',()=>{ const c=ES.esAsk(st,{pop:64,sigma:0.1}), s2=ES.esTell(st,c.map(v=>v[0]),{lr:0.03,decay:0}); return s2.theta[0]>st.theta[0]; });
  }
}

console.log(bad?bad+' failed':'all bot tests pass'); process.exit(bad?1:0);
