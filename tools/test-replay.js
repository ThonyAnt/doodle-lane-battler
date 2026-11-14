// Determinism and replay tests: a match repeats exactly from its seed, and (further down) from its log of commands.
// Run: node tools/test-replay.js
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,makeBot,stockItem,INK,replayDuel};')();
let bad=0; const ok=(name,cond,info)=>{ if(!cond) bad++; console.log((cond?'ok   ':'FAIL ')+name+(info!==undefined?'  '+JSON.stringify(info):'')); };
// A test that throws (a function that is not written yet, say) fails by name and the rest still run.
const test=(name,fn)=>{ try{ const r=fn(); if(Array.isArray(r)) ok(name,r[0],r[1]); else ok(name,r); }catch(e){ ok(name,false,String(e&&e.message||e)); } };

/* ---------- helpers ---------- */
const KIT=[['sword','gun'],['hammer','bow']];        // two stock items a side; the gun's trait is "lucky", which rolls dice
function setup(seed,opts){
  const S=D.createDuel(Object.assign({seed},opts));
  KIT.forEach((keys,s)=>keys.forEach((key,k)=>S.setItem(s,k,D.stockItem(key,k?'fire':'none').spec,45)));
  return S;
}
// A live match between two bots; the bots get their seeds before anything is stepped.
function matchLive(seed,opts){ const S=setup(seed,opts); S._bots=[D.makeBot(0,()=>0.55,seed+1),D.makeBot(1,()=>0.55,seed+2)]; return S; }
function stepOnce(S){ for(const s of [0,1]){ S._bots[s](S,1/60); if(S.phase==='draw'&&!S.ready[s]) S.setReady(s); } S.step(1/60); tally(S); }
// Empties the match's events, counting the ones that show a test really had ultimates, hacks and drawn shapes in it.
function tally(S){ const n=S._seen=S._seen||{ult:0,hack:0,obj:0,ko:0}; for(const e of S.events.splice(0)){ if(e.e==='ult') n.ult++; if(e.e==='obj'&&e.o.side!==undefined) n.obj++; if(e.e==='ko') n.ko++; if(e.e==='log'&&/executed$/.test(e.msg)) n.hack++; } }
function stepSecs(S,secs){ for(let i=0;i<Math.round(secs*60);i++) stepOnce(S); return S; }
const match=(seed,secs)=>stepSecs(matchLive(seed),secs);
const sig=S=>JSON.stringify({f:S.f.map(f=>[f.hp,f.x,f.y]),wins:S.wins,phase:S.phase,t:S.t});
// No bots: a fixed list of inputs, the next one applied whenever the tick counter reaches a multiple of 120.
function scriptedDt(seed,secs,dt){
  const S=setup(seed), c=[{j:0,a:0,b:0},{j:0,a:0,b:0}]; let at=-1; S.setReady(0); S.setReady(1);
  for(let i=0;i<Math.round(secs/dt);i++){
    if(S.tickN%120===0&&S.tickN!==at){ at=S.tickN; const n=at/120;
      for(const s of [0,1]){ const toward=(n+s)%5!==3; c[s].a+=n%2?1:2; if(n%4===1+s) c[s].j++; if(n%6===2) c[s].b++;
        S.setInput(s,{l:(s===1)===toward?1:0,r:(s===0)===toward?1:0,d:n%7===5?1:0,j:c[s].j,a:c[s].a,b:c[s].b,m:0,q:0,h:0,u:0}); } }
    S.step(dt); S.events.length=0;
  }
  return S;
}

/* ---------- 1. seeded randomness ---------- */
test('same seed, same match',()=>[1,2,3,4,5].every(s=>sig(match(s,40))===sig(match(s,40))));
test('different seeds differ',()=>sig(match(1,40))!==sig(match(2,40)));
test('no stray Math.random while stepping',()=>{ const r=Math.random; let n=0; Math.random=()=>{ n++; return r(); }; try{ match(7,40); }finally{ Math.random=r; } return [n===0,n]; });
test('stepping in big or small pieces gives the same match',()=>{ const a=scriptedDt(9,40,1/30), b=scriptedDt(9,40,1/120); return [sig(a)===sig(b)&&a.tickN===4800&&b.tickN===4800,[a.tickN,b.tickN]]; });
test('no seed still varies',()=>new Set([0,1,2,3].map(()=>D.createDuel().seed)).size>1);
test('the dice give numbers from 0 up to 1, the same ones for the same seed',()=>{ const a=D.createDuel({seed:42}), b=D.createDuel({seed:42}), xs=Array.from({length:500},()=>a.rand());
  return xs.every(x=>x>=0&&x<1)&&xs.every(x=>x===b.rand())&&new Set(xs).size>490&&a.seed===42; });

/* ---------- 2. state hash ---------- */
test('hash is 8 hex digits',()=>{ const h=match(1,5).hash(); return [/^[0-9a-f]{8}$/.test(h),h]; });
test('equal matches hash equal at every second',()=>{ const a=matchLive(3), b=matchLive(3); for(let s=0;s<40;s++){ stepSecs(a,1); stepSecs(b,1); if(a.hash()!==b.hash()) return [false,s]; } return true; });
test('one hit point of difference changes the hash',()=>{ const a=match(3,10), h=a.hash(); a.f[0].hp-=1; return a.hash()!==h; });
test('the hash follows the fight: it changes from second to second and differs between seeds',()=>{ const a=matchLive(3), seen=new Set(); for(let s=0;s<20;s++){ stepSecs(a,1); seen.add(a.hash()); } return [seen.size===20&&match(4,10).hash()!==match(5,10).hash(),seen.size]; });
test('a shot in the air is part of the hash, and asking for the hash changes nothing',()=>{ const a=match(3,10), h=a.hash(); if(a.hash()!==h) return false;
  a.pr.push({id:999,k:'shot',side:0,slot:0,x:100,y:50,vx:10,vy:0,dmg:1,el:'none',kb:1,ttl:1,life:1}); const h2=a.hash(); a.pr[a.pr.length-1].x+=0.5; return h2!==h&&a.hash()!==h2; });

/* ---------- 3. command log and replay ---------- */
// A whole first-to-WINS match between two bots, recorded. The big screen sets its layout first; during the draw phase a
// player changes an item and (too early to count) draws a stroke. until: stop when that many ticks have been played.
const BOARD={x0:200,x1:1000,floor:60,top:560};
function recorded(seed,until,opts){
  const S=D.createDuel(Object.assign({seed,record:true},opts));
  S.setLayout({w:1400,board:BOARD,plats:[]});
  KIT.forEach((keys,s)=>keys.forEach((key,k)=>S.setItem(s,k,D.stockItem(key,k?'fire':'none').spec,45)));
  S._bots=[D.makeBot(0,()=>0.55,seed+1),D.makeBot(1,()=>0.55,seed+2)];
  for(let i=0;i<30;i++){ S._bots[0](S,1/60); S._bots[1](S,1/60); S.step(1/60); tally(S); }
  S.tweak(0,0,{trait:'guard',tune:1});
  S.stroke(1,[{x:300.123,y:-200.456},{x:420.5,y:-203.25}],'#b0121f');
  while(S.phase!=='over'&&S.tickN<(until||60000)) stepOnce(S);
  return S;
}
const hashAtTick=(seed,tick)=>recorded(seed,tick).hash();
{ let a=null, log=null, b=null;
  test('a replay ends exactly where the match did',()=>{ a=recorded(11); log=JSON.parse(JSON.stringify(a.log())); b=D.replayDuel(log);
    return [a.phase==='over'&&b.hash()===a.hash()&&b.wins.join()===a.wins.join()&&b.tickN===a.tickN,{phase:a.phase,wins:a.wins,ticks:[a.tickN,b.tickN],hash:[a.hash(),b.hash()]}]; });
  test('a replay to the middle matches the match at that tick',()=>D.replayDuel(log,{untilTick:3000}).hash()===hashAtTick(11,3000));
  test('the log is small',()=>[!!log&&JSON.stringify(log).length<60000,JSON.stringify(log).length]);
  test('inputs are logged only when they change',()=>{ const n=log.cmds.filter(c=>c[1]==='setInput').length; return [n>20&&n<a.tickN/4,[n,a.tickN]]; });
  test('a whole match replays in under one second',()=>{ const t=Date.now(); D.replayDuel(log); return [Date.now()-t<1000,Date.now()-t]; });
  test('the log has the layout, the items, the change, the early stroke and the readies in it',()=>{ const names=log.cmds.map(c=>c[1]);
    return [log.v===1&&log.seed===11&&log.ticks===a.tickN&&names[0]==='setLayout'&&['setItem','tweak','stroke','setReady','setInput'].every(n=>names.includes(n))&&log.cmds.every((c,i)=>i===0||c[0]>=log.cmds[i-1][0]),[...new Set(names)]]; });
  test('playing a replay on, a few seconds at a time, agrees with the match all the way',()=>{ const live=recorded(11,1), r=D.replayDuel(log,{untilTick:live.tickN});
    for(let n=0;live.phase!=='over';n++){ for(let i=0;i<300&&live.phase!=='over';i++) stepOnce(live); r.seek(live.tickN); if(r.hash()!==live.hash()||r.tickN!==live.tickN) return [false,live.tickN]; } return true; });
  test('recording does not change the match',()=>{ const plain=recorded(11,0,{record:false}); return [plain.hash()===a.hash()&&plain.tickN===a.tickN&&typeof plain.log==='function'&&plain.log()===null,[plain.tickN,a.tickN]]; });
}
test('20 seeds all replay exactly',()=>{ const seen={ult:0,hack:0,obj:0,ko:0};
  const all=Array.from({length:20},(_,i)=>i+100).every(s=>{ const a=recorded(s); for(const k in seen) seen[k]+=a._seen[k]; return D.replayDuel(a.log()).hash()===a.hash(); });
  return [all&&seen.ult>5&&seen.hack>5&&seen.obj>5&&seen.ko>=40,seen]; });      // ultimates, hacks and drawn shapes keep state in closures: they must have happened for this to mean much
test('a log from another version is refused',()=>{ try{ D.replayDuel({v:99,seed:1,opts:{},cmds:[]}); return false; }catch(e){ return [/version/.test(e.message),e.message]; } });
test('terrain and layout sent in the middle of a fight are replayed too',()=>{ const a=recorded(31,2400); a.setPlats([{id:'w1',wx:300,x0:300,x1:520,y:150}]); for(let i=0;i<240;i++) stepOnce(a);
  a.setLayout({w:1400,board:BOARD,plats:[{id:'w1',wx:360,x0:360,x1:580,y:150},{id:'w2',wx:700,x0:700,x1:900,y:240}]}); for(let i=0;i<600;i++) stepOnce(a);
  const log=a.log(), b=D.replayDuel(JSON.parse(JSON.stringify(log))); return [b.hash()===a.hash()&&b.tickN===a.tickN&&log.cmds.filter(c=>c[1]==='setPlats'||c[1]==='setLayout').length===3,[a.tickN,b.tickN]]; });
test('the spreadsheet stage replays exactly',()=>{ const a=recorded(41,0,{stage:'sheet'}), log=a.log(); return [log.opts.stage==='sheet'&&D.replayDuel(JSON.parse(JSON.stringify(log))).hash()===a.hash(),a.wins]; });
test('what the caller does to its own data afterwards cannot change a recorded match',()=>{ const a=recorded(51,1800), plats=[{id:'w1',wx:300,x0:300,x1:520,y:150}], pts=[{x:400,y:-300},{x:520,y:-300}];
  a.setPlats(plats); a.stroke(0,pts,'#111111'); plats[0].y=400; plats.push({id:'w9',x0:0,x1:900,y:90}); pts[1].x=900; for(let i=0;i<600;i++) stepOnce(a);
  return D.replayDuel(JSON.parse(JSON.stringify(a.log()))).hash()===a.hash(); });

console.log(bad?bad+' failed':'all replay tests pass'); process.exit(bad?1:0);
