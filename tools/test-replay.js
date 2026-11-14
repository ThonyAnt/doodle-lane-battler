// Determinism and replay tests: a match repeats exactly from its seed, and (further down) from its log of commands.
// Run: node tools/test-replay.js
const fs=require('fs'), path=require('path'), http=require('http'), cp=require('child_process'), vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,makeBot,stockItem,INK,replayDuel};')();
// The page's own replay code that needs no screen: the part of duel.html between the PAGE-PURE marks, loaded after the rules.
const pure=names=>new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';'+((src.split('/*PAGE-PURE-START*/')[1]||'').split('/*PAGE-PURE-END*/')[0])+';return {'+names.map(n=>n+':typeof '+n+'==="undefined"?undefined:'+n).join(',')+'};')();
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
  S._art=[]; const show=(s,k,strokes,it)=>S._art.push({side:s,slot:k,strokes,ver:it.ver,kind:it.kind,style:it.style});      // the drawings by item version, as a room notes them
  KIT.forEach((keys,s)=>keys.forEach((key,k)=>{ const made=D.stockItem(key,k?'fire':'none'); show(s,k,made.strokes,S.setItem(s,k,made.spec,45)); }));
  S._bots=[D.makeBot(0,()=>0.55,seed+1),D.makeBot(1,()=>0.55,seed+2)];
  for(let i=0;i<30;i++){ S._bots[0](S,1/60); S._bots[1](S,1/60); S.step(1/60); tally(S); }
  show(0,0,S._art[0].strokes,S.tweak(0,0,{trait:'guard',tune:1}));
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

// A pretend browser: just enough of one for the page's own script to start and run frames with nothing on the screen.
// Elements are stand-ins that accept anything; the ones the page looks up by id exist if the page's HTML (or HTML the
// script wrote) has that id. search: the address's query string. respond(url): what fetch answers with (JSON).
// Returns get(expression): read the page's own variables; byId; script: the page script's text; frames(n, each).
function fakePage(search,respond){
  const root=path.join(__dirname,'..'), script=/<script>\n([\s\S]*?)<\/script>/.exec(src)[1];
  const known=new Set(), ids=new Map(), noteIds=s=>{ for(const m of String(s).matchAll(/\bid="([^"${}]+)"/g)) known.add(m[1]); };
  noteIds(src.slice(0,src.indexOf('<script')));
  const el=preset=>{ const store=Object.assign({},preset), p=new Proxy(function(){},{
    get(t,k){ if(k===Symbol.toPrimitive) return ()=>0; if(k===Symbol.iterator) return function*(){}; if(k==='then'||typeof k==='symbol') return undefined;
      if(!(k in store)) store[k]=k==='children'||k==='childNodes'?[]:k==='querySelectorAll'?(()=>{ const two=[el({hidden:false}),el({hidden:false})]; return ()=>two; })():el(); return store[k]; },
    set(t,k,v){ store[k]=v; if(k==='id'){ known.add(v); ids.set(v,p); } if(k==='innerHTML') noteIds(v); return true; },
    apply(){ return el(); }, construct(){ return el(); } }); return p; };
  const byId=id=>known.has(id)?(ids.get(id)||(ids.set(id,el(id==='arena'?{clientWidth:960,clientHeight:440,width:960,height:440}:{hidden:false})),ids.get(id))):null;
  const frames=[]; let now=1000;
  const keep=()=>{ const m=new Map(); return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{ m.set(k,String(v)); },removeItem:k=>{ m.delete(k); }}; };
  const ctx={console,URLSearchParams,URL,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
    document:el({getElementById:byId,createElement:()=>el({hidden:false}),currentScript:{textContent:script},title:'',hidden:false}),
    location:{search,pathname:'/duel',hash:'',protocol:'http:',hostname:'localhost',origin:'http://localhost',href:'http://localhost/duel'+search},
    history:{replaceState(){},pushState(){}}, navigator:{userAgent:'node',maxTouchPoints:0}, performance:{now:()=>now},
    requestAnimationFrame:f=>{ frames.push(f); return frames.length; }, cancelAnimationFrame(){},
    fetch:url=>Promise.resolve().then(()=>respond(String(url))).then(body=>body===undefined?Promise.reject(new Error('no answer')):{ok:!(body&&body.error),status:body&&body.error?404:200,json:()=>Promise.resolve(body)}),
    EventSource:function(){ return el(); }, ResizeObserver:function(){ return {observe(){},disconnect(){}}; }, MutationObserver:function(){ return {observe(){},disconnect(){}}; },
    matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}), innerWidth:1200, innerHeight:800, devicePixelRatio:1,
    sessionStorage:keep(), localStorage:keep(), addEventListener(){}, removeEventListener(){}, alert(){}, getComputedStyle:()=>el(), Image:function(){ return el(); }, Audio:function(){ return el(); }};
  ctx.window=ctx; ctx.self=ctx; ctx.globalThis=ctx; vm.createContext(ctx);
  const run=(code,name)=>vm.runInContext(code,ctx,{filename:name});
  for(const f of ['anim/core','anim/locomotion','anim/blade','anim/bow','anim/gun','anim/spear','anim/hammer','anim/fist','anim/staff','anim/hurl','anim/dual','anim/akimbo','anim/ultimate','inkshop'])
    run(fs.readFileSync(path.join(root,f+'.js'),'utf8'),f+'.js');
  run(script,'duel.html script');
  return {get:expr=>run(expr,'probe'), byId, script,
    // n frames, 1/60 s apart, letting promises (a fetch) settle in between; each(now) may return false to stop early
    async frames(n,each){ for(let i=0;i<n;i++){ await new Promise(r=>setImmediate(r)); now+=1000/60; for(const f of frames.splice(0)) f(now); if(each&&each(now)===false) break; } }};
}

(async()=>{
/* ---------- 4. rooms record; replays are served and viewed ---------- */
// Against a real server (a child `node server.js` on port 3193, with no API key): a bot room is played through its
// first round by posting inputs like a controller, then its replay is fetched and simulated again here.
const PORT=3193, URL0='http://127.0.0.1:'+PORT, sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=async p=>{ const r=await fetch(URL0+p); let body=null; try{ body=await r.json(); }catch(e){} return {status:r.status,body}; };
const post=async(p,o)=>{ const r=await fetch(URL0+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o||{})}); let body=null; try{ body=await r.json(); }catch(e){} return {status:r.status,body}; };
const atest=async(name,fn)=>{ try{ const r=await fn(); if(Array.isArray(r)) ok(name,r[0],r[1]); else ok(name,r); }catch(e){ ok(name,false,String(e&&e.message||e)); } };
// A player's event stream: keeps the newest state the server sent.
function listen(code,id){ const me={state:null,hello:null,items:[],req:null};
  me.req=http.get(URL0+'/duel/events?room='+code+'&id='+id,res=>{ res.setEncoding('utf8'); let buf='';
    res.on('data',chunk=>{ buf+=chunk; for(let i;(i=buf.indexOf('\n\n'))>=0;){ const msg=buf.slice(0,i); buf=buf.slice(i+2); const ev=(/^event: (.*)$/m.exec(msg)||[])[1], data=(/^data: (.*)$/m.exec(msg)||[])[1]; if(!ev||!data) continue;
      const d=JSON.parse(data); if(ev==='state') me.state=d; else if(ev==='hello') me.hello=d; else if(ev==='item') me.items.push(d); } }); });
  me.req.on('error',()=>{}); return me; }
let server=null; const stop=()=>{ if(server){ try{ server.kill('SIGKILL'); }catch(e){} server=null; } }; process.on('exit',stop);
try{
  let busy=false; try{ await fetch(URL0+'/info'); busy=true; }catch(e){}
  if(busy) throw new Error('port '+PORT+' is already in use: stop whatever is listening there and run again');
  const env=Object.assign({},process.env,{PORT:String(PORT)}); delete env.OPENAI_API_KEY;
  server=cp.spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env,stdio:'ignore'});
  let up=false; for(let i=0;i<60&&!up;i++){ await sleep(100); try{ up=(await fetch(URL0+'/info')).ok; }catch(e){} }
  if(!up) throw new Error('the test server did not start');
  const code=(await post('/duel/room?bot=1&skill=1')).body.code, id='replay-test-'+process.pid, me=listen(code,id), act=o=>post('/duel/act',Object.assign({room:code,id},o));
  for(let i=0;i<50&&!me.hello;i++) await sleep(50);
  await act({type:'stock',slot:0,key:'sword',el:'none'}); await act({type:'tweak',slot:0,tune:1}); await act({type:'ready'});
  // run at the bot and mash the attack button until someone has won a round (a round is 90 s at most)
  let seq=0, a=0, j=0; const t0=Date.now();
  while(Date.now()-t0<130000&&!(me.state&&me.state.wins[0]+me.state.wins[1]>=1)){ const f=me.state&&me.state.f, right=!f||f[1].x>=f[0].x; a++; if(a%9===0) j++;
    await act({type:'input',seq:++seq,l:!right,r:right,d:false,j,a,b:0,m:0,q:0,u:0,h:3}); await sleep(90); }
  await act({type:'input',seq:++seq,l:false,r:false,d:false,j,a,b:0,m:0,q:0,u:0,h:3}); await sleep(300);
  const res=await get('/duel/replay?room='+code), liveState=me.state; let replayed=null;
  await atest('the room serves its replay',()=>[res.status===200&&res.body.log.v===1&&res.body.log.cmds.length>10,{status:res.status,cmds:res.body&&res.body.log&&res.body.log.cmds.length,secs:Math.round((Date.now()-t0)/1000)}]);
  await atest('replaying it reproduces the round result',()=>{ replayed=D.replayDuel(res.body.log); return [liveState.wins[0]+liveState.wins[1]===1&&replayed.wins.join()===liveState.wins.join(),[replayed.wins,liveState.wins]]; });
  await atest('and ends in exactly the state the server was in',()=>[/^[0-9a-f]{8}$/.test(res.body.hash)&&replayed.hash()===res.body.hash&&replayed.tickN===res.body.log.ticks,[replayed.hash(),res.body.hash]]);
  // Blue's sword, the same sword after its change, and the bot's two items; a weapon forged in the fight brings its picture in its own event.
  await atest('the replay comes with the drawings, by item version',()=>{ const art=res.body.art, vers=art.map(x=>x.ver), its=[].concat(...replayed.items).filter(Boolean), forged=replayed.events.filter(e=>e.e==='forge').map(e=>e.ver);
    return [art.length===4&&new Set(vers).size===4&&art.every(x=>Array.isArray(x.strokes)&&x.strokes.length&&(x.side===0||x.side===1)&&(x.slot===0||x.slot===1))&&its.length>=1&&its.every(it=>vers.includes(it.ver)||forged.includes(it.ver)),{vers,forged,items:its.map(it=>it.ver)}]; });
  await atest('the rules stamp on a replay is the one the page works out for itself',async()=>{ const html=await (await fetch(URL0+'/duel?replay='+code)).text(), script=/<script>\n([\s\S]*?)<\/script>/.exec(html)[1], P=pure(['rulesOf','replayProblem']);
    return [/^[0-9a-f]{8}$/.test(res.body.rules)&&P.rulesOf(script)===res.body.rules&&P.replayProblem(res.body,P.rulesOf(script))==='',[res.body.rules,P.rulesOf(script)]]; });
  await atest('an unknown room is a 404',async()=>(await get('/duel/replay?room=ZZZZ')).status===404);
  await act({type:'rematch'}); await sleep(150);
  const afterRematch=(await get('/duel/replay?room='+code)).body;
  await atest('a rematch starts a new log and keeps the last one',()=>[afterRematch.log.cmds.length<res.body.log.cmds.length||afterRematch.previous===true,{previous:afterRematch.previous,cmds:afterRematch.log.cmds.length}]);
  await atest('the kept one is the whole of the last match',()=>afterRematch.previous===true&&afterRematch.log.ticks>=res.body.log.ticks&&afterRematch.log.seed===res.body.log.seed&&D.replayDuel(afterRematch.log).hash()===afterRematch.hash);
  await act({type:'stock',slot:0,key:'gun',el:'fire'}); await act({type:'ready'});
  for(let i=0;i<60&&!(me.state&&me.state.phase!=='draw'&&me.state.wins[0]+me.state.wins[1]===0);i++) await sleep(50);
  await sleep(120); const fresh=(await get('/duel/replay?room='+code)).body;
  await atest('once the new match is under way the replay is the new one',()=>[!fresh.previous&&fresh.log.seed!==res.body.log.seed&&fresh.log.cmds.length<res.body.log.cmds.length&&D.replayDuel(fresh.log).hash()===fresh.hash,{previous:fresh.previous,cmds:fresh.log.cmds.length}]);
  me.req.destroy();
}catch(e){ ok('the room tests ran',false,String(e&&e.message||e)); }
finally{ stop(); }
// The shelf of kept replays, with a clock we set by hand: 30 minutes each, 50 at most, the oldest dropped first.
test('kept replays last 30 minutes and there are never more than 50',()=>{ const mk=require('../duel-server.js').replayShelf; if(!mk) return [false,'no replayShelf']; const sh=mk(), MIN=60e3;
  for(let i=0;i<60;i++) sh.put('R'+i,{n:i},i*1000);
  const sizeOk=sh.size()===50&&sh.get('R9',60000)===null&&sh.get('R10',60000).n===10&&sh.get('R59',60000).n===59;
  sh.put('R10',{n:'again'},20*MIN);                                    // the same room again: its newer match replaces the older one
  const fresh=sh.get('R10',49*MIN).n==='again', gone=sh.get('R11',30*MIN+11001)===null, still=sh.get('R59',30*MIN+11001).n===59;
  sh.sweep(31*MIN); return [sizeOk&&fresh&&gone&&still&&sh.size()===1&&sh.get('R10',51*MIN)===null,{size:sh.size(),sizeOk,fresh,gone,still}]; });
// A room records whatever its players send, so a recording must not be able to grow without end.
test('a recording stops when it is full, says so, and still replays up to there',()=>{ const a=recorded(61,2400), big=Array.from({length:600},(_,i)=>({x:300+i*0.71,y:-300-(i%7)*1.3})); let n=0;
  while(!a.log().full&&n<2000){ a.stroke(n%2,big,'#111111'); stepOnce(a); n++; }
  const log=a.log(), size=JSON.stringify(log).length, cut=D.replayDuel(JSON.parse(JSON.stringify(log))), mark=a.hash(); for(let i=0;i<120;i++){ a.stroke(0,big,'#111111'); stepOnce(a); }
  const later=a.log(); return [log.full===true&&n>50&&n<2000&&size<2.2e6&&log.ticks<=a.tickN&&cut.tickN===log.ticks&&later.ticks===log.ticks&&later.cmds.length===log.cmds.length&&a.hash()!==mark&&a.tickN>log.ticks,{strokes:n,size,ticks:log.ticks}]; });
// The viewer itself, in the pretend browser: nothing is drawn, but every line of it runs, on a real recorded match.
{ const a=recorded(11), R=pure(['rulesOf']), answer=()=>({log:JSON.parse(JSON.stringify(a.log())),art:a._art,hash:a.hash(),rules:null});
  await atest('the page plays a fetched replay to its end, with the same result and state as the match',async()=>{
    const page=fakePage('?replay=ABCD',url=>url.startsWith('/duel/replay?room=ABCD')?Object.assign(answer(),{rules:R.rulesOf(page.script)}):{reader:'local guess'});
    await page.frames(3); const said=page.byId('repMsg').textContent, total=page.get('rep&&rep.clock.total'); if(total!==a.tickN) return [false,{said,total}];
    page.get('rep.clock.speed=4'); await page.frames(4000,()=>page.get('rep.clock.playing'));
    const got={said,phase:page.get('view.phase'),wins:page.get('view.wins.join()'),hash:page.get('rep.S.hash()'),w:page.get('ARENA_W'),time:page.byId('repTime').textContent,button:page.byId('repPlay').textContent,
      art:page.get('JSON.stringify(art.map(a=>a.map(x=>x&&x.ver)))'),mode:page.get('mode'),retro:page.get('RETRO')};
    return [/whole match/.test(said)&&!/Warning/.test(said)&&got.phase==='over'&&got.wins===a.wins.join()&&got.hash===a.hash()&&got.w===1400&&got.button==='Watch again'&&got.time.split(' / ')[0]===got.time.split(' / ')[1]
      &&got.art===JSON.stringify(a.items.map(x=>x.map(it=>it&&it.ver)))&&got.mode==='replay'&&got.retro===false,got]; });
  await atest('scrubbing back, slow motion, pause and dragging the bar put the picture where they should',async()=>{
    const page=fakePage('?replay=ABCD',url=>url.startsWith('/duel/replay')?Object.assign(answer(),{rules:R.rulesOf(page.script)}):{reader:'local guess'}), bar=()=>page.byId('repBar'), at=[];
    await page.frames(3); page.get('rep.clock.speed=4'); await page.frames(400);                    // well into the fight
    bar().value=1200; bar().onpointerdown(); bar().oninput(); await page.frames(2); const held=page.get('rep.shown'), dragging=page.get('rep.drag'); bar().onchange();      // drag back and let go
    const back=page.get('rep.S.tickN')===1200&&page.get('rep.S.hash()')===hashAtTick(11,1200)&&page.get('wobj.size')===page.get('view.objs.length');
    page.get('rep.clock.speed=0.25'); await page.frames(60); at.push(page.get('rep.shown'));                // a second of quarter speed: 30 ticks
    page.byId('repPlay').onclick(); await page.frames(30); at.push(page.get('rep.shown'));                  // paused: it stays
    page.byId('repPlay').onclick(); page.get('rep.clock.speed=1'); await page.frames(60); at.push(page.get('rep.shown'));      // playing again: a second is 120 ticks
    return [held===1200&&dragging===true&&back&&at.join()==='1230,1230,1350'&&page.get('rep.S.hash()')===hashAtTick(11,1350),{held,dragging,back,at}]; });
  await atest('a room that sat on its champion screen for a minute does not make the replay a minute longer',async()=>{
    const b=recorded(11), over=b.tickN; for(let i=0;i<3600;i++) stepOnce(b);
    const page=fakePage('?replay=ABCD',url=>url.startsWith('/duel/replay')?{log:JSON.parse(JSON.stringify(b.log())),art:b._art,hash:b.hash(),rules:R.rulesOf(page.script)}:{reader:'local guess'}); await page.frames(3);
    const total=page.get('rep.clock.total'), said=page.byId('repMsg').textContent; return [b.tickN===over+7200&&total>=over-1&&total<=over+60&&/whole match/.test(said)&&!/Warning/.test(said),{over,logged:b.tickN,total,said}]; });
  await atest('the page refuses a replay made under other rules, in words',async()=>{
    const page=fakePage('?replay=ABCD',url=>url.startsWith('/duel/replay')?Object.assign(answer(),{rules:'0badf00d'}):{reader:'local guess'}); await page.frames(3);
    return [page.get('rep')===null&&page.byId('repMsg').textContent==='This replay is from a different version of the game.',page.byId('repMsg').textContent]; });
  await atest('the page says so when a room has no replay, or the replay did not come out as it did on the server',async()=>{
    const none=fakePage('?replay=QQQQ',url=>url.startsWith('/duel/replay')?{error:'There is no replay for that room.'}:{reader:'local guess'}); await none.frames(3);
    const off=fakePage('?replay=ABCD',url=>url.startsWith('/duel/replay')?Object.assign(answer(),{rules:R.rulesOf(off.script),hash:'00000000'}):{reader:'local guess'}); await off.frames(3);
    return [none.get('rep')===null&&none.byId('repMsg').textContent==='There is no replay for that room.'&&/Warning/.test(off.byId('repMsg').textContent)&&off.get('rep')!==null,[none.byId('repMsg').textContent,off.byId('repMsg').textContent]]; });
}
{ const P=pure(['replayProblem','replayAt','replayClock','replayAdvance','replayTime','replayWorld','replayArt','replayFit','replayDuel']);
  // The viewer's own logic, run here without a screen.
  test('the viewer plays on from where it is, and starts the match again to go back',()=>{ const a=recorded(11), log=a.log();
    const s1=P.replayAt(log,1200), h1=s1.hash(), s2=P.replayAt(log,1320), h2=s2.hash(), t2=s2.tickN, s3=P.replayAt(log,600), h3=s3.hash(), t3=s3.tickN, end=P.replayAt(log,log.ticks+999);
    return [s1===s2&&t2===1320&&s3!==s2&&t3===600&&h1===hashAtTick(11,1200)&&h2===hashAtTick(11,1320)&&h3===hashAtTick(11,600)&&end===s3&&end.hash()===a.hash()&&end.tickN===a.tickN,[t2,t3,end.tickN]]; });
  test('the viewer clock runs at a quarter, one and four times speed, pauses, and stops at the end',()=>{ const c=P.replayClock(1000), at=[];
    at.push(P.replayAdvance(c,0.5)); c.speed=0.25; at.push(P.replayAdvance(c,1)); c.speed=4; at.push(P.replayAdvance(c,1)); c.playing=false; at.push(P.replayAdvance(c,1)); c.playing=true; at.push(P.replayAdvance(c,5));
    return [at.join()==='60,90,570,570,1000'&&c.playing===false&&P.replayTime(0)==='0:00'&&P.replayTime(120*75+60)==='1:15',at]; });
  test('after a jump the page is given the world as it stands, not the fight it skipped',()=>{ const o=id=>({e:'obj',o:{id}}), evs=[o(1),{e:'hit'},{e:'clear'},o(2),{e:'stroke',side:0},{e:'hit'},{e:'ko'},{e:'read',side:0},{e:'forge',ver:9},o(3),{e:'log'}];
    const out=P.replayWorld(evs).map(e=>e.e+(e.o?e.o.id:'')); return [out.join()==='clear,obj2,stroke,read,obj3'&&P.replayWorld([o(1),{e:'hit'},o(2)]).length===2&&P.replayWorld([]).length===0,out]; });
  test('each hand shows the drawing noted for its item version',()=>{ const A={strokes:[1]}, B={strokes:[2]}, byVer=new Map([[3,A],[7,B]]), items=[[{ver:3,kind:'melee'},null],[{ver:8,kind:'bomb'},{ver:7,kind:'heal'}]];
    const ch=P.replayArt(items,[[null,5],[2,7]],byVer), key=ch.map(c=>c.side+''+c.slot+':'+c.ver+':'+(c.art?c.art.strokes[0]:'-')).join(' ');
    return [key==='00:3:1 01:null:- 10:null:-'&&P.replayArt(items,[[3,null],[null,7]],byVer).length===0,key]; });
  test('a recorded stage of any size fits the viewer',()=>{ const GY=392, fits=(w,top,cw,maxCh)=>{ const q=P.replayFit(w,top,cw,maxCh), X=x=>(x+q.ox)*q.sc, Y=h=>(GY-h-q.vtop)*q.sc;
      return q.ch<=maxCh+1&&X(0)>=-0.5&&X(w)<=cw+0.5&&Y(Math.max(392,top+40))>=-0.5&&Y(-48)<=q.ch+0.5&&Math.abs(Y(-48)-q.ch)<1.5&&Math.abs(q.vw*q.sc-cw)<1; };
    const plain=P.replayFit(960,0,960,2000);
    return [fits(960,0,960,600)&&fits(1400,560,1000,500)&&fits(3000,700,800,700)&&fits(960,0,400,200)&&plain.ch===440&&plain.sc===1&&plain.ox===0&&plain.vtop===0,plain]; });
  test('the viewer refuses a replay from other rules or another log version, and says so',()=>{ if(!P.replayProblem) return [false,'no replayProblem']; const log={v:1,seed:1,opts:{},cmds:[],ticks:0}, said='This replay is from a different version of the game.';
    return [P.replayProblem({log,rules:'aaaaaaaa'},'aaaaaaaa')===''&&P.replayProblem({log,rules:'aaaaaaaa'},'bbbbbbbb')===said&&P.replayProblem({log:Object.assign({},log,{v:2}),rules:'aaaaaaaa'},'aaaaaaaa')===said&&P.replayProblem({},'aaaaaaaa')!==''&&P.replayProblem(null,'aaaaaaaa')!=='',P.replayProblem({log,rules:'x'},'y')]; });
}

/* ---------- 5. the knockout replay ---------- */
{ const {koReplayFrame,koNote}=pure(['koReplayFrame','koNote']);
  const ring=Array.from({length:300},(_,i)=>({ms:i*16.7,snap:{i}})), ko=299*16.7;
  test('nothing for the first 0.4 s',()=>koReplayFrame(ring,ko,300)===null);
  test('starts one second before the knockout',()=>Math.abs(koReplayFrame(ring,ko,400).i*16.7-(ko-1000))<17);
  test('runs at one third speed',()=>Math.abs(koReplayFrame(ring,ko,1900).i*16.7-(ko-500))<17);
  test('ends on the knockout, then stops',()=>Math.abs(koReplayFrame(ring,ko,3399).i-299)<=1&&koReplayFrame(ring,ko,3401)===null);
  test('a short ring does not crash',()=>koReplayFrame(ring.slice(-10),ko,1000)!==undefined&&koReplayFrame([],ko,1000)===null);
  test('it never shows anything from after the knockout, and goes forward only',()=>{ const late=ring.concat(Array.from({length:200},(_,i)=>({ms:ko+(i+1)*16.7,snap:{i:300+i}}))); let last=-1;
    for(let t=400;t<=3400;t+=7){ const s=koReplayFrame(late,ko,t); if(!s||s.i>299||s.i<last) return [false,t]; last=s.i; } return last===299; });
  test('the page keeps five seconds of snapshots, and a knockout starts the replay clock',()=>{ const k={ring:[],koMs:-1}; let t=0;
    for(let i=0;i<600;i++){ t=i*16.7; koNote(k,{ev:[],wins:[0,0],winner:-1},t,2); } const span=t-k.ring[0].ms, idle=k.koMs;
    koNote(k,{ev:[{e:'hit'},{e:'ko',side:1}],wins:[0,1],winner:1},t+16.7,2); return [span<=5000&&span>4900&&idle===-1&&k.koMs===t+16.7&&k.ring[k.ring.length-1].ms===k.koMs,{span,ko:k.koMs}]; });
  test('the knockout that ends the match is not replayed, so the champion screen is never covered',()=>{ const k={ring:[],koMs:-1};
    koNote(k,{ev:[{e:'ko',side:1}],wins:[0,1],winner:1},100,2); const first=k.koMs; koNote(k,{ev:[{e:'ko',side:1}],wins:[0,2],winner:1},9000,2); const last=k.koMs;
    koNote(k,{ev:[{e:'ko',side:-1}],wins:[1,1],winner:-1},20000,2); return [first===100&&last===-1&&k.koMs===20000,[first,last,k.koMs]]; });      // a drawn round is replayed like any other
}
// The page itself, in the pretend browser: a match against the bot on this device (Blue never touches a button, so Red wins 2 : 0).
// what: 'past' while the picture comes from before the knockout, 'live' otherwise; sounds are counted through a stand-in for sfx.js.
async function botMatchInPage(search){
  const page=fakePage(search,()=>({reader:'local guess'})), kos=[], log=[]; await page.frames(3);
  page.get("window.SFX={muted:false,n:0,play(){ this.n++; },toggle(){}}; setMode('bot'); sim.setReady(0);"); let prev=0, t0=0;
  await page.frames(30000,now=>{ const wins=page.get('view.wins[0]+view.wins[1]'), phase=page.get('view.phase');
    if(wins>prev){ prev=wins; t0=now; kos.push({ended:page.get('view.wins[view.winner]>=WINS'),past:0,live:0,early:0,late:0,soundsPast:0,from:[],lastPast:0,banner:page.get('NAME[view.winner]')}); }
    const k=kos[kos.length-1]; if(k){ const since=now-t0, shown=page.get('koView'), sfx=page.get('SFX.n');
      if(shown){ k.past++; k.lastPast=since; if(since<400) k.early++; if(since>3400+17) k.late++; k.from.push(shown.phase); if(k.sfx!==undefined&&sfx!==k.sfx) k.soundsPast++; } else k.live++;
      k.sfx=sfx; }
    return phase!=='over'||now-t0<5000; });
  return {kos,phase:page.get('view.phase'),overlay:page.byId('overlay').hidden,wins:page.get('view.wins.join()')};
}
await atest('in the page, a round-ending knockout is shown again for three seconds, then the game is live again',async()=>{ const m=await botMatchInPage('?plain=1'), k=m.kos[0];
  return [m.kos.length===2&&!k.ended&&k.past>=170&&k.past<=185&&k.early===0&&k.late===0&&k.lastPast>3300&&k.from.slice(0,150).every(p=>p==='fight')&&k.soundsPast===0,m.kos.map(x=>({ended:x.ended,past:x.past,live:x.live,early:x.early,late:x.late,lastPast:Math.round(x.lastPast),sounds:x.soundsPast}))]; });
await atest('the knockout that wins the match goes straight to the champion screen',async()=>{ const m=await botMatchInPage('?plain=1'), k=m.kos[m.kos.length-1];
  return [m.phase==='over'&&k.ended&&k.past===0&&m.overlay===false,{past:k.past,overlay:m.overlay,wins:m.wins}]; });
await atest('?ko=0 switches the knockout replay off',async()=>{ const m=await botMatchInPage('?plain=1&ko=0'); return [m.kos.length===2&&m.kos.every(k=>k.past===0),m.kos.map(k=>k.past)]; });
await atest('it works the same on the retro desktop layout',async()=>{ const m=await botMatchInPage(''), k=m.kos[0]; return [m.kos.length===2&&k.past>=170&&k.past<=185&&m.kos[1].past===0&&m.phase==='over',m.kos.map(x=>x.past)]; });

/* ---------- 6. the seeded bench ---------- */
{ const bench=(...args)=>cp.execFileSync(process.execPath,[path.join(__dirname,'balance.js'),...args],{encoding:'utf8'});
  test('a seeded bench prints the same numbers twice',()=>{ const out1=bench('quick','--n=40','--seed=5'), out2=bench('quick','--n=40','--seed=5'); return [out1===out2&&/melee beats ranged \d+%/.test(out1),out1.trim().split('|').slice(1).join('|')]; });
  test('another seed plays other rounds, and the people the bot meets are seeded too',()=>{ const a=bench('bot','--n=12','--seed=5'), b=bench('bot','--n=12','--seed=5'), c=bench('bot','--n=12','--seed=905'); return a===b&&a!==c; });
}

console.log(bad?bad+' failed':'all replay tests pass'); process.exit(bad?1:0);
})();
