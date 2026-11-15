// Doodle Duel headband. Six vibration motors and two small speakers around the head, driven by an Arduino over USB
// (Web Serial: Chrome or Edge on a computer). The page calls HAP.see(previous, snapshot) once per snapshot and
// HAP.hear(event) for every game event; nothing in the rules or the server knows about the headband, and every hook in
// duel.html checks window.HAP, so the page works without this file.
//
// Lines sent to the board (hardware/headband/headband.ino documents the same list):
//     M <front> <back> <left> <right> <left temple> <right temple>   motor levels 0-255, about 30 a second while a
//                                                                    pattern plays; 400 ms with none -> motors off
//     S <n> [L|R|B]               sound effect n at full volume on one side or both
//     V <n> <volL> <volR>         sound effect n with a volume per speaker, 0-100 (how a hit's side is heard)
//     T <L|R|B> <freq> <ms>       one beep
//     W <f0> <f1> <ms> <volL> <volR>   incoming whoosh: a sweep that rises in pitch and volume until the shot lands
//     F <L|R|B> <level>           footsteps that keep going, level 0-100; resent every 250 ms; F X stops them
// Sound effects: 1-16 are the hardware team's (swoosh, hurt, zap, chime, levelup, steps, pans, approach ramps); 17 on
// are SOUNDS below. The board has one voice: a new sound cuts the one playing, and footsteps wait under it.
//
// The patterns run here, written as functions of time so that they can overlap and never queue. Nothing on the board
// waits, so the delay from a hit to the buzz is one serial line.
//
// What the game does not say, this works out from two snapshots in a row: what kind of attack a hit was (the shot that
// vanished next to the wearer, or the move the attacker was in), shots about to land on the wearer, and the foe's steps.
// Direction is the screen's: a hit event's dir 'L' means the wearer was knocked left, so struck on the right.
//
// Try it from the browser console, no match needed (the board must be connected):
//     HAP.play('slash',1,'L')      a pattern, optional side L or R          HAP.patterns lists them
//     HAP.sound('arrow','R')       a sound on one side; HAP.sound('slash',100,20) with a volume per side
//     HAP.attack('stab','L',0.8)   what being hit feels and sounds like: kind, side it came from, weight 0-1. Light
//                                  melee hits climb the ladder: HAP.attack('slash','L',0.2) four times quickly.
//                                  A fourth argument true = struck from behind, a fifth true = a finisher (dizzy).
//     HAP.incoming('R',500)        a shot rising in from the right, landing in 500 ms
//     HAP.steps('L',80)            the foe's steps on the left, level 0-100; HAP.steps() stops them
//     HAP.demo()                   every attack kind, left then right
//     HAP.demoRow('L')             the ladder: four light hits in a row, a pause, then one alone
(function(){
  'use strict';
  const N=6, ALL=[1,1,1,1,1,1];
  const RIGHT=[0.35,0,0,1,0,1], LEFT=[0.35,0,1,0,1,0];      // motors: 0 front, 1 back, 2 left, 3 right, 4 left temple, 5 right temple
  const ROUND=[0,3,1,2];                                    // front, right, back, left
  const noise=(a,b)=>{ const h=Math.sin(a*12.9898+b*78.233)*43758.5453; return h-Math.floor(h); };
  const on=(t,a,b)=>t>=a&&t<b?1:0;

  // Tuning. Melee hits climb a ladder: one alone is a single motor tapping on the side it came from, each further
  // hit within ROW_GAP seconds adds a motor and strength, and the fourth in a row, or any hit of HEAVY weight or
  // more, plays the attack's full pattern. Shots, magic, thrown things, blasts and ultimates always play in full.
  // A new hit replaces the pattern that is playing. OTHER_VOL is how loud a hit is in the far ear.
  const HEAVY=0.5, ROW_GAP=1.2, ROW_FULL=4, OTHER_VOL=20;
  const BLAST_NEAR=250;         // px: a blast this close is felt even when it does no damage
  const DIZZY_FIN=true;         // a melee finisher leaves the head spinning (the dizzy pattern after the blow)
  const INCOMING_MAX=0.7;       // seconds: a shot further away than this is not announced yet
  const FOOT_NEAR=240;          // px: footsteps only inside this distance, and only while the foe walks closer
  const BURN_EVERY=0.8;         // seconds between pulses while burning

  // Motors on one side: which is that side, its temple, and the other two. lead 'L', 'R' or null (both).
  const sides=lead=>lead==='L'?{s:2,t:4,o:3,ot:5}:lead==='R'?{s:3,t:5,o:2,ot:4}:null;
  const six=(f,b,l,r,lt,rt)=>[f,b,l,r,lt,rt], EVERY=[1,1,1,1,1,1];      // EVERY: all six, whatever side the blow came from
  // A level on the lead side's motors (side and temple), with some on the front; both sides when lead is null.
  function lean(lead,v,front,far){ const o=[front*v,0,0,0,0,0], q=sides(lead);
    if(!q){ o[2]=o[3]=o[4]=o[5]=v; return o; }
    o[q.s]=v; o[q.t]=v; o[q.o]=(far||0)*v; o[q.ot]=(far||0)*v; return o; }

  // Each pattern: how long it lasts, and its strength at time t (one number for every motor it plays on, or six
  // numbers). `lead` is the side the hit came from ('L', 'R' or null).
  const PATTERNS={
    thud:{dur:0.15,fn:()=>0.9},
    strong:{dur:0.39,fn:t=>on(t,0,0.08)+on(t,0.14,0.39)},
    block:{dur:0.14,fn:t=>on(t,0,0.06)+0.55*on(t,0.1,0.14)},
    fire:{dur:0.5,fn:t=>{ const k=Math.floor(t/0.045); return ALL.map((_,i)=>noise(k,i)>0.6?0.45+0.55*noise(i,k):0); }},
    water:{dur:0.5,fn:t=>(t%0.05)<0.025?0.5:0},                                               // a cold shiver
    plant:{dur:0.6,fn:t=>0.25+0.55*Math.sin(Math.PI*t/0.6)},                                  // swells and fades
    crit:{dur:0.98,fn:t=>on(t,0,0.4)+on(t,0.5,0.58)+on(t,0.64,0.72)+on(t,0.78,0.98)},
    heal:{dur:0.8,fn:t=>0.2+0.5*Math.sin(Math.PI*t/0.8)},
    cast:{dur:0.88,fn:t=>{ const k=Math.floor(t/0.11)%4, o=[0,0,0,0,0,0]; if((t%0.11)<0.09) o[ROUND[k]]=0.8; return o; }},
    heart:{dur:0.9,fn:t=>0.75*(on(t,0,0.07)+on(t,0.17,0.24)+on(t,0.66,0.73)+on(t,0.83,0.9))},
    quake:{dur:0.45,fn:t=>(1-t/0.45)*(0.55+0.45*Math.sin(t*70))},
    ko:{dur:1.3,fn:t=>1-0.75*t/1.3},                                                          // fades out
    win:{dur:0.57,fn:t=>t<0.1?[0,0,0,0,0.5,0.5]:t<0.16?0:t<0.26?[0,0,0.7,0.7,0,0]:t<0.32?0:1},

    // One per kind of attack. Nothing in them is shorter than about 70 ms: the motors blur anything faster. They lead
    // from the side the blow came from, and differ in where, how long and what rhythm, not in strength.
    tap:{dur:0.1,fn:()=>1}, tap2:{dur:0.14,fn:()=>1}, tap3:{dur:0.18,fn:()=>1},                // the ladder: played on one, two, three motors
    jab:{dur:0.22,fn:(t,lead)=>lean(lead,1,0.7)},                                              // a heavy stab or punch: one hard pulse on that side
    stab:{dur:0.28,fn:(t,lead)=>t<0.04?lean(lead,1,0.6):t<0.16?0:lean(lead,0.55,0.8)},         // a sharp sting, then a throb
    slash:{dur:0.5,fn:(t,lead)=>{ const q=sides(lead)||sides('L'), o=[0,0,0,0,0,0];             // a slow sweep across the head, 100 ms a motor, no buzz after
      o[[q.s,q.t,0,q.ot,q.o][Math.min(4,Math.floor(t/0.1))]]=1; return o; }},
    shot:{dur:0.24,fn:(t,lead)=>t<0.07?lean(lead,1,0.2):t<0.12?0:six(0,0.85,0,0,0,0)},         // a spike on that side, then out through the back
    arrow:{dur:0.26,fn:(t,lead)=>t<0.04?lean(lead,1,0.3):t<0.16?0:lean(lead,0.6,0)},           // the board's arrow: sting, gap, throb
    smash:{dur:0.72,fn:t=>t<0.14?EVERY:t<0.28?0:t<0.5?EVERY:six(0,1-(t-0.5)/0.22,0,0,0,0)},            // two heavy beats on everything, a clear gap, the back trails off
    punch:{dur:0.17,fn:(t,lead)=>on(t,0,0.06)||on(t,0.1,0.17)?lean(lead,0.85,0.5):0},           // two quick knocks
    thrown:{dur:0.3,fn:(t,lead)=>t<0.18?((t%0.06)<0.03?lean(lead,0.45,0):0):lean(lead,0.9,0.5)},   // a wobble, then the thunk
    magic:{dur:0.5,fn:(t,lead)=>{ const start=lead==='L'?3:lead==='R'?1:0;                     // around the head, starting on the hit side
      if(t>=0.36) return 0.35; const k=Math.floor(t/0.06), o=[0,0,0,0,0,0]; if((t%0.06)<0.05) o[ROUND[(start+k)%4]]=0.85; return o; }},
    explosion:{dur:0.95,fn:t=>t<0.22?EVERY:t<0.6?EVERY.map(()=>0.9*(1-(t-0.22)/0.38)+0.1):six(0,0.7*(1-(t-0.6)/0.35),0,0,0,0)},   // full, a fading rumble, the back last
    lightning:{dur:0.74,fn:t=>{ if(t>=0.48) return t>=0.56?EVERY:0;                                // a slow crackle from motor to motor, a gap, the strike
      const k=Math.floor(t/0.08), o=[0,0,0,0,0,0]; o[Math.floor(noise(k,3)*6)]=1; return o; }},
    burn:{dur:0.55,fn:t=>0.25+0.3*Math.sin(Math.PI*t/0.55)},                                   // damage over time: a slow swell
    dizzy:{dur:1.5,fn:t=>{ const order=[0,5,3,1,2,4], k=Math.floor(t/0.125)%6, o=[0,0,0,0,0,0]; o[order[k]]=0.8; return o; }}   // twice round the head, slowly
  };

  // Sounds on the board by name (S, V and the console). 1-16 are the board's own.
  const SOUNDS={swoosh:1,hurt:2,zap:3,chime:4,levelup:5,
    stab:17,slash:18,shot:19,arrow:20,magic:21,fire:22,water:23,plant:24,smash:25,punch:26,clank:27,
    lightning:28,explosion:29,burn:30,thrown:31,ultimate:32,step:33};
  // Each kind of attack: its pattern, its sound, and the whoosh of a shot of that kind coming in (Hz from, to).
  const KINDS={
    slash:{pat:'slash',snd:'slash'}, stab:{pat:'jab',snd:'stab'}, smash:{pat:'smash',snd:'smash'},
    punch:{pat:'jab',snd:'punch'}, thud:{pat:'jab',snd:'hurt'},
    shot:{pat:'shot',snd:'shot',fly:[1400,3200]}, arrow:{pat:'arrow',snd:'arrow',fly:[1100,2600]},
    magic:{pat:'magic',snd:'magic',fly:[400,1600]}, thrown:{pat:'thrown',snd:'thrown',fly:[600,1400]},
    explosion:{pat:'explosion',snd:'explosion',fly:[300,900]}, lightning:{pat:'lightning',snd:'lightning',fly:[1800,4200]},
    ultblow:{pat:'thud',snd:'magic'},      // each blow of an ultimate before the last
    ult:{pat:'crit',snd:'ultimate'}
  };
  // These always play their whole pattern; the rest are melee and climb the ladder.
  const ALWAYS={shot:1,arrow:1,magic:1,thrown:1,explosion:1,lightning:1,ultblow:1,ult:1};

  const enc=new TextEncoder();
  let active=[], timer=null, port=null, writer=null, reader=null, side=0, readyAt=0; const listeners=[];
  let warned=new Set(), foot=null, footAt=0, burnAt=0, elTimer=null, hitAt=0, row=0, rowAt=0, dizzyTimer=null;
  try{ side=localStorage.getItem('dd-hap-side')==='1'?1:0; }catch(e){}
  const tell=()=>{ for(const fn of listeners) fn(!!writer); };
  function write(text){ if(writer) writer.write(enc.encode(text)).catch(()=>drop()); }
  function tick(){
    const now=performance.now()/1000, out=[0,0,0,0,0,0];
    active=active.filter(a=>now-a.t0<a.p.dur);
    for(const a of active){ const v=a.p.fn(now-a.t0,a.lead);
      for(let i=0;i<N;i++) out[i]=Math.max(out[i],(typeof v==='number'?v*a.mask[i]:v[i])*a.gain); }
    // Sent on every tick while something is playing; the last line of a pattern is all zeros.
    write('M '+out.map(v=>Math.round(Math.max(0,Math.min(1,v))*255)).join(' ')+'\n');
    if(!active.length){ clearInterval(timer); timer=null; }
  }
  // play(name, gain, side): side is 'L' or 'R' (the side it came from), or a six-number mask as before.
  function play(name,gain,dir){
    const p=PATTERNS[name]; if(!p||!writer) return;
    const lead=dir==='L'||dir==='R'?dir:null, mask=Array.isArray(dir)?dir:lead==='L'?LEFT:lead==='R'?RIGHT:ALL;
    active.push({p,t0:performance.now()/1000,gain:Math.max(0.3,Math.min(1,gain==null?1:gain)),mask,lead});
    if(active.length>8) active.shift();
    if(!timer) timer=setInterval(tick,33);
    tick();      // the first levels go out now, not on the next timer beat
  }
  // sound(name, 'L'|'R'|'B') or sound(name, volL, volR). Volumes 0-100.
  function sound(name,a,b){
    const n=typeof name==='number'?name:SOUNDS[name]; if(!n||!writer) return;
    if(typeof a==='number') write('V '+n+' '+Math.round(Math.max(0,Math.min(100,a)))+' '+Math.round(Math.max(0,Math.min(100,b==null?a:b)))+'\n');
    else write('S '+n+' '+(a==='L'||a==='R'?a:'B')+'\n');
  }
  // A sound heard from one side: loud in that ear, OTHER_VOL of it in the other. lead null: both ears.
  function soundFrom(name,lead,vol){ const v=Math.round(vol==null?100:vol), o=Math.round(v*OTHER_VOL/100);
    sound(name,lead==='R'?o:v,lead==='L'?o:v); }
  function whoosh(kind,lead,ms){ const k=KINDS[kind]||KINDS.shot, f=k.fly||[600,2200];
    write('W '+f[0]+' '+f[1]+' '+Math.round(Math.max(80,Math.min(700,ms)))+' '+(lead==='R'?15:100)+' '+(lead==='L'?15:100)+'\n'); }
  function steps(lead,level){
    if(!lead){ if(foot){ write('F X\n'); foot=null; } return; }
    const lv=Math.round(Math.max(0,Math.min(100,level==null?60:level)));
    write('F '+lead+' '+lv+'\n'); foot={lead,lv}; footAt=performance.now();
  }
  function drop(){
    try{ if(writer) writer.releaseLock(); }catch(e){}
    const p=port, r=reader; writer=null; port=null; reader=null; active=[]; foot=null; warned=new Set();
    Promise.resolve(r&&r.cancel()).catch(()=>{}).then(()=>{ try{ if(r) r.releaseLock(); }catch(e){} return p&&p.close(); }).catch(()=>{});
    tell();
  }
  async function open(p){
    await p.open({baudRate:115200});
    port=p; writer=p.writable.getWriter();
    // The board prints text now and then. Read it and throw it away so that it can never back up.
    const r=reader=p.readable.getReader();
    (async()=>{ try{ for(;;){ const {done}=await r.read(); if(done) break; } }catch(e){} })();
    // An Uno or Nano restarts when the port opens and hears nothing for about two seconds: say hello after that.
    readyAt=performance.now()+2200; setTimeout(()=>{ if(port===p) play('win',1); },2200);
    tell();
  }
  async function connect(){
    if(!navigator.serial) throw new Error('This browser cannot talk to USB devices. Use Chrome or Edge on a computer.');
    await open(await navigator.serial.requestPort());
  }

  // What kind of attack a hit was. The shot that was next to the wearer and is gone now, or a bomb going off there, or
  // the move the attacker is in. Move and shot names start with the weapon style (blade2, spear_run, bow_shot).
  function moveKind(m){
    if(/^(blade|dual)/.test(m)) return 'slash';
    if(/^spear/.test(m)) return 'stab';
    if(/^hammer/.test(m)) return 'smash';
    if(/^bow/.test(m)) return 'arrow';
    if(/^(gun|akimbo)/.test(m)) return 'shot';
    if(/^staff/.test(m)) return 'magic';
    if(/^hurl/.test(m)) return 'thrown';
    if(/^(ult|fleet)/.test(m)) return 'magic';
    return 'punch';      // fists, kicks, mining, an empty hand
  }
  function shotKind(q){
    if(q.k==='bomb') return 'explosion';
    if(q.k==='bolt') return 'lightning';
    switch(q.st){
      case 'bow': return 'arrow'; case 'gun': case 'akimbo': return 'shot'; case 'staff': return 'magic';
      case 'hurl': return 'thrown'; case 'swave': return 'smash'; case 'echo': return 'slash'; case 'fleet': return 'magic';
    }
    return 'shot';
  }
  function classify(p,v,e){
    if(e.ult) return e.fin?'ult':'ultblow';
    if(e.hap==='slam') return 'smash';
    const A=1-e.side, me=v.f&&v.f[e.side];
    if(p&&p.pr&&v.pr&&me){ const still=new Set(v.pr.map(q=>q.id)); let best=null, bd=1e9;
      for(const q of p.pr){ if(q.side!==A||still.has(q.id)) continue; const d=Math.abs(q.x-me.x); if(d<bd){ bd=d; best=q; } }
      if(best&&bd<160) return shotKind(best); }
    if(v.ev.some(q=>q.e==='boom'&&Math.abs(q.x-e.x)<160)) return 'explosion';
    const act=(v.f&&v.f[A]&&v.f[A].act)||(p&&p.f&&p.f[A]&&p.f[A].act);
    if(act&&act.m) return moveKind(act.m);
    return 'thud';
  }

  // Once per snapshot, before its events are heard: name the kind of every hit, announce shots about to land on the
  // wearer, follow the foe's steps, and pulse while the wearer burns.
  function see(p,v){
    if(!v||!v.ev) return;
    for(const e of v.ev) if(e.e==='hit'&&!e.kind){ e.kind=classify(p,v,e);
      // Struck from behind: the blow came from the side the fighter is not facing (dir 'L' = came from the right).
      const t=v.f&&v.f[e.side]; if(t&&t.face) e.behind=(e.dir==='L'?1:-1)!==Math.sign(t.face); }
    // A blast that did not hit the wearer: how close it was, 0 to 1 (felt in hear).
    { const w=v.f&&v.f[side], struck=v.ev.some(e=>e.e==='hit'&&e.side===side);
      for(const e of v.ev) if(e.e==='boom'&&e.near===undefined) e.near=struck||!w?0:Math.max(0,1-Math.abs(e.x-w.x)/BLAST_NEAR); }
    if(!writer) return;
    const fight=v.phase==='fight'||v.practice, me=v.f&&v.f[side], foe=v.f&&v.f[1-side], now=performance.now();
    if(!fight||!me||!foe){ steps(null); return; }
    // Shots coming in: a foe's shot moving toward the wearer that will reach the body height within INCOMING_MAX.
    const here=new Set();
    for(const q of v.pr||[]){ here.add(q.id);
      if(q.side===side||q.h||q.z||warned.has(q.id)) continue;
      const dx=me.x-q.x, gap=Math.max(0,Math.abs(dx)-16); if(Math.abs(q.vx)<80||q.vx*dx<=0) continue;
      const tti=gap/Math.abs(q.vx), y=q.y+(q.k==='bomb'?0:q.vy*tti);
      if(tti>INCOMING_MAX||tti<0.06||y<me.y-30||y>me.y+140) continue;
      warned.add(q.id); whoosh(shotKind(q),q.x<me.x?'L':'R',tti*1000);
    }
    for(const id of warned) if(!here.has(id)) warned.delete(id);
    // Footsteps: only while the foe walks on the ground toward the wearer, and is close.
    const dist=Math.abs(foe.x-me.x), toward=foe.g&&Math.abs(foe.vx)>40&&Math.sign(foe.vx)===Math.sign(me.x-foe.x);
    if(toward&&dist<FOOT_NEAR&&!v.ul){
      const lead=foe.x<me.x?'L':'R', lv=Math.round(100*Math.max(0,Math.min(1,1-(dist-40)/(FOOT_NEAR-40))));
      if(!foot||foot.lead!==lead||Math.abs(foot.lv-lv)>=5||now-footAt>250) steps(lead,lv);
    } else steps(null);
    // Burning: damage over time gets its own slow pulse, not a thud per tick.
    if(me.burn&&now-burnAt>BURN_EVERY*1000){ burnAt=now; play('burn',0.6); sound('burn',40,40); }
  }

  // What being hit by one kind of attack feels and sounds like. lead: the side it came from; behind: it landed on
  // the fighter's back, so the back motor takes the place of the side one.
  function strike(name,gain,dir){ active=[]; clearTimeout(dizzyTimer); play(name,gain,dir); }      // a new blow replaces the one playing
  function ladder(n,lead,behind){ const q=sides(lead)||sides('L'), m=[0,0,0,0,0,0];
    m[behind?1:q.s]=1; if(n>1) m[behind?q.s:q.t]=1; if(n>2) m[behind?q.t:0]=1;
    strike(n>2?'tap3':n>1?'tap2':'tap',n>2?1:n>1?0.8:0.6,m); }
  function attack(kind,lead,w,el,behind,fin){
    const k=KINDS[kind]||KINDS.thud, now=performance.now(); hitAt=now;
    row=now-rowAt<ROW_GAP*1000?row+1:1; rowAt=now;
    const full=ALWAYS[kind]||w>=HEAVY||row>=ROW_FULL;
    if(full){ strike(k.pat,ALWAYS[kind]?0.55+0.45*w:0.7+0.3*w,lead);
      if(behind&&!ALWAYS[kind]) play('tap2',1,[0,1,0,0,0,0]);
      if(DIZZY_FIN&&fin&&!ALWAYS[kind]) dizzyTimer=setTimeout(()=>play('dizzy',0.8),PATTERNS[k.pat].dur*1000+60); }
    else ladder(row,lead,behind);
    soundFrom(k.snd,kind==='ult'?null:lead,55+45*w);
    // An element is felt on top and heard just after the blow (the board plays one sound at a time).
    if(el==='fire'||el==='water'||el==='plant'){ if(full) play(el,0.4+0.5*w);
      clearTimeout(elTimer); elTimer=setTimeout(()=>soundFrom(el,lead,45+40*w),140); }
  }

  // What the wearer feels for one game event. `e.side` is the fighter it happened to (for `ko`, the winner).
  function hear(e){
    if(!writer||!e) return;
    switch(e.e){
      case 'hit': { if(e.side!==side) return;
        const w=e.w!==undefined?e.w:Math.min(1,(e.n||0)/18);
        attack(e.kind||(e.hap==='slam'?'smash':'thud'),e.dir==='L'?'R':'L',w,e.el,e.behind,e.fin);      // knocked to the left means struck on the right
        break; }
      case 'block': if(e.side===side){ const lead=e.dir==='L'?'R':'L'; play('block',0.8,lead); soundFrom('clank',lead,80); } break;
      case 'heal': if(e.side===side){ play('heal',0.8); sound('chime',50,50); } break;
      case 'ult': play(e.side===side?'cast':'heart',1); sound(e.side===side?'levelup':'zap','B'); break;
      case 'quake': play('quake',0.7); sound('smash','B'); break;
      case 'boom': if(e.near>0){ strike('explosion',0.45+0.55*e.near); const v=30+60*e.near; sound('explosion',v,v); }      // a blast nearby that did not hit the wearer
        else if(e.near===undefined&&performance.now()-hitAt>150) sound('explosion',45,45); break;
      case 'tg': if(e.k==='on'&&e.side===side&&e.id==='mirror') play('dizzy',0.8); break;      // left and right swapped
      case 'ko': steps(null); play(e.side===side?'win':'ko',1); sound(e.side===side?'levelup':'hurt','B'); break;
    }
  }

  // Every attack kind, left then right, one every 0.9 s (console).
  function demo(){ const list=Object.keys(KINDS); let i=0;
    const next=()=>{ if(i>=list.length*2||!writer) return; const kind=list[i>>1], lead=i%2?'R':'L'; i++;
      console.log('headband:',kind,'from',lead); attack(kind,lead,1); setTimeout(next,1600); };
    next(); }
  // The ladder (console): four light slashes in a row from one side, then a pause and one alone.
  function demoRow(lead){ lead=lead==='R'?'R':'L'; for(let i=0;i<4;i++) setTimeout(()=>attack('slash',lead,0.2),i*450);
    setTimeout(()=>attack('slash',lead,0.2),4*450+ROW_GAP*1000+300); }
  const need=fn=>(...a)=>{ if(!writer) console.warn('headband: not connected (Game setup -> Headband)'); return fn(...a); };

  if(navigator.serial){
    if(navigator.serial.addEventListener) navigator.serial.addEventListener('disconnect',e=>{ if(port&&(e.target===port||e.port===port)) drop(); });
    // A board this browser was already allowed to use is opened again without asking.
    if(navigator.serial.getPorts) navigator.serial.getPorts().then(ps=>{ if(ps.length===1&&!port) return open(ps[0]); }).catch(()=>{});
  }
  window.HAP={
    supported:!!navigator.serial, patterns:Object.keys(PATTERNS), sounds:Object.keys(SOUNDS), kinds:Object.keys(KINDS),
    connect, disconnect:drop, play:need(play), hear, see,
    sound:need(sound), attack:need((kind,lead,w,behind,fin)=>attack(kind,lead,w==null?1:w,null,behind,fin)),
    incoming:need((lead,ms)=>whoosh('arrow',lead,ms||500)), steps:need(steps), demo:need(demo), demoRow:need(demoRow),
    connected:()=>!!writer,
    onStatus(fn){ listeners.push(fn); },
    get side(){ return side; },
    set side(v){ side=v?1:0; steps(null); try{ localStorage.setItem('dd-hap-side',String(side)); }catch(e){} }
  };
})();
