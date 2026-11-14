// The machine's updates, as data: what an update may contain, checking one, play-testing one in headless matches, and
// installing one in a match. The OS agent (os-agent/) writes updates with these as its tools; the game server runs the same
// checks again before anything reaches a live room, so nothing here trusts who wrote the update.
//   const OS=require('./osforge.js')({D, ForgeScript})      D: the rules block's exports (createDuel, makeBot, botLoadout, MODS, FORGE_API, FORGE_LIMITS)
//   OS.manual()                 -> text: everything an update can do (generated from the rules' own tables)
//   OS.clean(raw)               -> {patch, errors}: a tidy copy of an update, and what is wrong with it
//   OS.playtest(patch, {rounds, seed}) -> numbers from bot matches with the update, beside the same matches without it
//   OS.install(S, patch)        -> puts a checked update into a match
// An update: {name, notes:[...], mods:{gravity:0.4,...}, rules:[{name, blurb, cooldown, code}]}
'use strict';
module.exports=function({D,ForgeScript}){
  const FS=ForgeScript, MODS=D.MODS, API=D.FORGE_API.world, FL=D.FORGE_LIMITS, HP=D.HP||160;
  const text=(v,max)=>String(v===undefined||v===null?'':v).replace(/[\x00-\x1f\x7f<>]+/g,' ').trim().slice(0,max);
  const EFFECT=/\b(push|burn|soak|stun|heal|hurt)\s*\(/;
  // What an update looks like on screen: only the page draws it, the rules never see it.
  const LOOK={floor:['none','lava','ice','slime','void','grass'],weather:['none','embers','rain','snow','stars','sparks','wind','bubbles']};

  function clean(raw){
    const errors=[], p={name:'',notes:[],mods:{},rules:[],look:{floor:'none',weather:'none',tint:''}};
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {patch:null,errors:['the update must be a JSON object: {name, notes, mods, rules}']};
    p.name=text(raw.name,28); if(!p.name) errors.push('name is missing: give the update a short name');
    p.notes=(Array.isArray(raw.notes)?raw.notes:[]).map(n=>text(n,90)).filter(Boolean).slice(0,4);
    if(!p.notes.length) errors.push('notes is empty: write one to three short patch notes a player can read');
    const mods=raw.mods&&typeof raw.mods==='object'&&!Array.isArray(raw.mods)?raw.mods:{};
    for(const k of Object.keys(mods)){
      if(!Object.prototype.hasOwnProperty.call(MODS,k)){ errors.push('mods.'+k+' does not exist: the settings are '+Object.keys(MODS).join(', ')); continue; }
      const v=mods[k]; if(typeof v!=='number'||!Number.isFinite(v)){ errors.push('mods.'+k+' must be a number'); continue; }
      if(v<MODS[k][0]||v>MODS[k][1]) errors.push('mods.'+k+' is '+v+': it must be between '+MODS[k][0]+' and '+MODS[k][1]);
      else if(v!==MODS[k][2]) p.mods[k]=v;
    }
    const look=raw.look&&typeof raw.look==='object'&&!Array.isArray(raw.look)?raw.look:{};
    for(const k of ['floor','weather']){ const v=look[k]===undefined?'none':String(look[k]).toLowerCase(); if(LOOK[k].includes(v)) p.look[k]=v; else errors.push('look.'+k+' is "'+text(v,20)+'": it must be one of '+LOOK[k].join(', ')); }
    if(look.tint!==undefined&&look.tint!==''){ if(/^#[0-9a-fA-F]{6}$/.test(String(look.tint))) p.look.tint=String(look.tint).toLowerCase(); else errors.push('look.tint must be a colour like #ff6600, or left out'); }
    if(p.look.floor==='none'&&p.look.weather==='none'&&!p.look.tint&&!errors.length) errors.push('look is empty: every update needs a look a watcher notices at once (a floor, a weather or a tint)');
    const rules=Array.isArray(raw.rules)?raw.rules:[];
    if(rules.length>3) errors.push('there are '+rules.length+' rules: three at most');
    rules.slice(0,3).forEach((r,i)=>{
      const at='rules['+i+']'+(r&&r.name?' ('+text(r.name,22)+')':'');
      if(!r||typeof r!=='object'){ errors.push(at+' is not an object'); return; }
      const name=text(r.name,22), code=typeof r.code==='string'?r.code:'';
      if(!name) errors.push(at+': name is missing');
      let cd=+r.cooldown; if(!Number.isFinite(cd)) cd=1; cd=Math.max(FL.cooldown[0],Math.min(FL.cooldown[1],cd));
      if(!code){ errors.push(at+': code is missing'); return; }
      const parsed=FS.parse(code);
      if(!parsed.ok){ errors.push(at+': line '+parsed.errors[0].line+' col '+parsed.errors[0].col+': '+parsed.errors[0].msg); return; }
      const bad=FS.check(parsed.ast,API); if(bad.length){ errors.push(at+': line '+bad[0].line+' col '+bad[0].col+': '+bad[0].msg); return; }
      if(!EFFECT.test(code)) errors.push(at+': the code only shouts or sparks; a world rule must call push, burn, soak, stun, heal or hurt');
      p.rules.push({name,blurb:text(r.blurb,70),cooldown:cd,code});
    });
    if(!Object.keys(p.mods).length&&!p.rules.length&&!errors.length) errors.push('the update changes nothing: set at least one of mods, or write a rule');
    return {patch:errors.length?null:p,errors};
  }

  // Put a checked update into a match: the settings, then its world rules (each compiled by the rule language's own
  // interpreter, never by the JavaScript engine). Returns the ids of the rules that went in.
  function install(S,patch){
    S.setMods(patch&&patch.mods||{}); S.clearWorld(); const ids=[];
    for(const r of (patch&&patch.rules)||[]){ const p=FS.parse(r.code); if(!p.ok||FS.check(p.ast,API).length) continue; ids.push(S.addWorldRule({name:r.name,blurb:r.blurb,cooldown:r.cooldown,run:FS.compile(p.ast),code:r.code})); }
    return ids;
  }

  // One round between two of the game's own bots holding the same random loadout, with or without the update.
  function round(patch,seed){
    const S=D.createDuel({seed}), items=D.botLoadout(seed+7);
    for(let s=0;s<2;s++) items.forEach((b,k)=>S.setItem(s,k,b.spec,b.cost));
    if(patch) install(S,patch);
    const bots=[D.makeBot(0,()=>0.55,seed+1),D.makeBot(1,()=>0.55,seed+2)]; S.setReady(0); S.setReady(1);
    let t=0, air=0, ticks=0, top=0, sane=true, fires=0, hits=0; const side=[0,0];
    while(S.phase!=='end'&&S.phase!=='over'&&t<110){
      t+=1/60; bots[0](S,1/60); bots[1](S,1/60); S.step(1/60);
      for(const e of S.events.splice(0)){ if(e.e==='rule'&&e.w){ fires++; side[e.side]++; } else if(e.e==='hit') hits++; }
      if(S.phase==='fight'){ ticks++; for(const f of S.f){ if(!f.ground) air+=0.5; if(f.y>top) top=f.y; } if(ticks%60===0&&!S.sane()) sane=false; }
    }
    const done=S.phase==='end'||S.phase==='over', ko=done&&(S.f[0].hp<=0||S.f[1].hp<=0);
    return {side,secs:Math.max(0,t-3),winner:done?S.winner:-1,ko,timeout:!ko,air:ticks?air/ticks:0,top,sane:sane&&S.sane(),fires,hits,faults:S.wrules.reduce((n,r)=>n+r.faults,0),off:S.wrules.filter(r=>r.off).map(r=>r.name),
      perRule:S.wrules.map(r=>({name:r.name,fired:r.fired}))};
  }
  function summarise(rs){
    const n=rs.length, avg=f=>rs.reduce((s,r)=>s+f(r),0)/Math.max(1,n), pct=f=>Math.round(100*avg(r=>f(r)?1:0));
    const decided=rs.filter(r=>r.winner>=0).length;
    return {rounds:n,roundSeconds:+avg(r=>r.secs).toFixed(1),knockoutPct:pct(r=>r.ko),timeoutPct:pct(r=>r.timeout),blueWinPct:decided?Math.round(100*rs.filter(r=>r.winner===0).length/decided):50,
      airbornePct:Math.round(100*avg(r=>r.air)),highestJumpPx:Math.round(Math.max(0,...rs.map(r=>r.top))),hitsPerRound:+avg(r=>r.hits).toFixed(1)};
  }
  const baseCache=new Map();
  // Play-test an update: the same seeded rounds with it and without it, and what a tester would say about the numbers.
  function playtest(patch,o){
    const rounds=Math.max(6,Math.min(120,(o&&o.rounds)|0||40)), seed=((o&&o.seed)|0)||4242, t0=Date.now(), problems=[], withP=[]; let crash='';
    for(let i=0;i<rounds;i++){ try{ withP.push(round(patch,seed+i*13)); }catch(e){ crash=String(e&&e.message||e).slice(0,160); break; } }
    const key=rounds+':'+seed; if(!baseCache.has(key)){ const b=[]; for(let i=0;i<rounds;i++) b.push(round(null,seed+i*13)); baseCache.set(key,summarise(b)); }
    const base=baseCache.get(key), now=summarise(withP);
    const fires={}; for(const r of withP) for(const q of r.perRule) fires[q.name]=(fires[q.name]||0)+q.fired;
    const perRound={}; for(const k in fires) perRound[k]=+(fires[k]/Math.max(1,withP.length)).toFixed(1);
    if(crash) problems.push('CRASH: a match threw "'+crash+'"');
    if(withP.some(r=>!r.sane)) problems.push('BROKEN: a fighter or shot ended up with impossible numbers or far outside the arena');
    const faults=withP.reduce((n,r)=>n+r.faults,0); if(faults) problems.push('FAULTS: rules failed '+faults+' times ('+[...new Set(withP.flatMap(r=>r.off))].join(', ')+' switched off)');
    for(const k in perRound) if(perRound[k]===0) problems.push('DEAD RULE: "'+k+'" never fired in '+withP.length+' rounds');
    if(!crash){
      if(now.roundSeconds<6) problems.push('TOO DEADLY: rounds last '+now.roundSeconds+' s on average (normally '+base.roundSeconds+' s)');
      if(now.timeoutPct>45) problems.push('TOO SLOW: '+now.timeoutPct+'% of rounds run out the clock (normally '+base.timeoutPct+'%)');
      if(now.rounds>=20&&(now.blueWinPct<30||now.blueWinPct>70)) problems.push('ONE-SIDED: Blue wins '+now.blueWinPct+'% of decided rounds; an update must treat both sides alike');
    }
    const bySide=withP.reduce((a,r)=>[a[0]+r.side[0],a[1]+r.side[1]],[0,0]);
    if(bySide[0]+bySide[1]>=40&&Math.min(bySide[0],bySide[1])<0.25*(bySide[0]+bySide[1])) problems.push('ONE-SIDED RULES: the rules fired '+bySide[0]+' times for Blue and '+bySide[1]+' for Red');
    return {ok:!problems.length,problems,withUpdate:now,without:base,ruleFiresPerRound:perRound,ruleFiresBlueRed:bySide,ms:Date.now()-t0};
  }

  // Everything an update can do, for whoever writes one. Generated from the rules' own tables so it cannot go stale.
  function manual(){
    const what={gravity:'how hard fighters and lobbed things are pulled down',speed:'how fast fighters run',jump:'how high a jump goes',damage:'how much every hit hurts',knockback:'how far a hit throws its target',
      shotSpeed:'how fast projectiles fly',size:'how big the fighters are (smaller is harder to hit)',health:'how much of the '+HP+' hp bar a fighter starts each round with',overdrive:'how fast the ultimate meter fills'};
    const fields=o=>Object.keys(o).filter(k=>typeof o[k]==='string'&&!o[k].startsWith('fn')).join(' ');
    return ['# What an update can change','',
      'An update is one JSON object:','',
      '```json','{"name":"Moon Gravity","notes":["Everyone floats: gravity is a third of normal.","Jumps carry further."],"mods":{"gravity":0.35,"jump":1.3},"rules":[],"look":{"floor":"none","weather":"stars","tint":"#1b1f4a"}}','```','',
      '- name: at most 28 characters. notes: one to three short patch notes written for players.',
      '- It must change something: at least one setting in mods, or at least one rule. Three rules at most.','',
      '## look: what the update looks like (required)','','The arena is redrawn so that anyone watching sees the update at once. It changes nothing in the fight; it is the picture that goes with it.','',
      '- floor: '+LOOK.floor.join(', ')+'. What the ground is made of.',
      '- weather: '+LOOK.weather.join(', ')+'. What drifts through the air.',
      '- tint: a colour like #ff6600 washed over the arena, or leave it out.',
      'Pick the look that tells the story of the change: a lava floor with embers and an orange tint, the moon with stars and a dark blue tint, a storm with rain and sparks.','',
      '## mods: settings of the whole match','','Each is a multiplier; 1 is normal. Leave out what you do not change.','',
      ...Object.keys(MODS).map(k=>'- '+k+': '+MODS[k][0]+' to '+MODS[k][1]+'. '+what[k]+'.'),'',
      '## rules: world rules','',
      'A world rule is a small program run for EACH fighter in turn, four times a second, while the fight is on. Inside it `me` is the fighter being looked at and `foe` is the other one. The same rule runs for both, so it must not favour a side.','',
      'Shape: {"name":"Lava Floor","blurb":"The floor burns whoever stands on it.","cooldown":0.5,"code":"if (me.grounded) { hurt(me, 3); say(\'HOT!\'); }"}','',
      '- cooldown: seconds before the rule can fire again for the same fighter, '+FL.cooldown[0]+' to '+FL.cooldown[1]+'.',
      '- A rule only "fires" when it calls an effect. One that never fires in a play-test is a dead rule.','',
      '### The language','',
      'A strict subset of JavaScript. Statements: let x = e; const x = e; x = e; mem.name = e; (also += -= *= /=); if (e) ... else ...; return; a call; { } blocks; // comments.',
      'Expressions: numbers, true, false, \'text\' or "text", names, a.b, calls, - ! * / % + - < <= > >= == != && || ?: and ( ).',
      'Nothing else exists: no loops, no functions, no arrays or [ ], no object literals, no new, null or undefined, no ++ or --, no template strings, no backslash anywhere. At most 800 characters.','',
      '### What the code can read','',
      '- me, foe: numbers '+fields(API.me)+' (x runs 0 to 960 left to right, y is height above the floor, hp is out of '+HP+', face is 1 or -1); the rest are true/false.',
      '- dist (px between the fighters), time (seconds into the round), mem.name (the rule\'s own notes, 0 until set, emptied each round).',
      '- Math.abs sign floor round sqrt sin cos (one number), Math.min max hypot (two numbers). chance(p) is true with probability p.','',
      '### What the code can do (who is the bare name me or foe)','',
      '- push(who, vx, vy): throw them at that speed in px/s, vy upward, at most '+FL.pushX+' each way.',
      '- burn(who, seconds), soak(who, seconds): on fire, or slowed, for at most '+FL.burn+' s.',
      '- stun(who, seconds): frozen, at most '+FL.stun+' s a call and '+FL.stunBudget+' s a round.',
      '- hurt(who, hp), heal(who, hp): at most '+FL.hurt+' a call. All the world rules of an update share '+D.WORLD_BUDGET+' hp of hurting and healing a round, so a rule that hurts constantly runs dry: make it matter, not drain. A hurt or heal of 1 or 2 is too small for anyone to notice: use 3 to '+FL.hurt+'.',
      '- say(text): a shout over the fighter, at most '+FL.say+' characters, in capitals. spark(x, y): a flash.','',
      '### Examples','',
      '- Lava floor: if (me.grounded) { hurt(me, 3); say(\'HOT!\'); }   (cooldown 0.5; pair it with mods.jump 1.3 so staying up is possible)',
      '- Wind from the left: push(me, me.vx + 90, me.vy);   (cooldown 0.25)',
      '- Comeback: if (me.hp < foe.hp - 50) { heal(me, 2); say(\'NOT YET\'); }   (cooldown 1)',
      '- Edge of the world: if (me.x < 80 || me.x > 880) { push(me, me.x < 480 ? 420 : -420, 300); say(\'BOING\'); }   (cooldown 0.5)',
      '- Sudden storm every ten seconds: if (time % 10 < 0.3) { stun(me, 0.4); spark(me.x, me.y + 60); say(\'ZAP\'); }   (cooldown 2)','',
      '## What an update cannot do','',
      'It cannot add new art, new weapons, new stages or new buttons, and it cannot treat Blue and Red differently. If a request needs one of those, build the closest thing these settings and rules can express and say so in the notes.'].join('\n');
  }
  return {clean,install,playtest,manual,MODS,LOOK};
};
