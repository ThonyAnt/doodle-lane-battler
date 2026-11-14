// The headless arena for training the CPU: whole rounds of the real rules (the marked block in duel.html) with no screen,
// the fixed members of the league, and the fitness of a set of weights. Used by bot/worker.js, bot/train.js, bot/eval.js
// and tools/test-bot.js.
'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const person=require('./people.js');
const block=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n').split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0];
const D=new Function(block+';return {createDuel,makeBot,makeNetBot,botLoadout,botFeatures,netForward,NET_SHAPE,HP};')();
// Weights only mean something under the rules they were trained in, so they carry this stamp (see duel-server.js).
const RULES=crypto.createHash('sha256').update(block).digest('hex').slice(0,16);
const SIZE=D.NET_SHAPE.reduce((n,k,i,a)=>i?n+a[i-1]*k+k:0,0), DT=1/60, MAX_T=110, HP=D.HP;

// A player is {name, make(side) -> (S, dt)=>void}: make is called once a round and the result every frame.
const FIXED=['classic0.3','classic0.55','classic0.8','masher','jumper','kiter'];
function opponent(kind){
  const m=/^classic([0-9.]+)$/.exec(kind);
  if(m){ const skill=+m[1], sk=()=>skill; return {name:kind,make:side=>D.makeBot(side,sk)}; }            // the hand-written bot at a skill
  if(['masher','jumper','kiter'].includes(kind)) return {name:kind,make:side=>{ const p=person(kind); return (S,dt)=>p(S,side,dt); }};
  throw new Error('unknown opponent "'+kind+'" (one of '+FIXED.join(', ')+')');
}
function netPlayer(theta,skill){
  if(theta.length!==SIZE) throw new Error('weights: expected '+SIZE+' numbers, got '+theta.length);
  const s=skill===undefined?0.55:skill, sk=()=>s;
  return {name:'net',make:side=>D.makeNetBot(side,theta,sk)};
}
// A random pair of ready-made items, the same for both fighters. Only what the rules need (no drawing), so it can be posted to a worker.
const loadout=()=>D.botLoadout().map(b=>({spec:b.spec,cost:b.cost}));

// One round, A against B, both holding the same loadout. flip seats A on the right (side 1). The result is told from A's
// seat: w 0 = A won, 1 = B won, -1 = nobody; hpDiff = A's health minus B's at the end; t = seconds including the countdown;
// timeout = it ended with both still standing. presses (when opts.count) = A's button presses.
function playRound(a,b,opts){
  const flip=opts&&opts.flip?1:0, items=(opts&&opts.loadout)||loadout(), S=D.createDuel();
  S.snapW=960;
  for(let s=0;s<2;s++) for(let k=0;k<items.length;k++) if(items[k]) S.setItem(s,k,items[k].spec,items[k].cost);
  S.setReady(0); S.setReady(1);
  const p0=(flip?b:a).make(0), p1=(flip?a:b).make(1);
  let t=0;
  while(S.phase!=='end'&&S.phase!=='over'&&t<MAX_T){ t+=DT; p0(S,DT); p1(S,DT); S.step(DT); if(S.events.length) S.events.length=0; }
  const h0=Math.max(0,S.f[0].hp), h1=Math.max(0,S.f[1].hp), ws=S.phase==='end'||S.phase==='over'?S.winner:-1, c=S.cnt[flip];
  return {w:ws<0?-1:(flip?1-ws:ws),hpDiff:flip?h1-h0:h0-h1,t,timeout:h0>0&&h1>0,presses:c.j+c.a+c.b+c.q+c.u};
}
// What a round is worth to A: +1 for a win, -1 for a loss, half the health margin, and a penalty for letting the clock run out.
const score=r=>(r.w===0?1:r.w===1?-1:0)+0.5*r.hpDiff/HP-(r.timeout?0.2:0);

// Who to fight in each of `rounds` rounds: the league's members in turn (a fresh shuffle each time round, so they are
// drawn evenly), sides swapped every round, a new random loadout each round. One schedule is shared by every candidate
// of a generation, so they are ranked on the same fights.
function schedule(nOpp,rounds){
  const out=[]; let order=[];
  for(let i=0;i<rounds;i++){
    if(!order.length){ order=Array.from({length:nOpp},(v,k)=>k); for(let k=nOpp-1;k>0;k--){ const j=Math.floor(Math.random()*(k+1)), x=order[k]; order[k]=order[j]; order[j]=x; } }
    out.push({o:order.pop(),flip:i%2,loadout:loadout()});
  }
  return out;
}
// Play `player` through a schedule against the league and add it up.
function evaluate(player,league,rounds,sched){
  sched=sched||schedule(league.length,rounds===undefined?24:rounds);
  const out={fit:0,rounds:sched.length,wins:0,losses:0,timeouts:0,secs:0,presses:0};
  for(const r of sched){
    const res=playRound(player,league[r.o],r);
    out.fit+=score(res); out.secs+=res.t; out.presses+=res.presses; if(res.w===0) out.wins++; else if(res.w===1) out.losses++; if(res.timeout) out.timeouts++;
  }
  out.fit/=Math.max(1,sched.length);
  return out;
}
// The fitness of a set of weights: its mean score over the rounds.
const fitness=(theta,league,rounds,sched)=>evaluate(netPlayer(theta),league,rounds,sched).fit;

module.exports={D,RULES,SIZE,FIXED,opponent,netPlayer,loadout,playRound,score,schedule,evaluate,fitness};
