// Net bench for Doodle Duel: how long from a button press to the first state that shows the fighter moving, and how many
// bytes a second a device receives, on each of the two links (the event stream with a request per input, and the
// WebSocket), through a local TCP relay that makes the network slow and uneven.
//   node tools/net-bench.js --delay=30 --jitter=20
// Options: --delay=ms added to everything, each way (default 30); --jitter=ms more, picked at random per packet up to
//   this (default 20; a late packet holds up the ones behind it, as on a real connection); --presses=200 per link;
//   --repeat=0 leaves out the page's habit of sending its buttons again every 150 ms (with it, the default, a press on
//   the event stream often has to wait for a repeat that is still in the air: that is how the page really behaves);
//   --port=3195 for the child server (the relay takes any free port).
// It starts its own `node server.js` (no API key), plays one room against the bot per link and prints one table.
// Pass marks: the socket's median is no higher than the event stream's, and its bytes a second are at most 40% of it.
const http=require('http'), net=require('net'), path=require('path'), cp=require('child_process');
const W=require('../ws.js'), Wire=require('../wire.js');
const arg=(k,d)=>{ const a=process.argv.find(x=>x.startsWith('--'+k+'=')); return a?+a.split('=')[1]:d; };
const DELAY=arg('delay',30), JITTER=arg('jitter',20), PRESSES=arg('presses',200), REPEAT=arg('repeat',1)!==0, PORT=arg('port',3195);
const HOST='127.0.0.1', DIRECT='http://'+HOST+':'+PORT, sleep=ms=>new Promise(r=>setTimeout(r,ms)), now=()=>performance.now();
const HELD={l:false,r:false,d:false,j:0,a:0,b:0,m:0,q:0,u:0,h:0};

/* ---------- the relay: every connection goes on to the server, each chunk late by delay + jitter, in order ---------- */
const count={down:0,up:0};
function carry(from,to,dir){
  const q=[]; let timer=null, last=0;
  const pump=()=>{ timer=null; while(q.length&&q[0].due<=Date.now()){ const it=q.shift(); if(to.destroyed) continue; if(it.end) to.end(); else to.write(it.chunk); } if(q.length) timer=setTimeout(pump,Math.max(0,q[0].due-Date.now())); };
  const add=it=>{ if(!DELAY&&!JITTER&&!q.length){ if(!to.destroyed){ if(it.end) to.end(); else to.write(it.chunk); } return; }
    it.due=last=Math.max(last,Date.now()+DELAY+Math.random()*JITTER); q.push(it); if(!timer) timer=setTimeout(pump,Math.max(0,it.due-Date.now())); };
  let ended=false; const end=()=>{ if(!ended){ ended=true; add({end:true}); } };
  from.on('data',chunk=>{ count[dir]+=chunk.length; add({chunk}); }); from.on('end',end); from.on('close',end); from.on('error',()=>{});
}
const relay=net.createServer(client=>{ const up=net.connect(PORT,HOST); client.setNoDelay(true); up.setNoDelay(true); carry(client,up,'up'); carry(up,client,'down'); });

/* ---------- a device on each link, sending its buttons the way the page does ---------- */
const post=(base,agent,body)=>new Promise(done=>{ const data=JSON.stringify(body), u=new URL(base+'/duel/act');
  const req=http.request({host:u.hostname,port:u.port,path:u.pathname,method:'POST',agent,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{ res.resume(); res.on('end',()=>done(res.statusCode===200)); });
  req.on('error',()=>done(false)); req.setTimeout(700,()=>req.destroy()); req.end(data); });
// The event stream: states as JSON; one input request in the air at a time, carrying the newest buttons (sendInput in duel.html).
function sseDevice(base,room,id){
  const me={state:null,inp:Object.assign({},HELD),seq:Date.now(),onState:null}, agent=new http.Agent({keepAlive:true}); let inFly=false, inDirty=false;
  me.req=http.get(base+'/duel/events?room='+room+'&id='+id,res=>{ res.setEncoding('utf8'); let buf='';
    res.on('data',chunk=>{ buf+=chunk; for(let i;(i=buf.indexOf('\n\n'))>=0;){ const msg=buf.slice(0,i); buf=buf.slice(i+2); if(!msg.startsWith('event: state\n')) continue; me.state=JSON.parse(msg.slice(msg.indexOf('data: ')+6)); if(me.onState) me.onState(me.state); } }); });
  me.req.on('error',()=>{});
  me.send=()=>{ if(inFly){ inDirty=true; return; } inFly=true; inDirty=false;
    post(base,agent,Object.assign({room,id,type:'input',seq:++me.seq},me.inp)).then(ok=>{ inFly=false; if(!ok) setTimeout(me.send,80); else if(inDirty) me.send(); }); };
  me.close=()=>{ me.req.destroy(); agent.destroy(); }; return me;
}
// The socket: states as binary frames; every change of buttons sent at once; the state held is acknowledged as the page does.
async function wsDevice(base,room,id){
  const me={state:null,inp:Object.assign({},HELD),seq:Date.now(),onState:null}, sock=await W.connect(base.replace(/^http/,'ws')+'/duel/ws?room='+room+'&id='+id), rx=Wire.createReceiver(); let held=0, acked=0;
  sock.on('message',(data,isBinary)=>{ if(!isBinary) return; const r=rx.read(data); held=r.seq; if(!acked||held-acked>=3){ acked=held; sock.send(JSON.stringify({t:'ack',ack:held})); } me.state=r.snap; if(me.onState) me.onState(me.state); });
  me.send=()=>{ acked=held; sock.send(JSON.stringify(Object.assign({t:'input',seq:++me.seq,ack:held},me.inp))); };
  me.close=()=>sock.close(); return me;
}

/* ---------- one link's run ---------- */
async function run(link,relayBase){
  const direct=new http.Agent({keepAlive:true}), room=(await (await fetch(DIRECT+'/duel/room?bot=1&skill=0&forge=0',{method:'POST'})).json()).code, id='bench-'+link;
  const act=o=>post(DIRECT,direct,Object.assign({room,id},o));      // setting up is not what is measured: it goes straight to the server
  const me=link==='ws'?await wsDevice(relayBase,room,id):sseDevice(relayBase,room,id);
  const repeat=REPEAT?setInterval(()=>{ const s=me.state; if(s&&(s.phase==='fight'||s.phase==='count')) me.send(); },150):null;
  // Blue is free to move: in a fight, alive, not being hit, held or thrown, and nothing has frozen the match.
  const free=s=>s&&s.phase==='fight'&&!s.hs&&!s.ul&&!s.hack&&(f=>f.hp>0&&f.g&&!f.act&&!f.hurt&&!f.stun&&!f.trap&&!f.fl&&!f.dash)(s.f[0]);
  const fight=async()=>{ for(let n=0;;n++){ const s=me.state;
    if(s&&s.phase==='fight'&&s.f[0].hp>0) return;
    if(s&&s.phase==='over'){ await act({type:'rematch'}); await sleep(300); }
    else if(s&&s.phase==='draw'&&!s.ready[0]){ if(!s.items[0][0]) await act({type:'stock',slot:0,key:'sword',el:'none'}); await act({type:'ready'}); await sleep(200); }
    else await sleep(50);
    if(n>2000) throw new Error('the '+link+' room never got to a fight'); } };
  // The next state that passes test (or null after ms). Every state in between goes through each(state) first.
  const next=(test,ms,each)=>new Promise(done=>{ const to=setTimeout(()=>{ me.onState=null; done(null); },ms); me.onState=s=>{ if(each) each(s); if(test(s)){ clearTimeout(to); me.onState=null; done(s); } }; });
  const times=[]; let thrown=0, dir=1, bytes=0, ms=0;
  await fight(); await sleep(300);
  while(times.length<PRESSES){
    await fight();
    if(!free(me.state)||Math.abs(me.state.f[0].vx)>0){ await next(s=>free(s)&&s.f[0].vx===0,1500); continue; }
    await sleep(60+Math.random()*120);      // not in step with the repeat or the server's ticks
    if(!free(me.state)||me.state.f[0].vx!==0) continue;
    const x0=me.state.f[0].x, edge=x0<140?1:x0>(me.state.w||960)-140?-1:0; dir=edge||-dir;
    const c0={down:count.down,up:count.up}, t0=now(); let hit=false;
    me.inp=Object.assign({},HELD,dir>0?{r:true}:{l:true}); me.send();
    const moved=await next(s=>(s.f[0].x-x0)*dir>0.05,1000,s=>{ if(!free(s)) hit=true; });
    const took=now()-t0;
    if(moved&&!hit){ times.push(took); bytes+=count.down-c0.down; ms+=took; } else thrown++;      // the bot got in the way, or the round ended: not the network's doing
    await sleep(40+Math.random()*60);
    const c1=count.down, t1=now(); me.inp=Object.assign({},HELD); me.send();
    const still=await next(s=>s.phase!=='fight'||(s.f[0].vx===0&&free(s)),1200);
    if(still&&moved&&!hit){ bytes+=count.down-c1; ms+=now()-t1; }
    if(thrown>PRESSES*3) throw new Error('the '+link+' run threw away too many presses to be worth anything');
  }
  clearInterval(repeat); me.close(); direct.destroy();
  times.sort((a,b)=>a-b);
  return {link,presses:times.length,median:times[Math.floor(times.length/2)],p95:times[Math.min(times.length-1,Math.floor(times.length*0.95))],bps:bytes/(ms/1000),thrown};
}

(async()=>{
  let server=null; const stop=()=>{ if(server){ try{ server.kill('SIGKILL'); }catch(e){} server=null; } }; process.on('exit',stop);
  try{
    let busy=false; try{ await fetch(DIRECT+'/info'); busy=true; }catch(e){}
    if(busy) throw new Error('port '+PORT+' is already in use: stop whatever is listening there, or pass --port=');
    server=cp.spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:Object.assign({},process.env,{PORT:String(PORT),OPENAI_API_KEY:'',FORGE_CACHE:'',NOWS:''}),stdio:'ignore'});
    let up=false; for(let i=0;i<60&&!up;i++){ await sleep(100); try{ up=(await fetch(DIRECT+'/info')).ok; }catch(e){} }
    if(!up) throw new Error('the server did not start');
    await new Promise(r=>relay.listen(0,HOST,r)); const relayBase='http://'+HOST+':'+relay.address().port;
    console.log('net-bench: '+PRESSES+' presses a link; the relay adds '+DELAY+' ms'+(JITTER?' and up to '+JITTER+' ms more':'')+' each way; '+(REPEAT?'buttons are sent again every 150 ms, as the page does':'no 150 ms repeat'));
    const rows=[]; for(const link of ['sse','ws']) rows.push(await run(link,relayBase));
    const pad=(v,n)=>String(v).padStart(n);
    console.log('link   presses   median ms   95th ms   bytes/s down   thrown away');
    for(const r of rows) console.log(r.link.padEnd(5)+pad(r.presses,9)+pad(r.median.toFixed(1),12)+pad(r.p95.toFixed(1),10)+pad(Math.round(r.bps),15)+pad(r.thrown,14));
    const [sse,ws]=rows, share=ws.bps/sse.bps;
    console.log('socket median no higher than the event stream\'s: '+(ws.median<=sse.median?'yes':'NO, MISSED')+' ('+ws.median.toFixed(1)+' against '+sse.median.toFixed(1)+' ms)');
    console.log('socket bytes a second at most 40% of the event stream\'s: '+(share<=0.4?'yes':'NO, MISSED')+' ('+(share*100).toFixed(1)+'%)');
  }catch(e){ console.error('net-bench: '+(e&&e.message||e)); process.exitCode=1; }
  finally{ stop(); relay.close(); setTimeout(()=>process.exit(process.exitCode||0),50); }
})();
