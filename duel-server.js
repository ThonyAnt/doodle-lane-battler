// Doodle Duel server routes: serves duel.html, reads drawn items with OpenAI, and runs online duel rooms.
// Loaded by server.js. The match rules come from the marked block in duel.html, so there is one copy of them.
const fs=require('fs'), path=require('path'), WS=require('./ws.js'), Wire=require('./wire.js');

const PROMPT="You are the referee of a stick-figure fighting game. The attached image is a quick doodle a player drew as their fighter's weapon or ability. It can be anything at all: a real weapon, a tool, an animal, food, furniture, a vehicle, a made-up thing. Work out what it is, then decide how a fighter would use THAT object in a fight.\nLook before you name. Players draw fast and badly, and they are drawing something to FIGHT with, so when a shape could be two things prefer the one that makes sense as a weapon, tool or power-up. The small parts decide: a trigger and a barrel is a gun, a string across a curve is a bow, a guard above a grip is a sword, a head on a stick is a hammer or axe, a strap or handle behind a plate is a shield, a fuse is a bomb. Do not call something a hammer or a club just because it is a blob on a line.\nReply with JSON only, no other text, with the fields in this order:\n{\"sees\":\"the lines and shapes on the page, literally, in under 12 words\",\"name\":\"2-3 word name of what was drawn\",\"kind\":\"melee|ranged|bomb|shield|dash|heal\",\"style\":\"blade|spear|hammer|fist|dual|bow|gun|staff|hurl|akimbo\",\"element\":\"fire|water|plant|none\",\"power\":1-10,\"range\":1-10,\"speed\":1-10,\"traits\":[\"first choice\",\"second choice\"],\"ammo\":\"bullet|paint|ball|blob|beam|dart\",\"others\":[{\"name\":\"the next most likely thing it is\",\"kind\":\"...\",\"style\":\"...\"},{\"name\":\"a third, different reading\",\"kind\":\"...\",\"style\":\"...\"}]}\nkind: \"melee\" for anything swung, stabbed or punched with (sword, axe, club, whip, chainsaw, fish, frying pan, guitar). \"ranged\" for anything that shoots, or that you would throw (gun, bow, wand, laser, shuriken, banana, ball, bird). \"bomb\" for anything that explodes or splashes over an area (bomb, grenade, flask, meteor, firework). \"shield\" for anything that blocks or protects (shield, wall, armour, helmet, umbrella, door, tree, rock, fence, box, barrel, or anything big you could hide behind). \"dash\" for anything that makes you fast or lets you fly (wings, rocket, boots, skateboard, car, horse, lightning bolt). \"heal\" for anything that restores health (heart, food, drink, bandage, medkit).\nstyle is how it is fought with. For melee: \"blade\" for anything with an edge (sword, knife, axe, saw, scissors); \"spear\" for long thin things that thrust or lash (spear, lance, trident, pole, whip, chain, fishing rod); \"hammer\" for heavy blunt things (hammer, mace, club, bat, frying pan, guitar, chair, big fish); \"fist\" for things worn on hands or feet (gloves, claws, boots, paws); \"dual\" when the drawing shows TWO separate similar one-handed weapons, one for each hand (twin swords, a pair of daggers, two axes, sai, sickles). For ranged: \"bow\" for bows, crossbows and slingshots; \"gun\" for anything with a trigger or barrel (gun, cannon, laser, hose); \"staff\" for magic (staff, wand, orb, spell book, crystal); \"hurl\" for anything thrown by hand (shuriken, knife, boomerang, rock, card, banana, ball, pie); \"akimbo\" when the drawing shows TWO separate similar one-handed guns (two pistols, twin revolvers, a pair of blasters). Count the objects: one weapon is never \"dual\" or \"akimbo\", however many parts or blades it has, and two crossed or side-by-side copies of the same weapon always are. For other kinds use \"\".\nelement is \"fire\" for flames, heat or lava, \"water\" for water or ice, \"plant\" for leaves, wood or vines, otherwise \"none\". Ink colour is a hint (red fire, blue water, green plant) but the content of the drawing decides.\npower, range and speed describe the object itself, not how well it is drawn: power is how hard one hit lands (a sledgehammer 9, a feather 1), range is how far it reaches or flies (a sniper rifle 10, a spear 7, a knife 2), speed is how quickly it can be used again (a dagger 9, a cannon 2). Make them differ: a real object is never 5, 5, 5. The game rescales them to a fixed total, so only the proportions matter.\ntraits: the two that best suit the object, best first, chosen from: pierce (gets through shields: drills, needles, lasers), heavy (huge knockback: hammers, cannons, trucks), flurry (hits twice: chainsaws, claws, twin blades, machine guns), pull (drags the enemy in: hooks, whips, magnets, lassos, vacuums), blast (bursts on hit: rockets, fireworks, magic), launch (pops the enemy upward: springs, uppercuts, geysers, shovels), lucky (sometimes double damage: dice, cards, anything silly), guard (melee only, protects while swinging: big or armoured weapons), boomerang (ranged only, comes back: boomerangs, yo-yos, bananas, frisbees), bounce (ranged and bomb only, bounces: balls, rubber things, eggs), homing (ranged only, seeks the enemy: birds, bees, missiles, magic), swift (makes you run faster: light or sporty things), thorns (shield only, hurts attackers: spikes, cactus), bubble (shield only, covers all sides: domes, bubbles, shells), cleanse (heal only, cures burning and slowing: medicine, water), feast (heal only, an extra helping: big meals).\nammo is only for ranged things, and is what visibly flies out of THIS object: \"paint\" for paintballs and anything that shoots colour, \"ball\" for pellets, cannonballs, peas or snowballs, \"blob\" for water, slime or anything liquid, \"beam\" for lasers and rays, \"dart\" for darts, needles or nails, \"bullet\" for ordinary guns. For other kinds use \"\".\nothers: two other things the drawing could be, each a different object from name and from each other, with its own kind and style. The player is shown them as one-tap corrections.\nAlways pick the closest fit, even for a scribble. Never refuse and never leave a field out.";

// Newer OpenAI models (gpt-5 and later, and the o-series) take max_completion_tokens instead of max_tokens, and think
// before answering unless told not to: the gpt-6 family accepts reasoning_effort 'none', which keeps the answer quick.
const tokenCap=(model,n,effort)=>/^(gpt-[5-9]|o\d)/.test(model)?Object.assign({max_completion_tokens:n},/^gpt-6/.test(model)?{reasoning_effort:effort||'none'}:null):{max_tokens:n};
module.exports=function({readBody,KEY,MODEL,BASE}){
  // How closely the reader looks at a drawing: "high" sees thin lines better and costs a little more time; "low" is quicker.
  const DETAIL=['low','high','auto'].includes(process.env.OPENAI_DETAIL)?process.env.OPENAI_DETAIL:'high';
  const page=path.join(__dirname,'duel.html'), src=fs.readFileSync(page,'utf8'), block=src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0];
  const D=new Function(block+';return {createDuel,replayDuel,fnv1a,validItem,localGuess,nameFor,inkCost,stockItem,makeBot,botLoadout,makeNetBot,botFeatures,netForward,NET_SHAPE,INK_MAX,PAD_W,PAD_H,MOVES,KINDS,ELS,FORGE_API,FORGE_LIMITS};')();
  // A stamp of the rules this server is running: a replay only plays back right under the very same rules, and the page
  // works out the same stamp from its own copy to check (rulesOf in duel.html).
  const RULES=D.fnv1a(block.replace(/\r\n/g,'\n'));

  /* ---------- the trained CPU ---------- */
  // Its weights, if this checkout has any: bot-weights.json next to this script (or the file BOT_WEIGHTS names), made by
  // bot/train.js and bot/eval.js --save. Weights only suit the rules they were trained in, so they carry a short hash of
  // the rules block; when duel.html has changed since, say so (it is still offered: retrain to be sure of it).
  // (NET_RULES is the stamp bot/eval.js --save writes into a weights file; RULES above is the replay stamp.)
  const NET_RULES=require('crypto').createHash('sha256').update(src.replace(/\r\n/g,'\n').split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]).digest('hex').slice(0,16);
  const NET=(()=>{
    const file=process.env.BOT_WEIGHTS||path.join(__dirname,'bot-weights.json'), size=D.NET_SHAPE.reduce((n,k,i,a)=>i?n+a[i-1]*k+k:0,0);
    if(!fs.existsSync(file)) return null;
    try{
      const o=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!o||!Array.isArray(o.theta)||o.theta.length!==size||!o.theta.every(Number.isFinite)) throw new Error('it needs "theta": a list of '+size+' numbers');
      console.log('duel: trained CPU loaded from '+path.basename(file)+(o.gen?', generation '+o.gen:'')+(typeof o.vsClassic==='number'?', beat the classic bot in '+Math.round(o.vsClassic*100)+'% of rounds':''));
      if(o.rules!==NET_RULES) console.warn('duel: '+path.basename(file)+' was trained under different rules ('+o.rules+'; this duel.html is '+NET_RULES+'). The trained CPU may play badly until it is trained again.');
      return {theta:Float32Array.from(o.theta)};
    }catch(e){ console.error('duel: '+path.basename(file)+' could not be used ('+e.message+'). Only the classic CPU is offered.'); return null; }
  })();
  // Red's player in a bot room: the network if the room asked for it and there are weights, else the hand-written bot.
  const makeCpu=room=>room.brain==='net'&&NET?D.makeNetBot(1,NET.theta,()=>room.skill):D.makeBot(1,()=>room.skill);

  /* ---------- reading a drawing ---------- */
  // How hard the reader thinks before it answers (models that can): on gpt-6-luna 'low' read 12 of 14 test drawings right against 8 of 11 for 'none', but took 5 s a drawing against 2 s, so it is off unless asked for.
  const READ_EFFORT=['none','low','medium'].includes(process.env.OPENAI_READ_EFFORT)?process.env.OPENAI_READ_EFFORT:'none';
  async function askOpenAI(png,strokes){
    const r=await fetch(BASE+'/chat/completions',{method:'POST',signal:AbortSignal.timeout(8000),
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},
      body:JSON.stringify({model:MODEL,response_format:{type:'json_object'},...tokenCap(MODEL,460,READ_EFFORT),
        messages:[{role:'user',content:[{type:'text',text:PROMPT},
          {type:'image_url',image_url:{url:'data:image/png;base64,'+png.toString('base64'),detail:DETAIL}}]}]})});
    const body=await r.json();
    if(!r.ok) throw new Error((body.error&&body.error.message)||('OpenAI HTTP '+r.status));
    // validItem sorts out an answer that does not fit the kinds or styles, using the drawing's shape if it has to.
    let reply=null; try{ reply=JSON.parse(body.choices[0].message.content); }catch(e){}
    const spec=D.validItem(reply&&typeof reply==='object'?reply:{},strokes);
    if(!spec) throw new Error('reply could not be read');
    if(!spec.name) spec.name=D.nameFor(spec);
    // The model's second and third readings, each made a legal item the same way: the player's one-tap corrections.
    const seen=new Set([spec.kind+'/'+spec.style]); spec.alts=[];
    for(const o of Array.isArray(reply&&reply.others)?reply.others.slice(0,3):[]){ const a=o&&typeof o==='object'&&D.validItem(o,null); if(!a||!a.name||seen.has(a.kind+'/'+a.style)) continue; seen.add(a.kind+'/'+a.style); spec.alts.push({name:a.name,kind:a.kind,style:a.style}); if(spec.alts.length===2) break; }
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

  /* ---------- RuleForge: match rules written for the items in play ----------
     Once both sides of a room have an item, a language model is asked for a few small rules about how those items
     meet. forge.js proves each one in test fights and falls back to built-in rules; what survives is installed in
     the room's match and sent to its devices (event `forge`). The rules are text from a model: they are parsed,
     checked and interpreted by forgescript.js and never handed to the JavaScript engine. FORGE=0 switches it all off. */
  const FORGE_ON=process.env.FORGE!=='0', FORGE_MODEL=process.env.OPENAI_FORGE_MODEL||MODEL, Forge=require('./forge.js');
  // Rules the model wrote are kept in forge-cache.json (FORGE_CACHE names another file; empty: none), so the same items
  // need no model the next time, also after a restart. tools/forge-warm.js fills it for the ready-made items.
  const FORGE_FILE=process.env.FORGE_CACHE===undefined?path.join(__dirname,'forge-cache.json'):process.env.FORGE_CACHE;
  let saveForge=null;
  const F=Forge({D,ForgeScript:require('./forgescript.js'),ask:KEY?Forge.openai({key:KEY,base:BASE,model:FORGE_MODEL,log:m=>console.error('duel forge:',m)}):undefined,
    onNew:()=>{ if(saveForge&&!saveForge()) console.error('duel forge: could not write',FORGE_FILE); }});
  if(FORGE_ON&&FORGE_FILE) saveForge=Forge.keep(F,FORGE_FILE);
  const forgeSeen=new Map();      // address -> when it last asked POST /duel/forge
  // What a device is told about a room's rules.
  const forgeMsg=fg=>fg.state==='done'?{state:'done',ms:fg.ms,rules:fg.rules}:{state:fg.state};
  // An item of the room has changed (or might have). If anything a rule could see is different, the rules of the old
  // items go at once and no forge still running for them may install anything (gen); 400 ms after the last change,
  // with an item on each side, rules for the new ones are forged.
  function scheduleForge(room){
    if(!FORGE_ON||room.forge.off) return;
    const fg=room.forge, S=room.sim, items=F.itemsOf(S), key=F.keyOf(items);
    if(fg.sim===S&&fg.key===key) return;
    const was=fg.state, gen=++fg.gen; clearTimeout(fg.timer); S.clearRules();
    Object.assign(fg,{sim:S,key,rules:[],ms:0,state:items.every(row=>row.some(Boolean))?'working':'idle'});
    if(fg.state!==was) broadcast(room,'forge',forgeMsg(fg));
    if(fg.state!=='working') return;
    fg.timer=setTimeout(()=>{
      F.forgeRules(items).then(out=>{
        if(fg.gen!==gen||room.sim!==S) return;      // the items changed again, or the match was restarted: these rules are for nothing
        S.clearRules(); const ids=F.install(S,out.rules);
        fg.rules=out.rules.map((r,i)=>({id:ids[i],name:r.name,blurb:r.blurb,a:r.a,b:r.b,on:r.on,cooldown:r.cooldown,code:r.code,source:r.source,checks:r.checks})).filter(r=>r.id>0);
        fg.state='done'; fg.ms=out.ms; S.setHold(0); room.dirty=true; broadcast(room,'forge',forgeMsg(fg));
        console.log('duel forge',out.ms+'ms',out.calls+' call(s)',fg.rules.map(r=>r.name+' ('+r.source+')').join(', ')); for(const line of out.log||[]) console.log('duel forge:',line);
      }).catch(e=>{ console.error('duel forge: could not install the rules:',e.message); if(fg.gen===gen&&room.sim===S){ fg.state='done'; fg.rules=[]; S.clearRules(); S.setHold(0); broadcast(room,'forge',forgeMsg(fg)); } });      // never leave a countdown waiting
    },400);
  }
  // A new match in the room: its rules go with the old one.
  function resetForge(room){ const fg=room.forge, was=fg.state; fg.gen++; clearTimeout(fg.timer); Object.assign(fg,{sim:null,key:'',rules:[],ms:0,state:'idle',held:null}); if(FORGE_ON&&was!=='idle') broadcast(room,'forge',forgeMsg(fg)); }

  /* ---------- rooms ---------- */
  const rooms=new Map(), LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ';
  // Replays. Every room records its match (createDuel({record:true})) and notes each drawing it shows, by item version, so
  // a replay can show the same pictures. When a match is replaced by a rematch, or its room closes, the recording goes on
  // a shelf (see replayShelf at the end of this file). GET /duel/replay?room=CODE answers with the room's current match,
  // or with the shelved one while the room has no match under way.
  const shelf=replayShelf(), started=S=>S.round>1||S.phase!=='draw';       // started: the match has got as far as a countdown
  const recording=room=>{ const log=room.sim.log(); return {log,art:room.shown,hash:log.full?'':room.sim.hash()}; };      // a full log stops short of where the match is, so it has no end state to check against
  const shelve=room=>{ if(started(room.sim)) shelf.put(room.code,recording(room),Date.now()); };
  const noteArt=(room,side,slot)=>{ room.shown.push(Object.assign({side,slot},room.art[side][slot])); if(room.shown.length>400) room.shown.shift(); };
  // bot: Red is played by the game's bot on the server, so one person with a controller can play. skill is its 0 to 1 setting.
  // brain: 'net' asks for the trained CPU; without weights for it the room quietly gets the classic bot.
  function newRoom(stage,bot,skill,brain,plain){      // plain: a room without match rules (its page was opened with ?forge=0)
    let code; do{ code=Array.from({length:4},()=>LETTERS[Math.floor(Math.random()*LETTERS.length)]).join(''); }while(rooms.has(code));
    const now=Date.now(), room={code,stage:stage==='sheet'?'sheet':'',sim:D.createDuel(stage==='sheet'?{stage:'sheet',record:true}:{record:true}),art:[[null,null],[null,null]],shown:[],players:new Map(),watchers:new Set(),clients:new Set(),last:now,sent:0,seen:now,dirty:true,bot:null,brain:brain==='net'&&NET?'net':'classic',skill:Number.isFinite(skill)?Math.max(0,Math.min(1,skill)):0.55,
      forge:{sim:null,key:'',gen:0,state:'idle',rules:[],ms:0,timer:null,held:null,off:!!plain}};
    if(bot){ room.players.set('(bot)',1); room.bot=makeCpu(room); armBot(room); }
    rooms.set(code,room); return room;
  }
  // The one place an event leaves for a device, whichever way the device is connected. On the event stream (c.res) it
  // is a named event. On a socket (c.ws) it is a text frame {"ev":name,"data":...}, except the match's state, which goes
  // as a binary frame: the whole snapshot, or only what has changed since the last one the device said it holds
  // (c.wire, see wire.js). An event sent from anywhere in this file therefore reaches both kinds of device.
  // A snapshot shares lists with its match, which goes on changing them, so sockets patch against a copy of it. The
  // copy is made once per snapshot, however many sockets it goes to.
  const frozen=(()=>{ let of=null, copy=null; return snap=>snap===of?copy:(of=snap,copy=Wire.clone(snap)); })();
  const tell=(c,event,data)=>{
    if(!c.ws) c.res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');
    else if(event==='state') c.ws.send(c.wire.frame(frozen(data),Date.now()));
    else c.ws.send(JSON.stringify({ev:event,data}));
  };
  const broadcast=(room,event,data)=>{ for(const c of room.clients) tell(c,event,data); };
  function present(room){ const p=[false,false]; for(const c of room.clients) if(c.side>=0) p[c.side]=true; if(room.bot) p[1]=true; return p; }
  // Give the bot its two ready-made items for this match and tell every device what they look like.
  function armBot(room){
    D.botLoadout().forEach((b,k)=>{ const it=room.sim.setItem(1,k,b.spec,b.cost); if(!it) return;
      room.art[1][k]={strokes:b.strokes,ver:it.ver,kind:it.kind,style:it.style}; noteArt(room,1,k); broadcast(room,'item',{side:1,slot:k,strokes:b.strokes,ver:it.ver,kind:it.kind,style:it.style}); });
    room.dirty=true; scheduleForge(room);
  }
  // Who is here: the two seats, and whether a big screen is showing the match (players' devices then act as sketchbook and controller only).
  const roster=room=>({present:present(room),screen:[...room.clients].some(c=>c.watch),bot:!!room.bot});
  // A device arrives in a room, on the event stream (link is {res}) or on a socket ({ws, wire}). It takes a seat if it
  // had one or one is free, and is told everything about the match so far.
  function enter(room,id,watch,link){
    // A big screen (watch) shows the match without taking a player's seat; it may ask for a rematch.
    let side=watch?-1:room.players.get(id);
    if(watch) room.watchers.add(id);
    else if(side===undefined){
      const taken=[...room.players.values()];
      side=!taken.includes(0)?0:(!taken.includes(1)?1:-1);
      if(side>=0) room.players.set(id,side);
    }
    const client=Object.assign({id,side,seq:-1,watch},link); room.clients.add(client); room.seen=Date.now();
    tell(client,'hello',{side,code:room.code,watch,bot:!!room.bot,brain:room.bot?room.brain:''});
    room.art.forEach((a,s)=>a.forEach((x,slot)=>{ if(x) tell(client,'item',{side:s,slot,strokes:x.strokes,ver:x.ver,kind:x.kind,style:x.style}); }));
    broadcast(room,'players',roster(room));
    if(room.plats) tell(client,'plats',{plats:room.plats});
    if(FORGE_ON&&room.forge.state!=='idle') tell(client,'forge',forgeMsg(room.forge));      // the rules of the match so far, for a device that joins or comes back late
    tell(client,'state',room.sim.snapshot());
    return client;
  }
  // ...and goes: its connection has closed. A player with no device left lets go of the directions it held.
  function leave(room,client){
    if(!room.clients.delete(client)) return;
    broadcast(room,'players',roster(room));
    if(client.side>=0&&!present(room)[client.side]) room.sim.setInput(client.side,Object.assign({},room.sim.cnt[client.side],{l:0,r:0,d:0}));
  }
  // A controller's buttons, sent by request or over its socket (c: the device's entry in the room, if it has one).
  // Messages can arrive out of order, so only the newest one counts.
  function takeInput(room,c,side,body){
    const seq=+body.seq||0;
    if(c&&seq>c.seq){ c.seq=seq; (room.heldAt=room.heldAt||[0,0])[side]=(body.l||body.r||body.d)?Date.now():0; (room.lastIn=room.lastIn||[null,null])[side]=body; room.sim.setInput(side,{l:!!body.l,r:!!body.r,d:!!body.d,j:+body.j||0,a:+body.a||0,b:+body.b||0,m:+body.m||0,q:+body.q||0,u:+body.u||0,h:Math.max(0,Math.min(4,body.h|0))}); }
  }
  // 120 ticks a second (the match steps at 120 Hz); state goes out 60 times a second and screens glide in between. The match only advances while both players are connected.
  setInterval(()=>{
    const now=Date.now();
    for(const room of rooms.values()){
      const dt=Math.min(0.1,(now-room.last)/1000), both=present(room).every(Boolean), S=room.sim; room.last=now;
      // A controller repeats its buttons several times a second; one that goes quiet with a direction held has lost its release.
      if(room.heldAt) for(const s of [0,1]) if(room.heldAt[s]&&now-room.heldAt[s]>900){ const b=room.lastIn[s]; room.heldAt[s]=0;
        S.setInput(s,{l:false,r:false,d:false,j:+b.j||0,a:+b.a||0,b:+b.b||0,m:+b.m||0,q:+b.q||0,u:+b.u||0,h:Math.max(0,Math.min(4,b.h|0))}); }
      if(both){ if(room.bot){ room.bot(S,dt); if(S.phase==='draw'&&!S.ready[1]) S.setReady(1); } S.step(dt); }
      // The countdown has begun and the rules are still being written: it waits for them, once, and four seconds at most (S.setHold).
      if(S.phase==='count'&&room.forge.state==='working'&&room.forge.held!==S.round){ room.forge.held=S.round; S.setHold(D.FORGE_LIMITS.hold); } else if(S.phase==='draw') room.forge.held=null;
      const live=both&&(S.phase==='count'||S.phase==='fight'||S.phase==='end'||(S.phase==='over'&&(S.overT||0)<4.2));      // the ended state is sent at full rate while the fighters come to rest
      if(room.clients.size&&((live&&now-room.sent>=15)||room.dirty||now-room.sent>=250)){ broadcast(room,'state',S.snapshot()); room.sent=now; room.dirty=false; }
      if(room.clients.size) room.seen=now; else if(now-room.seen>10*60e3){ shelve(room); rooms.delete(room.code); }
    }
  },8);
  setInterval(()=>{ for(const room of rooms.values()) for(const c of room.clients) if(c.res) c.res.write(': ping\n\n'); shelf.sweep(Date.now()); },15000);      // (sockets are pinged by ws.js)

  function cleanPlats(a){
    if(!Array.isArray(a)||a.length>32) return null;
    const out=[];
    for(const p of a){
      if(!p||![p.x0,p.x1,p.y].every(Number.isFinite)) return null;
      const x0=Math.max(0,Math.min(6000,Math.round(p.x0))), x1=Math.max(0,Math.min(6000,Math.round(p.x1))), y=Math.round(p.y);
      if(x1-x0<30||y<26||y>3000) continue;
      out.push({id:String(p.id||'').slice(0,24),wx:Number.isFinite(p.wx)?Math.round(p.wx):x0,x0,x1,y});
    }
    return out;
  }
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
    room.art[side][slot]={strokes,ver:it.ver,kind:it.kind,style:it.style}; noteArt(room,side,slot); room.dirty=true;
    broadcast(room,'item',{side,slot,strokes,ver:it.ver,kind:it.kind,style:it.style}); scheduleForge(room);
    return [200,{name:it.name,kind:it.kind,style:it.style,element:it.el,source,alts:spec.alts||[]}];
  }

  /* ---------- http ---------- */
  const handle=async function(req,res,url){
    const p=url.pathname;
    // Animation clip files and the preview lab are plain static files.
    if(req.method==='GET'&&(/^\/anim\/[a-z_]+\.js$/.test(p)||p==='/anim-lab.html'||p==='/inkshop.js'||p==='/forgescript.js'||p==='/wire.js'||p==='/sfx.js'||p==='/inkshop.css')){      // forgescript.js: the rule language, for matches simulated in the page; wire.js: state frames, for a page on a socket
      const file=path.join(__dirname,p.slice(1));
      if(!fs.existsSync(file)){ res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache'}); res.end('/* '+p+' is not written yet */'); return true; }
      res.writeHead(200,{'Content-Type':(p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':'text/javascript')+'; charset=utf-8','Cache-Control':'no-cache'}); fs.createReadStream(file).pipe(res); return true;
    }
    if(p!=='/duel'&&p!=='/duel.html'&&p!=='/moves'&&!p.startsWith('/duel/')) return false;   // /moves is the same page as a move tester
    const send=(code,obj)=>{ res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); };
    if(req.method==='GET'&&(p==='/duel'||p==='/duel.html'||p==='/moves')){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}); fs.createReadStream(page).pipe(res); return true;
    }
    // Single-device modes: classify one drawing.
    if(req.method==='POST'&&p==='/duel/read'){
      if(!KEY){ send(500,{error:'OPENAI_API_KEY is not set on the server'}); return true; }
      const out=await readDrawing(await readBody(req,2e6),null);
      out?send(200,Object.assign({source:out.source},out.spec)):send(502,{error:'OpenAI could not read the drawing'}); return true;
    }
    // The recording of a room's match, for duel?replay=CODE: {log, art, hash, rules} and previous:true when it is the match
    // before the one now being set up. log is what replayDuel takes, art the drawings by item version, hash the state the
    // match was in when this was sent (a replay that ends anywhere else has gone wrong), rules the stamp of these rules.
    if(req.method==='GET'&&p==='/duel/replay'){
      const code=String(url.searchParams.get('room')||'').toUpperCase(), room=rooms.get(code), old=shelf.get(code,Date.now());
      const out=room&&(started(room.sim)||!old)?recording(room):old?Object.assign({},old,room?{previous:true}:null):null;
      if(!out||!out.log) send(404,{error:'There is no replay for that room.'}); else send(200,Object.assign({rules:RULES},out));
      return true;
    }
    // Matches played in the page (against the bot there, two on one keyboard) ask here for their rules.
    if(FORGE_ON&&req.method==='POST'&&p==='/duel/forge'){
      let body; try{ body=JSON.parse((await readBody(req,8000)).toString('utf8')); }catch(e){ send(400,{error:'Bad request.'}); return true; }
      const items=F.cleanItems(body&&body.items); if(!items||!items.every(row=>row.some(Boolean))){ send(400,{error:'Two sides with an item each are needed.'}); return true; }
      const who=req.socket.remoteAddress||'', now=Date.now();
      if(now-(forgeSeen.get(who)||0)<2000){ send(429,{error:'One forge every two seconds.'}); return true; }
      forgeSeen.set(who,now); if(forgeSeen.size>2000) for(const [k,t] of forgeSeen) if(now-t>60000) forgeSeen.delete(k);
      const out=await F.forgeRules(items); send(200,{rules:out.rules,ms:out.ms}); return true;
    }
    if(req.method==='POST'&&p==='/duel/room'){
      if(rooms.size>=500) send(503,{error:'Too many rooms are open right now.'}); else send(200,{code:newRoom(url.searchParams.get('stage'),url.searchParams.get('bot')==='1',parseFloat(url.searchParams.get('skill')),url.searchParams.get('brain'),url.searchParams.get('forge')==='0').code});      // ?stage=sheet: the spreadsheet stage; ?bot=1&brain=net: the trained CPU
      return true;
    }
    if(req.method==='GET'&&p==='/duel/events'){
      const room=rooms.get(String(url.searchParams.get('room')||'').toUpperCase()), id=String(url.searchParams.get('id')||'').slice(0,40);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      if(!room||!id){ tell({res},'gone',{}); res.end(); return true; }
      const client=enter(room,id,url.searchParams.get('watch')==='1',{res});
      req.on('close',()=>leave(room,client));
      return true;
    }
    if(req.method==='POST'&&p==='/duel/act'){
      let body; try{ body=JSON.parse((await readBody(req,1.5e6)).toString('utf8')); }catch(e){ send(400,{error:'Bad request.'}); return true; }
      const room=rooms.get(String(body.room||'').toUpperCase());
      if(!room){ send(404,{error:'That room has closed.'}); return true; }
      const id=String(body.id||''), side=room.players.get(id);
      const screen=room.watchers.has(id);
      if((side===undefined||side<0)&&!(screen&&(body.type==='rematch'||body.type==='plats'||body.type==='layout'))){ send(403,{error:'You are not a player in this room.'}); return true; }
      const S=room.sim;
      if(body.type==='plats'){
        // Terrain from the big screen (the desktop overlay sends the tops of real windows). Only the screen may set it.
        if(!screen){ send(403,{error:'Only the big screen sets the terrain.'}); return true; }
        const plats=cleanPlats(body.plats); if(!plats){ send(400,{error:'Bad terrain.'}); return true; }
        room.plats=plats; S.setPlats(plats); broadcast(room,'plats',{plats}); send(200,{}); return true;
      }
      if(body.type==='layout'){
        // The big screen describes its stage: arena width, the art board, and the window ledges.
        if(!screen){ send(403,{error:'Only the big screen sets the layout.'}); return true; }
        const plats=cleanPlats(body.plats||[]), b=body.board, w=+body.w;
        if(!plats||!Number.isFinite(w)||w<600||w>6000){ send(400,{error:'Bad layout.'}); return true; }
        const board=b&&[b.x0,b.x1,b.floor,b.top].every(Number.isFinite)?{x0:Math.round(b.x0),x1:Math.round(b.x1),floor:Math.round(b.floor),top:Math.round(b.top)}:null;
        room.layout={w:Math.round(w),board,plats:plats.map(q=>Object.assign({},q))}; room.plats=plats; S.setLayout(room.layout); broadcast(room,'plats',{plats}); room.dirty=true; send(200,{}); return true;
      }
      if(body.type==='stroke'){
        // A shape drawn during the fight: the rules recognise it and decide what it becomes.
        const a=body.pts; if(!Array.isArray(a)||a.length<2||a.length>600||!a.every(q=>Array.isArray(q)&&Number.isFinite(q[0])&&Number.isFinite(q[1]))){ send(400,{error:'Bad stroke.'}); return true; }
        S.stroke(side,a.map(q=>({x:Math.max(-200,Math.min(8000,q[0])),y:Math.max(-4000,Math.min(200,q[1]))})),String(body.col||'#111111').slice(0,9)); send(200,{}); return true;
      }
      if(body.type==='input'){
        let c=null; for(const x of room.clients) if(x.id===id) c=x;
        takeInput(room,c,side,body); send(200,{}); return true;
      }
      if(body.type==='item'){ const [code,out]=await makeItem(room,side,body); send(code,out); return true; }
      if(body.type==='stock'){
        // A ready-made item: no drawing to read, so it is added at once.
        const slot=body.slot===1?1:0, made=D.stockItem(String(body.key||''),String(body.el||'none'));
        if(!made){ send(400,{error:'Unknown item.'}); return true; }
        if(S.phase!=='draw'){ send(409,{error:'Too late: the round has started.'}); return true; }
        const other=S.items[side][1-slot], it=S.setItem(side,slot,made.spec,Math.min(45,D.INK_MAX-(other?other.cost:0)));
        if(!it){ send(409,{error:'Not enough ink left for that.'}); return true; }
        room.art[side][slot]={strokes:made.strokes,ver:it.ver,kind:it.kind,style:it.style}; noteArt(room,side,slot); room.dirty=true;
        broadcast(room,'item',{side,slot,strokes:made.strokes,ver:it.ver,kind:it.kind,style:it.style}); scheduleForge(room);
        send(200,{name:it.name,kind:it.kind,style:it.style,element:it.el}); return true;
      }
      if(body.type==='tweak'){
        // Change an item already made: what it is, which of its two traits it uses, or its power-for-speed tuning.
        const slot=body.slot===1?1:0, ch={}, a=room.art[side][slot];
        if(typeof body.kind==='string'){ ch.kind=body.kind; ch.style=String(body.style||''); }
        if(typeof body.name==='string') ch.name=body.name;
        if(typeof body.trait==='string') ch.trait=body.trait;
        if(Number.isFinite(body.tune)) ch.tune=body.tune;
        if(Array.isArray(body.customs)) ch.customs=body.customs.slice(0,8);      // wielder customizations: cleaned and budgeted by the rules (fitCustoms)
        if(Array.isArray(body.customs)) ch.customs=body.customs;      // transform: the item's customization (cleaned by the rules, see transformValid)
        const it=a&&S.tweak(side,slot,ch);
        if(!it){ send(409,{error:'That cannot be changed now.'}); return true; }
        Object.assign(a,{ver:it.ver,kind:it.kind,style:it.style}); noteArt(room,side,slot); room.dirty=true;
        broadcast(room,'item',{side,slot,strokes:a.strokes,ver:it.ver,kind:it.kind,style:it.style}); scheduleForge(room);
        send(200,{}); return true;
      }
      if(body.type==='ready'){ S.setReady(side); room.dirty=true; send(200,{}); return true; }
      if(body.type==='rematch'){
        shelve(room); room.shown=[];       // the match that is ending stays watchable (see the replay route)
        room.sim=D.createDuel(room.stage?{stage:room.stage,record:true}:{record:true}); if(room.layout) room.sim.setLayout(room.layout); else if(room.plats) room.sim.setPlats(room.plats); room.art=[[null,null],[null,null]]; room.dirty=true; broadcast(room,'reset',{}); resetForge(room); if(room.bot){ room.bot=makeCpu(room); armBot(room); } send(200,{}); return true;
      }
      send(400,{error:'Unknown action.'}); return true;
    }
    send(404,{error:'not found'}); return true;
  };
  handle.brains=()=>NET?['classic','net']:['classic'];      // which CPUs a bot room can have (for /info and the menu)
  // The socket way into a room: GET /duel/ws?room=CODE&id=CLIENT[&watch=1], upgraded to a WebSocket (server.js calls
  // this with its http server). Down it comes everything the event stream carries. Up it come text frames: the
  // controller's buttons {"t":"input","seq":n,...buttons}, which state the device holds {"t":"ack","ack":n} (an input
  // may carry "ack" as well), and {"t":"ping","ms":x}, answered with the event pong {ms:x} so the page can time the
  // round trip. Everything else a device does stays on POST /duel/act.
  handle.sockets=server=>WS.attach(server,'/duel/ws',(sock,req)=>{
    const url=new URL(req.url,'http://x'), room=rooms.get(String(url.searchParams.get('room')||'').toUpperCase()), id=String(url.searchParams.get('id')||'').slice(0,40);
    if(!room||!id){ tell({ws:sock},'gone',{}); sock.close(); return; }
    const before=[...room.clients].filter(c=>c.ws&&c.id===id);
    const client=enter(room,id,url.searchParams.get('watch')==='1',{ws:sock,wire:Wire.createSender()});
    for(const c of before){ leave(room,c); c.ws.close(); }      // the same device again (it reloaded, or woke from sleep): its old socket goes, its seat stays taken throughout
    sock.on('message',(data,isBinary)=>{
      try{
        const m=isBinary?null:JSON.parse(data); if(!m||typeof m!=='object') return;
        if(m.ack!==undefined) client.wire.ack(m.ack);
        if(m.t==='input'){ if(client.side>=0&&room.clients.has(client)) takeInput(room,client,client.side,m); }
        else if(m.t==='ping') tell(client,'pong',{ms:+m.ms||0});
      }catch(e){}      // not JSON: nothing a device of ours sends
    });
    sock.on('close',()=>leave(room,client));
  });
  return handle;
};

// Where finished recordings wait: one per room code, each for 30 minutes, 50 at most (the oldest goes first).
// The clock is passed in, so the limits can be tested without waiting.
function replayShelf(max=50,ms=30*60e3){
  const kept=new Map();      // code -> {at, rec}, oldest first
  return {
    put(code,rec,now){ kept.delete(code); kept.set(code,{at:now,rec}); while(kept.size>max) kept.delete(kept.keys().next().value); },
    get(code,now){ const k=kept.get(code); if(!k) return null; if(now-k.at>ms){ kept.delete(code); return null; } return k.rec; },
    sweep(now){ for(const [code,k] of kept) if(now-k.at>ms) kept.delete(code); },
    size:()=>kept.size
  };
}
module.exports.replayShelf=replayShelf;
