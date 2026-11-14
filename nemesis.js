// Nemesis: the machine that plays Red studies how Blue plays and builds against them. These are the tools it builds with;
// the thinking is done by a deep agent (os-agent/nemesis.mjs), the game server only trusts what passes here.
//   const NEM=require('./nemesis.js')({D, A})     D: the rules block's exports, A: abilities.js made with the same D
//   NEM.manual(n)              -> text: everything a build may be, written from the rules' own tables (n: abilities allowed)
//   NEM.clean(raw, n)          -> {build, errors}: a tidy copy of a build, and what is wrong with it
//   NEM.arm(build)             -> [{spec, cost, strokes}, x2]: the two items, ready for S.setItem
//   NEM.clone(reports, items)  -> the player as a sparring partner: {skill, habit, items}
//   NEM.spar(arms, clone, {rounds, seed}) -> numbers from practice rounds of those items against the copy of the player
//   NEM.read(reports)          -> the player's habits as short lines a person can read
// A build: {name, taunt, items:[{base, element, ink, trait, tune, name, abilities:[...]}, {...}]}. The machine gets no more
// than a player could have: two items made from the ready-made ones, 80 ink between them, and abilities checked and
// capped by the same code that checks a player's.
'use strict';
module.exports=function({D,A}){
  const BASES=['sword','spear','hammer','twins','gloves','bow','gun','pistols','staff','star','bomb','shield','wings','snack'];
  const INK=80, INK_EACH=[10,70], text=(v,max)=>String(v===undefined||v===null?'':v).replace(/[\x00-\x1f\x7f<>"]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const scoreFor=n=>n>=2?8:n===1?6:2;      // the creativity score that buys n abilities (abilityAllowance)

  function manual(n){
    const rows=BASES.map(k=>{ const s=D.stockItem(k,'none').spec; return '  '+k+': '+s.kind+(s.style?' ('+s.style+')':'')+', power/range/speed '+s.power+'/'+s.range+'/'+s.speed+', traits '+s.traits.join(' or '); });
    const ab=A.promptText(), from=ab.indexOf('TEMPLATES');
    return ['THE BUILD. You fight with two items, like any player. Write the build as one JSON object:',
      '{"name": what you call this build, at most 24 characters, "taunt": one line to the player, at most 90 characters, that quotes a number from their file,',
      ' "items": [MAIN, SIDE]}',
      'Each item: {"base": one of the ready-made items below, "element": "none"|"fire"|"water"|"plant", "ink": a number, "trait": one of that base\'s two traits,',
      ' "tune": -2 to 2 (above 0 trades speed for power, below 0 power for speed), "name": your own name for it, at most 22 characters, "abilities": [...]}',
      'The two items must have different bases. Ink is strength: more ink makes an item hit harder, reach further and last longer. Each item takes '+INK_EACH[0]+' to '+INK_EACH[1]+' ink and the two together at most '+INK+'.',
      'Elements: fire burns the foe over time, water soaks them (slower), plant roots and drains; none is plain.',
      'Kinds: melee is swung up close; ranged shoots; a bomb is lobbed; a shield blocks hits and shots while raised; a dash (wings) crosses the stage fast; a heal (snack) gives health back a few times.',
      'READY-MADE ITEMS:',...rows,
      '',
      'ABILITIES. MAIN may carry '+(n>=2?'up to two abilities':n===1?'one ability':'no abilities')+'; SIDE carries none (give it "abilities": []).',
      n>0?'An ability is {"name": at most 18 characters, "blurb": one line of at most 70 characters, and EITHER "block": "<template key>" (always on) OR "on", "cooldown" (0.5 to 8 seconds) and "code" (a script you write)}. The game tests every ability in practice fights before it accepts the build: code that breaks or never does anything is refused.':'',
      n>0?ab.slice(from):''].join('\n');
  }

  function clean(raw,n){
    const errors=[]; n=Math.max(0,Math.min(2,n|0));
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {build:null,errors:['the build must be a JSON object: {name, taunt, items}']};
    const b={name:text(raw.name,24),taunt:text(raw.taunt,90),items:[]};
    if(!b.name) errors.push('name is missing');
    if(!b.taunt) errors.push('taunt is missing: one line to the player that quotes a number from their file');
    const items=Array.isArray(raw.items)?raw.items:[];
    if(items.length!==2) errors.push('items must hold exactly two items: [MAIN, SIDE]');
    items.slice(0,2).forEach((it,i)=>{
      const at='items['+i+']'; if(!it||typeof it!=='object'){ errors.push(at+' is not an object'); return; }
      const base=String(it.base||'').toLowerCase(); if(!BASES.includes(base)){ errors.push(at+'.base is "'+text(base,16)+'": it must be one of '+BASES.join(', ')); return; }
      const s=D.stockItem(base,'none').spec, element=D.ELS.includes(it.element)?it.element:'none';
      let ink=+it.ink; if(!Number.isFinite(ink)){ errors.push(at+'.ink must be a number'); ink=INK_EACH[0]; }
      if(ink<INK_EACH[0]||ink>INK_EACH[1]) errors.push(at+'.ink is '+ink+': it must be between '+INK_EACH[0]+' and '+INK_EACH[1]);
      const trait=s.traits.includes(it.trait)?it.trait:s.traits[0]; if(it.trait!==undefined&&!s.traits.includes(it.trait)) errors.push(at+'.trait is "'+text(it.trait,14)+'": a '+base+' has '+s.traits.join(' or '));
      const tune=Math.max(-2,Math.min(2,Math.round(+it.tune||0))), name=text(it.name,22)||s.name, abilities=[];
      const given=Array.isArray(it.abilities)?it.abilities:[];
      if(i===1&&given.length) errors.push(at+'.abilities: SIDE carries none');
      if(i===0&&given.length>n) errors.push(at+'.abilities: MAIN may carry '+n+', not '+given.length);
      if(i===0) for(const g of given.slice(0,n)){
        const v=A.verifyAbility(g,{kind:s.kind,style:s.style,element,name,power:s.power,range:s.range,speed:s.speed,traits:s.traits,trait});
        if(v.ok) abilities.push(Object.assign({},v.spec||D.abilityClean(g,s.kind,s.style),{src:'ai'})); else errors.push(at+' ability "'+text(g&&g.name,18)+'": '+v.errors.slice(0,2).join('; '));
      }
      b.items.push({base,element,ink:Math.round(ink),trait,tune,name,abilities});
    });
    if(b.items.length===2){
      if(b.items[0].base===b.items[1].base) errors.push('the two items have the same base: pick two different ones');
      const sum=b.items[0].ink+b.items[1].ink; if(sum>INK) errors.push('the two items take '+sum+' ink together: '+INK+' at most');
    }
    return {build:errors.length?null:b,errors};
  }

  // The two items of a build as specs the rules can make (and the strokes of their pictures).
  function arm(build){
    return build.items.map((it,i)=>{ const s=D.stockItem(it.base,it.element), n=it.abilities.length;
      Object.assign(s.spec,{name:it.name,trait:it.trait,tune:it.tune,creativity:i===0?scoreFor(n):2,why:n?'Built to beat you.':'A plain ready-made item.',abilities:it.abilities});
      return {spec:s.spec,cost:it.ink,strokes:s.strokes}; });
  }

  // The player as a sparring partner: the game's own bot holding their weapons, as skilled as their damage says and with their habits.
  function clone(reports,items){
    const rs=(reports||[]).slice(-3), avg=k=>rs.length?rs.reduce((n,r)=>n+(+r[k]||0),0)/rs.length:0;
    const dealt=rs.reduce((n,r)=>n+r.items.reduce((m,it)=>m+(it?it.dealt:0),0),0), taken=rs.reduce((n,r)=>n+r.taken,0);
    const skill=rs.length?Math.max(0.3,Math.min(0.9,0.3+0.6*dealt/Math.max(1,dealt+taken))):0.55;
    return {skill:+skill.toFixed(2),habit:{far:+(avg('far')/100).toFixed(2),near:+(avg('near')/100*0.7).toFixed(2),jumps:+Math.max(0,(avg('jumpsPerMin')-20)/60).toFixed(2)},items:(items||[]).filter(Boolean)};
  }

  function match(arms,cl,seed,skill){
    const S=D.createDuel({seed,compile:A.compile});
    cl.items.slice(0,2).forEach((it,k)=>S.setItem(0,k,it.spec,it.cost)); arms.forEach((a,k)=>S.setItem(1,k,a.spec,a.cost));
    const me=D.makeBot(1,()=>skill,seed+2), you=D.makeBot(0,()=>cl.skill,seed+1,cl.habit); let t=0, fires=0, faults=0;
    while(S.phase!=='over'&&t<400){ t+=1/60; if(S.phase==='draw'){ S.setReady(0); S.setReady(1); } you(S,1/60); me(S,1/60); S.step(1/60);
      for(const e of S.events.splice(0)){ if(e.e==='ab'&&e.side===1) fires++; else if(e.e==='abfault'&&e.side===1) faults++; } }
    return {mine:S.scout[1],fires,faults,sane:S.sane()};
  }
  // Practice rounds of these items against the copy of the player. skill: how well the machine itself plays (the room's setting).
  function spar(arms,cl,o){
    const want=Math.max(10,Math.min(120,(o&&o.rounds)|0||40)), seed=((o&&o.seed)|0)||777, skill=o&&o.skill>0?o.skill:0.55, t0=Date.now(), rs=[]; let fires=0, faults=0, sane=true, crash='';
    try{ for(let i=0;rs.length<want&&i<want;i++){ const m=match(arms,cl,seed+i*17,skill); rs.push(...m.mine); fires+=m.fires; faults+=m.faults; sane=sane&&m.sane; } }catch(e){ crash=String(e&&e.message||e).slice(0,140); }
    const n=Math.max(1,rs.length), won=rs.filter(r=>r.won).length, avg=f=>Math.round(rs.reduce((a,r)=>a+f(r),0)/n);
    const problems=[]; if(crash) problems.push('CRASH: a practice match threw "'+crash+'"'); if(!sane) problems.push('BROKEN: a fighter ended up with impossible numbers'); if(faults) problems.push('FAULTS: an ability failed '+faults+' times');
    if(arms[0]&&(arms[0].spec.abilities||[]).length&&!fires&&!crash) problems.push('DEAD ABILITY: its abilities never fired in '+n+' rounds');
    return {ok:!problems.length,problems,rounds:rs.length,winPct:Math.round(100*won/n),roundSeconds:avg(r=>r.secs),myHealthLeftPct:avg(r=>r.hpLeft),damageTakenPerRound:avg(r=>r.taken),
      mainDamagePerRound:avg(r=>r.items[0]?r.items[0].dealt:0),sideDamagePerRound:avg(r=>r.items[1]?r.items[1].dealt:0),sideUsesPerRound:avg(r=>r.items[1]?r.items[1].uses:0),abilityFiresPerRound:+(fires/n).toFixed(1),ms:Date.now()-t0};
  }

  // The player's habits as lines a person can read (the machine's file on them, and its taunts, start from these).
  function read(reports){
    const rs=(reports||[]).slice(-3); if(!rs.length) return [];
    const avg=k=>Math.round(rs.reduce((n,r)=>n+(+r[k]||0),0)/rs.length), out=[], by={};
    for(const r of rs) for(const it of r.items) if(it){ const o=by[it.name]||(by[it.name]={name:it.name,kind:it.kind,uses:0,dealt:0}); o.uses+=it.uses; o.dealt+=it.dealt; }
    const far=avg('far'), near=avg('near');
    out.push(far>=50?'keeps at long range '+far+'% of the time':near>=50?'fights up close '+near+'% of the time':'drifts: far '+far+'%, close '+near+'%');
    out.push('in the air '+avg('air')+'% of the time, '+avg('jumpsPerMin')+' jumps a minute');
    out.push('backs away '+avg('back')+'% of the time, stands still '+avg('still')+'%, near a wall '+avg('corner')+'%');
    if(avg('block')>=4) out.push('behind a shield '+avg('block')+'% of the time');
    for(const o of Object.values(by)) out.push(o.name+' ('+o.kind+'): used '+Math.round(o.uses/rs.length)+' times a round for '+Math.round(o.dealt/rs.length)+' damage');
    out.push('won '+rs.filter(r=>r.won).length+' of the last '+rs.length+' rounds; rounds last '+avg('secs')+' s');
    return out;
  }
  return {manual,clean,arm,clone,spar,read,BASES,INK};
};
