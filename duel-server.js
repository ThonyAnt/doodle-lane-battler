// Doodle Duel server routes: serves duel.html, reads drawn items with OpenAI, and runs online duel rooms.
// Loaded by server.js. The match rules come from the marked block in duel.html, so there is one copy of them.
const fs=require('fs'), path=require('path');

const PROMPT="You are the referee of a stick-figure fighting game. The attached image is a quick doodle a player drew as their fighter's weapon or ability. It can be anything at all: a real weapon, a tool, an animal, food, furniture, a vehicle, a made-up thing. Work out what it is, then decide how a fighter would use THAT object in a fight.\nReply with JSON only, no other text:\n{\"name\":\"2-3 word name of what was drawn\",\"kind\":\"melee|ranged|bomb|shield|dash|heal\",\"style\":\"blade|spear|hammer|fist|bow|gun|staff|hurl\",\"element\":\"fire|water|plant|none\",\"power\":1-10,\"range\":1-10,\"speed\":1-10,\"traits\":[\"first choice\",\"second choice\"]}\nkind: \"melee\" for anything swung, stabbed or punched with (sword, axe, club, whip, chainsaw, fish, frying pan, guitar). \"ranged\" for anything that shoots, or that you would throw (gun, bow, wand, laser, shuriken, banana, ball, bird). \"bomb\" for anything that explodes or splashes over an area (bomb, grenade, flask, meteor, firework). \"shield\" for anything that blocks or protects (shield, wall, armour, helmet, umbrella, door). \"dash\" for anything that makes you fast or lets you fly (wings, rocket, boots, skateboard, car, horse, lightning bolt). \"heal\" for anything that restores health (heart, food, drink, bandage, medkit).\nstyle is how it is fought with. For melee: \"blade\" for anything with an edge (sword, knife, axe, saw, scissors); \"spear\" for long thin things that thrust or lash (spear, lance, trident, pole, whip, chain, fishing rod); \"hammer\" for heavy blunt things (hammer, mace, club, bat, frying pan, guitar, chair, big fish); \"fist\" for things worn on hands or feet (gloves, claws, boots, paws). For ranged: \"bow\" for bows, crossbows and slingshots; \"gun\" for anything with a trigger or barrel (gun, cannon, laser, hose); \"staff\" for magic (staff, wand, orb, spell book, crystal); \"hurl\" for anything thrown by hand (shuriken, knife, boomerang, rock, card, banana, ball, pie). For other kinds use \"\".\nelement is \"fire\" for flames, heat or lava, \"water\" for water or ice, \"plant\" for leaves, wood or vines, otherwise \"none\". Ink colour is a hint (red fire, blue water, green plant) but the content of the drawing decides.\npower, range and speed describe the object itself, not how well it is drawn: power is how hard one hit lands (a sledgehammer 9, a feather 1), range is how far it reaches or flies (a sniper rifle 10, a spear 7, a knife 2), speed is how quickly it can be used again (a dagger 9, a cannon 2). Make them differ: a real object is never 5, 5, 5. The game rescales them to a fixed total, so only the proportions matter.\ntraits: the two that best suit the object, best first, chosen from: pierce (gets through shields: drills, needles, lasers), heavy (huge knockback: hammers, cannons, trucks), flurry (hits twice: chainsaws, claws, twin blades, machine guns), pull (drags the enemy in: hooks, whips, magnets, lassos, vacuums), blast (bursts on hit: rockets, fireworks, magic), launch (pops the enemy upward: springs, uppercuts, geysers, shovels), lucky (sometimes double damage: dice, cards, anything silly), guard (melee only, protects while swinging: big or armoured weapons), boomerang (ranged only, comes back: boomerangs, yo-yos, bananas, frisbees), bounce (ranged and bomb only, bounces: balls, rubber things, eggs), homing (ranged only, seeks the enemy: birds, bees, missiles, magic), swift (makes you run faster: light or sporty things), thorns (shield only, hurts attackers: spikes, cactus), bubble (shield only, covers all sides: domes, bubbles, shells), cleanse (heal only, cures burning and slowing: medicine, water), feast (heal only, an extra helping: big meals).\nAlways pick the closest fit, even for a scribble. Never refuse and never leave a field out.";

module.exports=function({readBody,KEY,MODEL,BASE}){
  const page=path.join(__dirname,'duel.html'), src=fs.readFileSync(page,'utf8');
  const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+
    ';return {createDuel,validItem,localGuess,nameFor,inkCost,stockItem,INK_MAX,PAD_W,PAD_H};')();

  /* ---------- reading a drawing ---------- */
  async function askOpenAI(png,strokes){
    const r=await fetch(BASE+'/chat/completions',{method:'POST',signal:AbortSignal.timeout(8000),
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},
      body:JSON.stringify({model:MODEL,response_format:{type:'json_object'},max_tokens:170,
        messages:[{role:'user',content:[{type:'text',text:PROMPT},
          {type:'image_url',image_url:{url:'data:image/png;base64,'+png.toString('base64'),detail:'low'}}]}]})});
    const body=await r.json();
    if(!r.ok) throw new Error((body.error&&body.error.message)||('OpenAI HTTP '+r.status));
    // validItem sorts out an answer that does not fit the kinds or styles, using the drawing's shape if it has to.
    let reply=null; try{ reply=JSON.parse(body.choices[0].message.content); }catch(e){}
    const spec=D.validItem(reply&&typeof reply==='object'?reply:{},strokes);
    if(!spec) throw new Error('reply could not be read');
    if(!spec.name) spec.name=D.nameFor(spec);
    return spec;
  }
  const isPng=b=>b&&b.length>8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47;
  async function readDrawing(png,strokes){
    if(KEY&&isPng(png)){
      const t=Date.now();
      try{ const spec=await askOpenAI(png,strokes); console.log('duel read',Date.now()-t+'ms',JSON.stringify(spec)); return {spec,source:'OpenAI'}; }
      catch(e){ console.error('duel: OpenAI read failed after',Date.now()-t+'ms:',e.message); }
    }
    return strokes?{spec:D.localGuess(strokes),source:'local guess'}:null;
  }

  /* ---------- rooms ---------- */
  const rooms=new Map(), LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ';
  function newRoom(){
    let code; do{ code=Array.from({length:4},()=>LETTERS[Math.floor(Math.random()*LETTERS.length)]).join(''); }while(rooms.has(code));
    const now=Date.now(), room={code,sim:D.createDuel(),art:[[null,null],[null,null]],players:new Map(),watchers:new Set(),clients:new Set(),last:now,sent:0,seen:now,dirty:true};
    rooms.set(code,room); return room;
  }
  const sse=(res,event,data)=>res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');
  const broadcast=(room,event,data)=>{ for(const c of room.clients) sse(c.res,event,data); };
  function present(room){ const p=[false,false]; for(const c of room.clients) if(c.side>=0) p[c.side]=true; return p; }
  // Who is here: the two seats, and whether a big screen is showing the match (players' devices then act as sketchbook and controller only).
  const roster=room=>({present:present(room),screen:[...room.clients].some(c=>c.watch)});
  // 30 ticks a second. The match only advances while both players are connected.
  setInterval(()=>{
    const now=Date.now();
    for(const room of rooms.values()){
      const dt=Math.min(0.1,(now-room.last)/1000), both=present(room).every(Boolean), S=room.sim; room.last=now;
      if(both) S.step(dt);
      const live=both&&(S.phase==='count'||S.phase==='fight'||S.phase==='end');
      if(room.clients.size&&(live||room.dirty||now-room.sent>=250)){ broadcast(room,'state',S.snapshot()); room.sent=now; room.dirty=false; }
      if(room.clients.size) room.seen=now; else if(now-room.seen>10*60e3) rooms.delete(room.code);
    }
  },33);
  setInterval(()=>{ for(const room of rooms.values()) for(const c of room.clients) c.res.write(': ping\n\n'); },15000);

  function cleanStrokes(a){
    if(!Array.isArray(a)||!a.length||a.length>80) return null;
    let n=0; const out=[];
    for(const s of a){
      if(!s||!['none','fire','water','plant'].includes(s.el)||!Array.isArray(s.pts)||!s.pts.length) return null;
      const pts=[];
      for(const p of s.pts){
        if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||++n>6000) return null;
        pts.push([Math.max(0,Math.min(D.PAD_W,Math.round(p[0]))),Math.max(0,Math.min(D.PAD_H,Math.round(p[1])))]);
      }
      out.push({el:s.el,pts});
    }
    return out;
  }
  async function makeItem(room,side,body){
    const S=room.sim, slot=body.slot===1?1:0, strokes=cleanStrokes(body.strokes);
    if(!strokes) return [400,{error:'That drawing could not be read.'}];
    if(S.phase!=='draw') return [409,{error:'Too late: the round has started.'}];
    const png=typeof body.png==='string'&&body.png.length<600000?Buffer.from(body.png,'base64'):null;
    const {spec,source}=await readDrawing(png,strokes);
    if(room.sim!==S) return [409,{error:'The match was restarted.'}];
    const it=S.setItem(side,slot,spec,D.inkCost(strokes));
    if(!it) return [409,{error:'Too late: the round has started.'}];
    room.art[side][slot]={strokes,ver:it.ver,kind:it.kind,style:it.style}; room.dirty=true;
    broadcast(room,'item',{side,slot,strokes,ver:it.ver,kind:it.kind,style:it.style});
    return [200,{name:it.name,kind:it.kind,style:it.style,element:it.el,source}];
  }

  /* ---------- http ---------- */
  return async function handle(req,res,url){
    const p=url.pathname;
    // Animation clip files and the preview lab are plain static files.
    if(req.method==='GET'&&(/^\/anim\/[a-z_]+\.js$/.test(p)||p==='/anim-lab.html')){
      const file=path.join(__dirname,p.slice(1));
      if(!fs.existsSync(file)){ res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache'}); res.end('/* '+p+' is not written yet */'); return true; }
      res.writeHead(200,{'Content-Type':(p.endsWith('.html')?'text/html':'text/javascript')+'; charset=utf-8','Cache-Control':'no-cache'}); fs.createReadStream(file).pipe(res); return true;
    }
    if(p!=='/duel'&&p!=='/duel.html'&&!p.startsWith('/duel/')) return false;
    const send=(code,obj)=>{ res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); };
    if(req.method==='GET'&&(p==='/duel'||p==='/duel.html')){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}); fs.createReadStream(page).pipe(res); return true;
    }
    // Single-device modes: classify one drawing.
    if(req.method==='POST'&&p==='/duel/read'){
      if(!KEY){ send(500,{error:'OPENAI_API_KEY is not set on the server'}); return true; }
      const out=await readDrawing(await readBody(req,2e6),null);
      out?send(200,Object.assign({source:out.source},out.spec)):send(502,{error:'OpenAI could not read the drawing'}); return true;
    }
    if(req.method==='POST'&&p==='/duel/room'){
      if(rooms.size>=500) send(503,{error:'Too many rooms are open right now.'}); else send(200,{code:newRoom().code});
      return true;
    }
    if(req.method==='GET'&&p==='/duel/events'){
      const room=rooms.get(String(url.searchParams.get('room')||'').toUpperCase()), id=String(url.searchParams.get('id')||'').slice(0,40);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      if(!room||!id){ sse(res,'gone',{}); res.end(); return true; }
      // A big screen (watch=1) shows the match without taking a player's seat; it may ask for a rematch.
      const watch=url.searchParams.get('watch')==='1';
      let side=watch?-1:room.players.get(id);
      if(watch) room.watchers.add(id);
      else if(side===undefined){
        const taken=[...room.players.values()];
        side=!taken.includes(0)?0:(!taken.includes(1)?1:-1);
        if(side>=0) room.players.set(id,side);
      }
      const client={res,id,side,seq:-1,watch}; room.clients.add(client); room.seen=Date.now();
      sse(res,'hello',{side,code:room.code,watch});
      room.art.forEach((a,s)=>a.forEach((x,slot)=>{ if(x) sse(res,'item',{side:s,slot,strokes:x.strokes,ver:x.ver,kind:x.kind,style:x.style}); }));
      broadcast(room,'players',roster(room));
      sse(res,'state',room.sim.snapshot());
      req.on('close',()=>{
        room.clients.delete(client); broadcast(room,'players',roster(room));
        if(side>=0&&!present(room)[side]) room.sim.setInput(side,Object.assign({},room.sim.cnt[side],{l:0,r:0,d:0}));
      });
      return true;
    }
    if(req.method==='POST'&&p==='/duel/act'){
      let body; try{ body=JSON.parse((await readBody(req,1.5e6)).toString('utf8')); }catch(e){ send(400,{error:'Bad request.'}); return true; }
      const room=rooms.get(String(body.room||'').toUpperCase());
      if(!room){ send(404,{error:'That room has closed.'}); return true; }
      const id=String(body.id||''), side=room.players.get(id);
      if((side===undefined||side<0)&&!(body.type==='rematch'&&room.watchers.has(id))){ send(403,{error:'You are not a player in this room.'}); return true; }
      const S=room.sim;
      if(body.type==='input'){
        // Requests can arrive out of order, so only the newest one counts.
        const seq=+body.seq||0; let c=null; for(const x of room.clients) if(x.id===id) c=x;
        if(c&&seq>c.seq){ c.seq=seq; S.setInput(side,{l:!!body.l,r:!!body.r,d:!!body.d,j:+body.j||0,a:+body.a||0,b:+body.b||0}); }
        send(200,{}); return true;
      }
      if(body.type==='item'){ const [code,out]=await makeItem(room,side,body); send(code,out); return true; }
      if(body.type==='stock'){
        // A ready-made item: no drawing to read, so it is added at once.
        const slot=body.slot===1?1:0, made=D.stockItem(String(body.key||''),String(body.el||'none'));
        if(!made){ send(400,{error:'Unknown item.'}); return true; }
        if(S.phase!=='draw'){ send(409,{error:'Too late: the round has started.'}); return true; }
        const other=S.items[side][1-slot], it=S.setItem(side,slot,made.spec,Math.min(45,D.INK_MAX-(other?other.cost:0)));
        if(!it){ send(409,{error:'Not enough ink left for that.'}); return true; }
        room.art[side][slot]={strokes:made.strokes,ver:it.ver,kind:it.kind,style:it.style}; room.dirty=true;
        broadcast(room,'item',{side,slot,strokes:made.strokes,ver:it.ver,kind:it.kind,style:it.style});
        send(200,{name:it.name,kind:it.kind,style:it.style,element:it.el}); return true;
      }
      if(body.type==='tweak'){
        // Change an item already made: what it is, which of its two traits it uses, or its power-for-speed tuning.
        const slot=body.slot===1?1:0, ch={}, a=room.art[side][slot];
        if(typeof body.kind==='string'){ ch.kind=body.kind; ch.style=String(body.style||''); }
        if(typeof body.trait==='string') ch.trait=body.trait;
        if(Number.isFinite(body.tune)) ch.tune=body.tune;
        const it=a&&S.tweak(side,slot,ch);
        if(!it){ send(409,{error:'That cannot be changed now.'}); return true; }
        Object.assign(a,{ver:it.ver,kind:it.kind,style:it.style}); room.dirty=true;
        broadcast(room,'item',{side,slot,strokes:a.strokes,ver:it.ver,kind:it.kind,style:it.style});
        send(200,{}); return true;
      }
      if(body.type==='ready'){ S.setReady(side); room.dirty=true; send(200,{}); return true; }
      if(body.type==='rematch'){
        room.sim=D.createDuel(); room.art=[[null,null],[null,null]]; room.dirty=true; broadcast(room,'reset',{}); send(200,{}); return true;
      }
      send(400,{error:'Unknown action.'}); return true;
    }
    send(404,{error:'not found'}); return true;
  };
};
