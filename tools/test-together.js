// Checks that the overnight features work together: rules in a recorded match replay exactly, the trained CPU's network
// and the rules run side by side, and seeded matches with rules repeat. Run: node tools/test-together.js
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,replayDuel,makeBot,makeNetBot,botLoadout,stockItem,NET_SHAPE,MOVES,KINDS,ELS,FORGE_API,FORGE_LIMITS};')();
const FS=require('../forgescript.js'), F=require('../forge.js')({D,ForgeScript:FS});
let bad=0; const ok=(name,cond,info)=>{ let c=false; try{ c=typeof cond==='function'?cond():cond; }catch(e){ info=String(e&&e.stack||e).slice(0,300); } if(!c) bad++; console.log((c?'ok   ':'FAIL ')+name+(info!==undefined?'  '+JSON.stringify(info):'')); };
const compile=code=>{ const p=FS.parse(code); return p.ok?FS.compile(p.ast):null; };
const item=(key,el)=>Object.assign(D.stockItem(key,el||'none').spec,{power:5,range:5,speed:5,traits:['swift'],trait:'swift'});
// A whole recorded match between two seeded bots, with the built-in rules for their items installed the way the server does.
function match(seed,loads,record){
  const S=D.createDuel({seed,record:!!record}), bots=[D.makeBot(0,()=>0.55,seed+1),D.makeBot(1,()=>0.55,seed+2)];
  loads.forEach((ks,s)=>ks.forEach((k,i)=>S.setItem(s,i,item(k),45)));
  const rules=F.fallbackRules(F.itemsOf(S)), ids=F.install(S,rules);
  S.setReady(0); S.setReady(1);
  let t=0, fired=0; while(S.phase!=='over'&&t<400){ t+=1/60; bots[0](S,1/60); bots[1](S,1/60); S.step(1/60); for(const e of S.events.splice(0)) if(e.e==='rule') fired++; if(S.phase==='draw'){ S.setReady(0); S.setReady(1); } }
  return {S,rules,ids,fired,t};
}
const LOADS=[[['sword'],['gun']],[['hammer','shield'],['bow','sword']],[['spear','bomb'],['star','gloves']]];
{ const m=match(11,LOADS[0],true);
  ok('built-in rules install for a sword against a gun and fire during the match',m.ids.length>=1&&m.ids.every(i=>i>0)&&m.fired>0&&m.S.phase==='over',{rules:m.rules.map(r=>r.name),fired:m.fired,secs:Math.round(m.t)});
  const log=JSON.parse(JSON.stringify(m.S.log()));
  ok('the log holds each rule with its source',log.cmds.filter(c=>c[1]==='addRule').length===m.ids.length&&log.cmds.filter(c=>c[1]==='addRule').every(c=>typeof c[2][0].code==='string'&&c[2][0].code.length>5));
  const again=D.replayDuel(log,{compile});
  ok('a recorded match with rules replays to exactly the same end',again.hash()===m.S.hash()&&again.wins.join()===m.S.wins.join()&&again.rules.length===m.S.rules.length,{wins:m.S.wins,hash:m.S.hash()});
  ok('the replay fired its rules as often as the match did',again.rules.map(r=>r.fired).join()===m.S.rules.map(r=>r.fired).join(),m.S.rules.map(r=>r.fired));
  ok('without a compiler the replay leaves the rules out and does not throw',()=>{ const r=D.replayDuel(log); return r.rules.length===0&&r.tickN===m.S.tickN; });
}
ok('ten more seeded matches with rules all replay exactly',()=>[21,22,23,24,25,26,27,28,29,30].every((s,i)=>{ const m=match(s,LOADS[i%3],true); return D.replayDuel(JSON.parse(JSON.stringify(m.S.log())),{compile}).hash()===m.S.hash(); }));
ok('the same seed gives the same match with rules installed, and a rule\'s chance() uses the match\'s own dice',()=>{ const r=Math.random; let n=0; Math.random=()=>{ n++; return r(); }; let a,b; try{ a=match(7,LOADS[1]); b=match(7,LOADS[1]); }finally{ Math.random=r; } return a.S.hash()===b.S.hash()&&n===0; });
{ // the trained CPU's network and the rules, side by side
  const size=D.NET_SHAPE.reduce((n,k,i,a)=>i?n+a[i-1]*k+k:0,0), file=path.join(__dirname,'..','bot-weights.json');
  let theta=new Float32Array(size).map((v,i)=>Math.sin(i*12.9898)*0.4); try{ const o=JSON.parse(fs.readFileSync(file,'utf8')); if(o.theta.length===size) theta=Float32Array.from(o.theta); }catch(e){}
  ok('the network bot fights a classic bot with rules installed: the match ends and stays in one piece',()=>{
    const S=D.createDuel({seed:5}), net=D.makeNetBot(1,theta,()=>0.55), cl=D.makeBot(0,()=>0.55,9);
    S.setItem(0,0,item('sword'),45); S.setItem(0,1,item('gun'),45); S.setItem(1,0,item('hammer'),45); S.setItem(1,1,item('bow'),45);
    F.install(S,F.fallbackRules(F.itemsOf(S))); S.setReady(0); S.setReady(1);
    let t=0, sane=true; while(S.phase!=='over'&&t<400){ t+=1/60; cl(S,1/60); net(S,1/60); S.step(1/60); S.events.length=0; if(!S.sane()) sane=false; if(S.phase==='draw'){ S.setReady(0); S.setReady(1); } }
    return sane&&S.phase==='over'&&S.rules.every(r=>r.faults===0);
  });
}
console.log(bad?bad+' failed':'all together tests pass'); process.exit(bad?1:0);
