// Determinism and replay tests: a match repeats exactly from its seed, and (further down) from its log of commands.
// Run: node tools/test-replay.js
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,makeBot,stockItem,INK};')();
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
function stepOnce(S){ for(const s of [0,1]){ S._bots[s](S,1/60); if(S.phase==='draw'&&!S.ready[s]) S.setReady(s); } S.step(1/60); S.events.length=0; }
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

console.log(bad?bad+' failed':'all replay tests pass'); process.exit(bad?1:0);
