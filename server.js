// Doodle Lane Battler server: serves the page, reads drawings with OpenAI, and runs online rooms.
// Run:  put your key in the .env file next to this script, then:  node server.js   (Node 18+, no dependencies)
// Settings (.env or environment): OPENAI_API_KEY, OPENAI_MODEL (default gpt-4.1-mini), PORT (default 3000), OPENAI_BASE_URL.
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');

// Load KEY=value lines from a .env file next to this script (real environment variables win).
try{ for(const line of fs.readFileSync(path.join(__dirname,'.env'),'utf8').split(/\r?\n/)){
  const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i); if(!m||line.trim().startsWith('#')) continue;
  const v=m[2].replace(/^(['"])(.*)\1$/,'$2'); if(v&&process.env[m[1]]===undefined) process.env[m[1]]=v; } }catch(e){}
const KEY=process.env.OPENAI_API_KEY, MODEL=process.env.OPENAI_MODEL||'gpt-4.1-mini';
const BASE=(process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,''), PORT=+process.env.PORT||3000;
const PROMPT="You are the referee of a drawing game. The attached image is a quick doodle a player drew to summon a unit.\nDecide what it is and classify it. Reply with JSON only, no other text:\n{\"name\":\"2-3 word name of what was drawn\",\"movement\":\"ground|flying|stationary\",\"attack\":\"melee|ranged|area|none\",\"element\":\"fire|water|plant|none\"}\nRules: movement is \"flying\" for anything with wings or that floats in air, \"stationary\" for buildings, walls, towers, traps and plants rooted in place, otherwise \"ground\".\nattack is \"ranged\" if it shoots or throws (bow, gun, wand, cannon), \"area\" if it explodes or splashes (bomb, wave, breath), \"none\" if it only blocks (wall, shield, rock), otherwise \"melee\".\nelement is \"fire\" for flames, heat or lava, \"water\" for water or ice, \"plant\" for leaves, wood or vines, otherwise \"none\". Ink colour is a hint (red fire, blue water, green plant) but the content of the drawing decides.\nAlways pick the closest fit, even for a scribble.";

// The match rules live in index.html between the SIM markers; the server runs that same code.
const pageSrc=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const G=new Function(pageSrc.split('/*SIM-START*/')[1].split('/*SIM-END*/')[0]+
  ';return {createSim,validSpec,localGuess,nameFor,strokeLen,INK_PER_PX,MIN_COST};')();

function lanUrl(){
  for(const list of Object.values(os.networkInterfaces())) for(const a of list||[])
    if(a.family==='IPv4'&&!a.internal) return 'http://'+a.address+':'+PORT;
  return null;
}

/* ---------- reading a drawing ---------- */
async function askOpenAI(png){
  const r=await fetch(BASE+'/chat/completions',{method:'POST',signal:AbortSignal.timeout(8000),
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},
    body:JSON.stringify({model:MODEL,response_format:{type:'json_object'},max_tokens:80,
      messages:[{role:'user',content:[{type:'text',text:PROMPT},
        {type:'image_url',image_url:{url:'data:image/png;base64,'+png.toString('base64'),detail:'low'}}]}]})});
  const body=await r.json();
  if(!r.ok) throw new Error((body.error&&body.error.message)||('OpenAI HTTP '+r.status));
  const spec=G.validSpec(JSON.parse(body.choices[0].message.content));
  if(!spec) throw new Error('reply did not match the unit schema');
  if(!spec.name) spec.name=G.nameFor(spec);
  return spec;
}
const isPng=b=>b.length>8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47;
// Returns {spec, source}. Falls back to the shape-and-colour guess when there is no key or the call fails.
async function readDrawing(png,strokes){
  if(KEY&&png&&isPng(png)){
    const t=Date.now();
    try{ const spec=await askOpenAI(png); console.log('read',Date.now()-t+'ms',JSON.stringify(spec)); return {spec,source:'OpenAI'}; }
    catch(e){ console.error('OpenAI read failed after',Date.now()-t+'ms:',e.message); }
  }
  return strokes?{spec:G.localGuess(strokes),source:'local guess'}:null;
}

/* ---------- rooms ---------- */
const rooms=new Map(), LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ';
function newRoom(){
  let code; do{ code=Array.from({length:4},()=>LETTERS[Math.floor(Math.random()*LETTERS.length)]).join(''); }while(rooms.has(code));
  const now=Date.now();
  const room={code,sim:G.createSim(),players:new Map(),clients:new Set(),key:0,last:now,sent:0,seen:now,dirty:true};
  rooms.set(code,room); return room;
}
const sse=(res,event,data)=>res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');
const broadcast=(room,event,data)=>{ for(const c of room.clients) sse(c.res,event,data); };
function present(room){ const p=[false,false]; for(const c of room.clients) if(c.side>=0) p[c.side]=true; return p; }
function snapshot(room){
  const S=room.sim;
  return {t:+S.t.toFixed(2),started:S.started,over:S.over,winner:S.winner,tiebreak:!!S.tiebreak,
    hp:S.bases.map(b=>Math.round(b.hp)),ink:S.ink.map(v=>+v.toFixed(1)),
    units:S.units.map(u=>({id:u.id,side:u.side,x:+u.x.toFixed(1),hp:Math.round(u.hp),maxHp:u.maxHp,size:u.size,move:u.move,atk:u.atk,el:u.el,
      name:u.name,age:+(S.t-u.born).toFixed(2),flash:u.flash>0})),
    fx:S.fx.map(f=>({kind:f.kind,x0:Math.round(f.x0),x1:Math.round(f.x1),fly0:f.fly0,fly1:f.fly1,el:f.el,ttl:+f.ttl.toFixed(2)})),
    events:S.events.splice(0)};
}
setInterval(()=>{
  const now=Date.now();
  for(const room of rooms.values()){
    const S=room.sim, dt=Math.min(0.1,(now-room.last)/1000); room.last=now;
    if(S.started&&!S.over){ S.step(dt); room.dirty=true; }
    if(room.dirty&&now-room.sent>=95){ broadcast(room,'state',snapshot(room)); room.sent=now; room.dirty=S.started&&!S.over; }
    if(room.clients.size) room.seen=now; else if(now-room.seen>10*60e3) rooms.delete(room.code);
  }
},50);
setInterval(()=>{ for(const room of rooms.values()) for(const c of room.clients) c.res.write(': ping\n\n'); },15000);

function cleanStrokes(a){
  if(!Array.isArray(a)||!a.length||a.length>80) return null;
  let n=0; const out=[];
  for(const s of a){
    if(!s||!['none','fire','water','plant'].includes(s.el)||!Array.isArray(s.pts)||!s.pts.length) return null;
    const pts=[];
    for(const p of s.pts){
      if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||++n>6000) return null;
      pts.push([Math.max(0,Math.min(640,p[0])),Math.max(0,Math.min(420,p[1]))]);
    }
    out.push({el:s.el,pts});
  }
  return out;
}
async function playerSend(room,side,body){
  const S=room.sim, strokes=cleanStrokes(body.strokes);
  if(!strokes) return [400,'That drawing could not be read.'];
  if(S.over) return [409,'The match is over.'];
  const both=present(room).every(Boolean);
  if(!S.started&&!both) return [409,'Wait for the other player to join.'];
  const cost=Math.max(G.MIN_COST,G.strokeLen(strokes)*G.INK_PER_PX);
  if(cost>S.ink[side]+1) return [409,'Not enough ink for that drawing.'];
  S.ink[side]=Math.max(0,S.ink[side]-cost); S.started=true; room.dirty=true;
  const key=++room.key;
  broadcast(room,'pending',{key,side,strokes});
  const png=typeof body.png==='string'&&body.png.length<600000?Buffer.from(body.png,'base64'):null;
  readDrawing(png,strokes).then(({spec,source})=>{
    if(room.sim!==S||S.over){ broadcast(room,'cancel',{key}); return; }
    const u=S.spawn(side,spec,cost,null,source); u.strokes=strokes; room.dirty=true;
    broadcast(room,'spawn',{key,id:u.id,side,strokes,name:u.name,spec,source,cost:Math.round(cost),maxHp:u.maxHp});
  }).catch(e=>{ console.error('spawn failed:',e.message); broadcast(room,'cancel',{key}); });
  return [200,null];
}

/* ---------- http ---------- */
function readBody(req,limit){
  return new Promise((resolve,reject)=>{
    const chunks=[]; let size=0;
    req.on('data',c=>{ size+=c.length; if(size>limit){ reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end',()=>resolve(Buffer.concat(chunks))); req.on('error',reject);
  });
}
const duel=require('./duel-server.js')({readBody,KEY,MODEL,BASE});
const FILES={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/qrcode.js':['qrcode.js','text/javascript; charset=utf-8']};
http.createServer(async (req,res)=>{
  const send=(code,obj)=>{ res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); };
  const url=new URL(req.url,'http://x');
  try{
    if(await duel(req,res,url)) return;
    if(req.method==='GET'&&FILES[url.pathname]){
      const [file,type]=FILES[url.pathname];
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'}); return fs.createReadStream(path.join(__dirname,file)).pipe(res);
    }
    if(req.method==='GET'&&url.pathname==='/info') return send(200,{reader:KEY?'OpenAI':'local guess (no key on the server)',lanUrl:lanUrl(),brains:duel.brains()});

    // Single-device modes: classify one drawing.
    if(req.method==='POST'&&url.pathname==='/read'){
      if(!KEY) return send(500,{error:'OPENAI_API_KEY is not set on the server'});
      const out=await readDrawing(await readBody(req,2e6),null);
      return out?send(200,Object.assign({source:out.source},out.spec)):send(502,{error:'OpenAI could not read the drawing'});
    }

    if(req.method==='POST'&&url.pathname==='/room'){
      if(rooms.size>=500) return send(503,{error:'Too many rooms are open right now.'});
      return send(200,{code:newRoom().code});
    }
    if(req.method==='GET'&&url.pathname==='/events'){
      const room=rooms.get(String(url.searchParams.get('room')||'').toUpperCase()), id=String(url.searchParams.get('id')||'').slice(0,40);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      if(!room||!id){ sse(res,'gone',{}); return res.end(); }
      let side=room.players.get(id);
      if(side===undefined){
        const taken=[...room.players.values()];
        side=!taken.includes(0)?0:(!taken.includes(1)?1:-1);
        if(side>=0) room.players.set(id,side);
      }
      const client={res,id,side}; room.clients.add(client); room.seen=Date.now();
      sse(res,'hello',{side,code:room.code});
      for(const u of room.sim.units) if(u.strokes) sse(res,'spawn',{key:0,id:u.id,side:u.side,strokes:u.strokes,name:u.name,spec:{},source:u.source,cost:0,maxHp:u.maxHp});
      broadcast(room,'players',{present:present(room)});
      sse(res,'state',snapshot(room));
      req.on('close',()=>{ room.clients.delete(client); broadcast(room,'players',{present:present(room)}); });
      return;
    }
    if(req.method==='POST'&&url.pathname==='/act'){
      let body; try{ body=JSON.parse((await readBody(req,1.5e6)).toString('utf8')); }catch(e){ return send(400,{error:'Bad request.'}); }
      const room=rooms.get(String(body.room||'').toUpperCase());
      if(!room) return send(404,{error:'That room has closed.'});
      const side=room.players.get(String(body.id||''));
      if(side===undefined||side<0) return send(403,{error:'You are not a player in this room.'});
      const S=room.sim;
      if(body.type==='start'){
        if(!present(room).every(Boolean)) return send(409,{error:'Wait for the other player to join.'});
        if(!S.over) S.started=true; room.dirty=true; return send(200,{});
      }
      if(body.type==='reset'){ room.sim=G.createSim(); room.dirty=true; broadcast(room,'reset',{}); return send(200,{}); }
      if(body.type==='send'){ const [code,error]=await playerSend(room,side,body); return send(code,error?{error}:{}); }
      return send(400,{error:'Unknown action.'});
    }
    send(404,{error:'not found'});
  }catch(e){ console.error(req.method,url.pathname,'failed:',e.message); if(!res.headersSent) send(500,{error:'Server error.'}); else res.end(); }
}).listen(PORT,()=>{
  console.log('Doodle Lane Battler on http://localhost:'+PORT);
  const lan=lanUrl(); if(lan) console.log('Other devices on the same Wi-Fi: '+lan);
  console.log('Drawings read by: '+(KEY?'OpenAI '+MODEL:'local guess (no OPENAI_API_KEY in .env)'));
});
