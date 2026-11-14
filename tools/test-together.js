// Checks that the big features work together: abilities in a recorded match replay exactly, the trained CPU's network
// plays with them, and seeded matches with them repeat. Run: node tools/test-together.js
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,replayDuel,makeBot,makeNetBot,stockItem,STOCK,NET_SHAPE,ABILITY_API};')();
const IS=require('../inkscript.js'), compile=(code,on)=>{ const p=IS.parse(code); return p.ok&&!IS.check(p.ast,D.ABILITY_API[on]).length?IS.compile(p.ast):null; };
let bad=0; const ok=(name,cond,info)=>{ let c=false; try{ c=typeof cond==='function'?cond():cond; }catch(e){ info=String(e&&e.stack||e).slice(0,300); } if(!c) bad++; console.log((c?'ok   ':'FAIL ')+name+(info!==undefined?'  '+JSON.stringify(info):'')); };
const SPECIALS=Object.keys(D.STOCK).filter(k=>D.STOCK[k].fancy);
// A whole recorded match between two seeded bots, each holding special presets (which come with abilities: blocks and scripts).
function match(seed,loads,record,stage){
  const S=D.createDuel(Object.assign({seed,record:!!record,compile},stage?{stage}:null)), bots=[D.makeBot(0,()=>0.55,seed+1),D.makeBot(1,()=>0.55,seed+2)];
  loads.forEach((ks,s)=>ks.forEach((k,i)=>S.setItem(s,i,D.stockItem(k,'none').spec,45)));
  S.setReady(0); S.setReady(1);
  let t=0, fired=0; while(S.phase!=='over'&&t<400){ t+=1/60; bots[0](S,1/60); bots[1](S,1/60); S.step(1/60); for(const e of S.events.splice(0)) if(e.e==='ab') fired++; if(S.phase==='draw'){ S.setReady(0); S.setReady(1); } }
  return {S,fired,t};
}
const pair=i=>[[SPECIALS[i%SPECIALS.length],SPECIALS[(i+5)%SPECIALS.length]],[SPECIALS[(i+2)%SPECIALS.length],SPECIALS[(i+7)%SPECIALS.length]]];
const faults=S=>S.items.flat().filter(Boolean).reduce((n,it)=>n+(it.abx||[]).reduce((m,x)=>m+(x&&x.faults||0),0),0);
{ const m=match(11,pair(0),true);
  ok('special presets fight a whole match and their scripts fire',m.fired>0&&m.S.phase==='over'&&faults(m.S)===0,{fired:m.fired,secs:Math.round(m.t)});
  const log=JSON.parse(JSON.stringify(m.S.log()));
  ok('the log holds each ability with its code',log.cmds.filter(c=>c[1]==='setItem').every(c=>Array.isArray(c[2][2].abilities))&&log.cmds.some(c=>c[1]==='setItem'&&c[2][2].abilities.some(a=>typeof a.code==='string'&&a.code.length>5)));
  const again=D.replayDuel(log,{compile});
  ok('a recorded match with abilities replays to exactly the same end',again.hash()===m.S.hash()&&again.wins.join()===m.S.wins.join(),{wins:m.S.wins,hash:m.S.hash()});
  ok('without a compiler the replay does not throw (scripts are inert, so it may end elsewhere)',()=>{ D.replayDuel(log); return true; });
}
ok('ten more seeded matches with abilities all replay exactly',()=>[21,22,23,24,25,26,27,28,29,30].every((s,i)=>{ const m=match(s,pair(i+1),true); return D.replayDuel(JSON.parse(JSON.stringify(m.S.log())),{compile}).hash()===m.S.hash(); }));
for(const stage of ['sheet','deck']) ok('on the '+stage+' stage a recorded match with abilities is sound and replays exactly',()=>[31,32,33].every((sd,i)=>{ const m=match(sd,pair(i+3),true,stage); return m.S.sane()&&faults(m.S)===0&&D.replayDuel(JSON.parse(JSON.stringify(m.S.log())),{compile}).hash()===m.S.hash(); }));
ok('the same seed gives the same match with abilities, and chance() uses the match\'s own dice',()=>{ const r=Math.random; let n=0; Math.random=()=>{ n++; return r(); }; let a,b; try{ a=match(7,pair(4)); b=match(7,pair(4)); }finally{ Math.random=r; } return a.S.hash()===b.S.hash()&&n===0; });
{ // the trained CPU's network and abilities, side by side
  const size=D.NET_SHAPE.reduce((n,k,i,a)=>i?n+a[i-1]*k+k:0,0), file=path.join(__dirname,'..','bot-weights.json');
  let theta=new Float32Array(size).map((v,i)=>Math.sin(i*12.9898)*0.4); try{ const o=JSON.parse(fs.readFileSync(file,'utf8')); if(o.theta.length===size) theta=Float32Array.from(o.theta); }catch(e){}
  ok('the network bot fights a classic bot, both with special presets: the match ends and stays in one piece',()=>{
    const S=D.createDuel({seed:5,compile}), net=D.makeNetBot(1,theta,()=>0.55), cl=D.makeBot(0,()=>0.55,9);
    pair(6).forEach((ks,s)=>ks.forEach((k,i)=>S.setItem(s,i,D.stockItem(k,'none').spec,45))); S.setReady(0); S.setReady(1);
    let t=0, sane=true; while(S.phase!=='over'&&t<400){ t+=1/60; cl(S,1/60); net(S,1/60); S.step(1/60); S.events.length=0; if(!S.sane()) sane=false; if(S.phase==='draw'){ S.setReady(0); S.setReady(1); } }
    return sane&&S.phase==='over'&&faults(S)===0;
  });
}
console.log(bad?bad+' failed':'all together tests pass'); process.exit(bad?1:0);
