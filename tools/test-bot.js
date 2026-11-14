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
  ok('it presses an attack at most 6 times a second and jumps at most 3',()=>{ const S=calm(), b=D.makeNetBot(1,wire(-1,0,{1:1,2:1,3:1}),()=>0.55); for(let i=0;i<300;i++){ b(S,1/60); S.step(1/60); } const c=S.cnt[1];
    return c.a>=22&&c.a<=31&&c.b<=31&&c.j>=10&&c.j<=16; });
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

{ // 3. the headless arena: real rounds of the real rules, the league's fixed opponents, and the fitness of a set of weights
  let A=null; try{ A=require('../bot/arena.js'); }catch(e){ ok('bot/arena.js loads',false,String(e.message).split('\n')[0]); }
  if(A){
    const meanOf=(n,fn)=>{ let t=0; for(let i=0;i<n;i++) t+=fn(); return t/n; }, score=A.score;
    const items=(S,s)=>S.items[s].map(it=>it&&[it.name,it.kind,it.style,it.el,it.cost,it.trait].join()).join('|');
    // a player that does nothing but note what both fighters were given
    let sameLoadoutSeen=null; const loadouts=new Set(), sides=[];
    const spy={make:side=>{ let looked=false; return S=>{ if(looked||S.phase==='draw') return; looked=true; sides.push(side); loadouts.add(items(S,0)); const same=items(S,0)===items(S,1)&&S.items[0].every(Boolean); sameLoadoutSeen=sameLoadoutSeen===null?same:sameLoadoutSeen&&same; }; }};
    ok('a round between two classic bots ends with a result',()=>(r=>[0,1,-1].includes(r.w)&&r.t>3&&r.t<=110)(A.playRound(A.opponent('classic0.55'),A.opponent('classic0.55'),{flip:0})));
    for(let i=0;i<8;i++) A.playRound(spy,A.opponent('masher'),{flip:i%2});
    ok('both sides get the same loadout',()=>sameLoadoutSeen===true);
    ok('and a different one from round to round',()=>loadouts.size>=4,()=>loadouts.size);
    ok('flip seats player A on the other side',()=>sides.join('')==='01010101',()=>sides.join(''));
    ok('the result is told from player A\'s seat, whichever side it sat on',()=>[0,1].every(flip=>{ const r=A.playRound(A.netPlayer(new Float32Array(1232)),A.opponent('masher'),{flip,loadout:[{spec:D.stockItem('sword','none').spec,cost:46}]}); return r.w===1&&r.hpDiff<0&&r.timeout===false&&score(r)<-1; }));
    ok('a round\'s score is the win, half the health margin, a penalty for running out the clock and a charge for presses',()=>Math.abs(score({w:0,hpDiff:80,timeout:false})-1.25)<1e-9&&Math.abs(score({w:1,hpDiff:-160,timeout:false})+1.5)<1e-9&&Math.abs(score({w:-1,hpDiff:0,timeout:true})+0.2)<1e-9&&Math.abs(score({w:0,hpDiff:16,timeout:true})-0.85)<1e-9&&Math.abs(score({w:0,hpDiff:0,timeout:false,presses:100,t:13})-0.85)<1e-9);
    ok('a bot that never presses loses to the masher and scores below zero',()=>A.fitness(new Float32Array(1232),[A.opponent('masher')],12)<0);
    // 400 rounds where the plan said 40: a single round's score swings by more than 1 either way, so the mean of 40 lands
    // outside 0.25 by luck about one run in five. Same tolerance, more rounds.
    ok('fitness of classic against itself is near zero',()=>Math.abs(meanOf(400,()=>score(A.playRound(A.opponent('classic0.55'),A.opponent('classic0.55'),{flip:Math.random()<0.5}))))<0.25);
    ok('the league\'s six fixed opponents all play, and an unknown name is refused',()=>A.FIXED.join()==='classic0.3,classic0.55,classic0.8,masher,jumper,kiter'&&A.FIXED.every(k=>{ const r=A.playRound(A.opponent(k),A.opponent('masher'),{flip:0}); return [0,1,-1].includes(r.w); })&&(()=>{ try{ A.opponent('nobody'); return false; }catch(e){ return true; } })());
    ok('a schedule draws the opponents evenly and swaps sides every round',()=>{ const sc=A.schedule(6,24), n=[0,0,0,0,0,0]; for(const r of sc) n[r.o]++;
      return sc.length===24&&n.every(v=>v===4)&&sc.every((r,i)=>r.flip===i%2&&r.loadout.length===2&&r.loadout.every(it=>it.spec&&it.cost>0)); });
    ok('with a schedule, every candidate meets the same opponents with the same loadouts on the same sides',()=>{ const seen=[[],[]]; let who=0;
      const lg=[0,1,2].map(o=>({make:side=>{ let looked=false; return S=>{ if(looked||S.phase==='draw') return; looked=true; seen[who].push(o+':'+side+':'+items(S,0)); }; }})), sc=A.schedule(3,6);
      A.fitness(randomTheta(5,0.3),lg,6,sc); who=1; A.fitness(randomTheta(6,0.3),lg,6,sc); return seen[0].length===6&&seen[0].join(';')===seen[1].join(';')&&new Set(seen[0].map(v=>v[0])).size===3; });
    ok('the weights\' rules stamp is a short hash of the rules text',()=>/^[0-9a-f]{16}$/.test(A.RULES));
    const t0=Date.now(); let secs=0; for(let i=0;i<30;i++) secs+=A.playRound(A.netPlayer(randomTheta(40+i,0.3)),A.opponent(A.FIXED[i%6]),{flip:i%2}).t; const msPerRound=(Date.now()-t0)/30;
    ok('one round takes under 250 ms',msPerRound<250,{msPerRound:+msPerRound.toFixed(2),'game seconds per round':+(secs/30).toFixed(1)});
  }
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rmrf=d=>{ try{ fs.rmSync(d,{recursive:true,force:true}); }catch(e){} };
// 4. the trainer, run as a child with tiny settings
async function trainerTests(){
  const train=path.join(root,'bot','train.js'), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'doodle-bot-')), dir=path.join(tmp,'run'), cut=path.join(tmp,'cut'), tiny=['--pop=8','--rounds=2','--workers=2'];
  const run=(out,args)=>cp.spawnSync(process.execPath,[train].concat(args,tiny,['--out='+out]),{encoding:'utf8',timeout:120000});
  const read=f=>fs.readFileSync(f,'utf8'), ckpt=(d,g)=>JSON.parse(read(path.join(d,'gen-'+String(g).padStart(4,'0')+'.json'))), rows=d=>read(path.join(d,'log.csv')).trim().split('\n').map(l=>l.split(','));
  const gens=d=>fs.readdirSync(d).filter(f=>/^gen-\d{4}\.json$/.test(f)).sort();
  try{
    const first=run(dir,['--gens=3','--vs-every=2','--vs-rounds=4','--league-every=2']), stdout=first.stdout||'';
    if(first.status!==0){ ok('the trainer runs three tiny generations',false,((first.stderr||'')+(first.error?first.error.message:'')).split('\n').find(l=>/Error|Cannot find/.test(l))||('exit '+first.status)); return; }
    const files=fs.readdirSync(dir), logLines=rows(dir).length, ck=ckpt(dir,3);
    ok('three generations write three checkpoints and a log',files.filter(f=>/^gen-\d{4}\.json$/.test(f)).length===3&&logLines===4,files);
    ok('a checkpoint holds 1232 finite weights',ck.theta.length===1232&&ck.theta.every(Number.isFinite)&&ck.gen===3);
    ok('and they have moved off zero, with the fitness, the seed and the rules they were trained in',()=>ck.theta.some(v=>v!==0)&&Number.isFinite(ck.fitness)&&Number.isFinite(ck.seed)&&ck.rules===require('../bot/arena.js').RULES&&'vsClassic' in ck,()=>({fitness:ck.fitness,seed:ck.seed,rules:ck.rules}));
    ok('the log has the six columns and one row a generation',()=>{ const r=rows(dir); return r[0].join()==='gen,secs,best,mean,vsClassic,roundsPerSec'&&r.slice(1).map(x=>x[0]).join()==='1,2,3'&&r.slice(1).every((x,i,all)=>x.length===6&&x[1]!==''&&+x[1]>=(i?+all[i-1][1]:0)&&Number.isFinite(+x[2])&&Number.isFinite(+x[3])&&+x[2]>=+x[3]&&+x[5]>0); },()=>rows(dir));
    ok('the win rate against the classic bot is measured on its generations only',()=>{ const r=rows(dir), v=ckpt(dir,2).vsClassic; return typeof v==='number'&&v>=0&&v<=1&&ckpt(dir,1).vsClassic===null&&ck.vsClassic===null&&r[2][4]!==''&&+r[2][4]===v&&r[1][4]===''&&r[3][4]===''; },()=>rows(dir).map(x=>x[4]));
    ok('a champion joins the league on its generations',()=>/league.*7 opponents/.test(stdout)&&!/8 opponents/.test(stdout));
    ok('nothing half-written is left behind',files.every(f=>/^gen-\d{4}\.json$/.test(f)||f==='log.csv'),files);
    ok('it prints rounds per second at the start',/rounds\/s/.test(stdout)&&stdout.search(/rounds\/s/)<stdout.search(/^gen +1\b/m),stdout.split('\n').find(l=>/rounds\/s/.test(l)));
    // a copy to break: the newest checkpoint cut in half, as if the machine died while writing it, and a stray temporary file
    fs.mkdirSync(cut); for(const f of files) fs.copyFileSync(path.join(dir,f),path.join(cut,f));
    const second=run(dir,['--gens=3','--vs-every=2','--vs-rounds=4','--league-every=2']), out2=second.stdout||'', secondRunFirstGen=+(/^gen +(\d+)/m.exec(out2)||[])[1];
    ok('running again resumes at generation 4',secondRunFirstGen===4,out2.split('\n').filter(l=>/resum|^gen /.test(l)).slice(0,3));
    ok('and carries on the same search: six checkpoints, six log rows, one seed, the league rebuilt',()=>second.status===0&&gens(dir).length===6&&rows(dir).slice(1).map(x=>x[0]).join()==='1,2,3,4,5,6'&&ckpt(dir,6).seed===ck.seed&&ckpt(dir,6).gen===6&&+rows(dir)[6][1]>+rows(dir)[3][1]&&/league.*7 opponents/.test(out2.split(/^gen +4\b/m)[0])&&/9 opponents/.test(out2),()=>out2.split('\n').filter(l=>/league/.test(l)));
    const whole=read(path.join(cut,'gen-0003.json')); fs.writeFileSync(path.join(cut,'gen-0003.json'),whole.slice(0,whole.length>>1)); fs.writeFileSync(path.join(cut,'gen-0004.json.tmp'),'{"gen":4,"theta":[0.1,');
    const third=run(cut,['--gens=1']), out3=third.stdout||'', resumedFromGenAfterTruncating=+(/resumed from generation (\d+)/.exec(out3)||[])[1];
    ok('a half-written newest checkpoint is skipped, not fatal',resumedFromGenAfterTruncating===2,{status:third.status,line:out3.split('\n').find(l=>/resum/.test(l))});
    ok('the generation it lost is played again and nothing is skipped or doubled',()=>third.status===0&&gens(cut).join()==='gen-0001.json,gen-0002.json,gen-0003.json'&&ckpt(cut,3).gen===3&&ckpt(cut,3).theta.length===1232&&rows(cut).slice(1).map(x=>x[0]).join()==='1,2,3'&&!fs.readdirSync(cut).some(f=>/tmp/.test(f)),()=>({files:fs.readdirSync(cut),log:rows(cut).map(x=>x[0])}));
    // old checkpoints are thinned out, but never one that is still needed
    const thin=path.join(tmp,'thin'), fifth=run(thin,['--gens=7','--keep=2','--vs-every=3','--vs-rounds=2','--league-every=5']);
    ok('checkpoints past the newest few are deleted unless measured against the classic bot or in the league',()=>fifth.status===0&&gens(thin).join()==='gen-0003.json,gen-0005.json,gen-0006.json,gen-0007.json'&&rows(thin).length===8,()=>gens(thin));
    ok('and the thinned run carries on, its league read back',()=>{ const again=run(thin,['--gens=1','--keep=2','--vs-every=3','--vs-rounds=2','--league-every=5']); return again.status===0&&/resumed from generation 7/.test(again.stdout)&&/earlier selves from generations 5 \(7 opponents\)/.test(again.stdout)&&gens(thin).join()==='gen-0003.json,gen-0005.json,gen-0006.json,gen-0007.json,gen-0008.json'; });
    ok('a mistyped option is refused before anything runs',()=>{ const r=run(path.join(tmp,'typo'),['--hour=6']); return r.status===2&&/unknown option --hour=6/.test(r.stderr)&&!fs.existsSync(path.join(tmp,'typo')); });
    // --hours: it stops by itself
    const timed=path.join(tmp,'timed'), t0=Date.now(), fourth=run(timed,['--hours=0.0005']), took=Date.now()-t0;
    ok('it stops by itself when the time is up',()=>fourth.status===0&&/time is up/.test(fourth.stdout)&&gens(timed).length>=1&&took<30000,{status:fourth.status,took});
    // Ctrl-C in the middle of a run
    const kill=path.join(tmp,'kill'), child=cp.spawn(process.execPath,[train,'--gens=1000000','--hours=1'].concat(tiny,['--out='+kill]),{stdio:['ignore','pipe','pipe']}); let outK='', code=null;
    child.stdout.on('data',d=>outK+=d); child.stderr.on('data',d=>outK+=d); const gone=new Promise(r=>child.on('exit',(c,sig)=>{ code=sig||c; r(); }));
    for(let i=0;i<300&&code===null&&!(fs.existsSync(kill)&&gens(kill).length>=2);i++) await sleep(100);
    // Windows cannot hand a child process a Ctrl-C (kill('SIGINT') there ends it outright, handlers unrun), so on Windows the
    // run is stopped through its stop file, which ends it by the same path.
    if(process.platform==='win32') fs.writeFileSync(path.join(kill,'stop'),''); else child.kill('SIGINT'); const tk=Date.now(); await Promise.race([gone,sleep(15000)]); if(code===null) child.kill('SIGKILL');
    ok((process.platform==='win32'?'the stop file':'Ctrl-C')+' stops it cleanly and quickly',()=>code===0&&Date.now()-tk<6000&&/stopped/.test(outK)&&!fs.existsSync(path.join(kill,'stop')),()=>({code,ms:Date.now()-tk,last:outK.trim().split('\n').slice(-2)}));
    ok('and what it leaves can be carried on from',()=>{ const n=gens(kill).length, newest=ckpt(kill,n), again=run(kill,['--gens=1']); return newest.gen===n&&newest.theta.length===1232&&again.status===0&&+(/^gen +(\d+)/m.exec(again.stdout)||[])[1]===n+1&&rows(kill).slice(1).map(x=>+x[0]).every((g,i)=>g===i+1); });
  }finally{ rmrf(tmp); }
}

// 5. in the game: a child server on port 3194 (no API key), with and without weights for the trained CPU.
// The weights file is named by the BOT_WEIGHTS setting, so a real bot-weights.json in the checkout is never touched.
async function gameTests(){
  const PORT=3194, base='http://127.0.0.1:'+PORT, tmp=fs.mkdtempSync(path.join(os.tmpdir(),'doodle-game-')), A=require('../bot/arena.js');
  // "Random" weights with one habit, so the test can tell it from the classic bot: small random numbers everywhere, a move
  // output held at -1 (back away from the foe, which the classic bot never does from the start) and the buttons held off.
  const runner=()=>{ const th=randomTheta(9,0.01); th[L3+8*16+0]=-1; for(const o of [1,2,3,4,5,6]) th[L3+8*16+o]=-0.5; return Array.from(th); };
  const file=(name,o)=>{ const f=path.join(tmp,name); fs.writeFileSync(f,typeof o==='string'?o:JSON.stringify(o)); return f; };
  const good=file('good.json',{theta:runner(),rules:A.RULES,gen:7,vsClassic:0.5}), stale=file('stale.json',{theta:runner(),rules:'0123456789abcdef',gen:7,vsClassic:0.5}), short=file('short.json',{theta:[1,2,3],rules:A.RULES});
  const live=[];
  async function serve(weights){
    const child=cp.spawn(process.execPath,[path.join(root,'server.js')],{cwd:root,env:Object.assign({},process.env,{PORT:String(PORT),BOT_WEIGHTS:weights,OPENAI_API_KEY:''}),stdio:['ignore','pipe','pipe']}), o={child,log:''}; live.push(child);
    child.stdout.on('data',d=>o.log+=d); child.stderr.on('data',d=>o.log+=d); o.gone=new Promise(r=>child.on('exit',r));
    for(let i=0;i<80&&!/Drawings read by/.test(o.log)&&child.exitCode===null;i++) await sleep(50);
    o.stop=async()=>{ child.kill(); await Promise.race([o.gone,sleep(3000)]); if(child.exitCode===null&&child.signalCode===null){ child.kill('SIGKILL'); await o.gone; } };
    return o;
  }
  const get=p=>fetch(base+p).then(r=>r.json()), post=(p,body)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})}).then(r=>r.json());
  // Sit in the room as Blue, press Ready, and watch Red for `secs` seconds of the fight.
  const watchRed=(code,secs,id)=>new Promise(resolve=>{
    const out={hello:null,start:null,end:null,acted:false,fought:false,clock:0}; let buf='', t0=0, c0=0, done=false;
    const finish=()=>{ if(done) return; done=true; clearTimeout(guard); req.destroy(); resolve(out); }, guard=setTimeout(finish,(secs+12)*1000);
    const req=http.get(base+'/duel/events?room='+code+'&id='+(id||'tester'),res=>{ res.setEncoding('utf8');
      res.on('data',chunk=>{ buf+=chunk; let k;
        while((k=buf.indexOf('\n\n'))>=0){ const msg=buf.slice(0,k), ev=/^event: (.*)$/m.exec(msg), data=/^data: (.*)$/m.exec(msg); buf=buf.slice(k+2); if(!ev||!data) continue;
          if(ev[1]==='hello'){ out.hello=JSON.parse(data[1]); post('/duel/act',{room:code,id:id||'tester',type:'ready'}); }
          if(ev[1]==='state'){ const v=JSON.parse(data[1]), red=v.f[1];
            if(v.phase==='fight'){ if(out.start===null){ out.start=red.x; t0=Date.now(); c0=v.t; } out.fought=true; out.end=red.x; out.clock=+(c0-v.t).toFixed(1); if(red.act||Math.abs(red.x-out.start)>5) out.acted=true; if(Date.now()-t0>=secs*1000) finish(); }
            else if(out.fought) finish(); } } });
    }); req.on('error',finish);
  });
  try{
    { const sv=await serve(good), info=await get('/info').catch(e=>({error:String(e)}));
      ok('/info lists the trained brain when weights exist',()=>info.brains.join()==='classic,net',info.brains||info);
      const code=(await post('/duel/room?bot=1&brain=net')).code, seen=await watchRed(code,5), redXStart=seen.start, redXAfter5s=seen.end;
      ok('a brain=net room is played by the network: Red moves',Math.abs(redXAfter5s-redXStart)>20&&redXAfter5s-redXStart>20&&seen.hello&&seen.hello.brain==='net',{redXStart,redXAfter5s,hello:seen.hello});
      await post('/duel/act',{room:code,id:'tester',type:'rematch'}); const again=await watchRed(code,2);
      ok('after a rematch the room still has the network',again.end-again.start>20,{start:again.start,end:again.end});
      const plain=(await post('/duel/room?bot=1')).code, cl=await watchRed(plain,2,'other');
      ok('a bot room that does not ask for it gets the classic bot',cl.hello&&cl.hello.brain==='classic'&&cl.clock>1&&!(cl.end-cl.start>20),{hello:cl.hello,start:cl.start,end:cl.end,clock:cl.clock});
      ok('the right weights load without complaint',/trained CPU/.test(sv.log)&&!/different rules/.test(sv.log),sv.log.split('\n').filter(l=>/duel:/.test(l)));
      await sv.stop(); }
    { const sv=await serve(path.join(tmp,'none.json')), noWeightsInfo=await get('/info').catch(e=>({error:String(e)}));
      const code=(await post('/duel/room?bot=1&brain=net')).code, seen=await watchRed(code,3), noWeightsRoomPlays=seen.fought&&seen.clock>1&&!(seen.end-seen.start>20);      // the round runs (with some loadouts the classic bot waits where it stands) and Red does not run off
      ok('without weights the room quietly uses the classic bot',()=>noWeightsInfo.brains.join()==='classic'&&noWeightsRoomPlays&&seen.hello.brain==='classic'&&!/rror/.test(sv.log),{brains:noWeightsInfo.brains,seen,log:sv.log.split('\n').slice(3)});
      await sv.stop(); }
    { const sv=await serve(stale), info=await get('/info').catch(e=>({})), serverLogWithStaleHash=sv.log; await sv.stop();
      ok('weights from other rules are reported',/different rules/.test(serverLogWithStaleHash)&&(info.brains||[]).join()==='classic,net',serverLogWithStaleHash.split('\n').filter(l=>/rules/.test(l))); }
    { const sv=await serve(short), info=await get('/info').catch(e=>({})); await sv.stop();
      ok('a weights file of the wrong shape is refused and said so',(info.brains||[]).join()==='classic'&&/could not be used/.test(sv.log),sv.log.split('\n').filter(l=>/duel:/.test(l))); }
    // the bench and the checker take the weights too
    { const r=cp.spawnSync(process.execPath,[path.join(root,'tools','balance.js'),'bot','--brain=net','--weights='+good,'--n=4'],{encoding:'utf8',timeout:120000});
      ok('tools/balance.js bot --brain=net plays the trained CPU through the bench',r.status===0&&/trained CPU/.test(r.stdout)&&/AVERAGE/.test(r.stdout),(r.stdout||'').split('\n')[0]||r.stderr);
      const none=cp.spawnSync(process.execPath,[path.join(root,'tools','balance.js'),'bot','--brain=net','--weights='+path.join(tmp,'none.json'),'--n=4'],{encoding:'utf8',timeout:120000});
      ok('and says so when there are no weights to play',none.status!==0&&/no weights/.test(none.stderr),(none.stderr||'').split('\n')[0]); }
    { const saved=path.join(tmp,'saved.json'), r=cp.spawnSync(process.execPath,[path.join(root,'bot','eval.js'),good,'--n=8','--save='+saved],{encoding:'utf8',timeout:120000}), out=r.stdout||'';
      ok('bot/eval.js plays the weights against the classic bot and the three scripted players and gives a verdict',r.status===0&&['classic0.55','masher','jumper','kiter'].every(k=>new RegExp('^'+k.replace('.','\\.')+' +\\d+%','m').test(out))&&/presses a second/.test(out)&&/knockout/.test(out)&&/shipping bar: (CLEARED|MISSED)/.test(out),out.split('\n').slice(-3));
      ok('and --save writes them in the shape the server loads',()=>{ const o=JSON.parse(fs.readFileSync(saved,'utf8')); return o.theta.length===1232&&o.rules===A.RULES&&o.gen===7&&typeof o.vsClassic==='number'; }); }
  }finally{ for(const c of live) if(c.exitCode===null&&c.signalCode===null) c.kill('SIGKILL'); rmrf(tmp); }
}

(async()=>{
  await trainerTests();
  await gameTests();
  console.log(bad?bad+' failed':'all bot tests pass'); process.exit(bad?1:0);
})().catch(e=>{ console.log('FAIL the tests crashed: '+(e&&e.stack||e)); process.exit(1); });
