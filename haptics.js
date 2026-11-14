// Doodle Duel headband. Six vibration motors around the head, driven by an Arduino over USB (Web Serial: Chrome or Edge
// on a computer). The page calls HAP.hear(event) for every game event; nothing in the rules or the server knows about
// the headband, and every hook in duel.html checks window.HAP, so the page works without this file.
//
// The patterns run here. While one is playing, the board is sent one line about 30 times a second:
//     M <front> <back> <left> <right> <left temple> <right temple>      each 0 to 255
// and only copies the numbers to its pins (hardware/headband/headband.ino). Nothing on the board waits, so the delay
// from a hit to the buzz is one serial line. If the lines stop for 400 ms the board switches the motors off.
//
// The patterns follow the ones the hardware team tuned on the board (hit, strong, block, crit, fire, freeze, heal,
// death, levelup, cast, heartbeat), written as functions of time so that they can overlap and never queue.
(function(){
  'use strict';
  const N=6, ALL=[1,1,1,1,1,1];
  const RIGHT=[0.35,0,0,1,0,1], LEFT=[0.35,0,1,0,1,0];      // motors: 0 front, 1 back, 2 left, 3 right, 4 left temple, 5 right temple
  const ROUND=[0,3,1,2];                                    // front, right, back, left
  const noise=(a,b)=>{ const h=Math.sin(a*12.9898+b*78.233)*43758.5453; return h-Math.floor(h); };
  const on=(t,a,b)=>t>=a&&t<b?1:0;
  // Each pattern: how long it lasts, and its strength at time t (one number for every motor it plays on, or six numbers).
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
    win:{dur:0.57,fn:t=>t<0.1?[0,0,0,0,0.5,0.5]:t<0.16?0:t<0.26?[0,0,0.7,0.7,0,0]:t<0.32?0:1}
  };
  const enc=new TextEncoder();
  let active=[], timer=null, port=null, writer=null, reader=null, side=0, readyAt=0; const listeners=[];
  try{ side=localStorage.getItem('dd-hap-side')==='1'?1:0; }catch(e){}
  const tell=()=>{ for(const fn of listeners) fn(!!writer); };
  function write(text){ if(writer) writer.write(enc.encode(text)).catch(()=>drop()); }
  function tick(){
    const now=performance.now()/1000, out=[0,0,0,0,0,0];
    active=active.filter(a=>now-a.t0<a.p.dur);
    for(const a of active){ const v=a.p.fn(now-a.t0);
      for(let i=0;i<N;i++) out[i]=Math.max(out[i],(typeof v==='number'?v*a.mask[i]:v[i])*a.gain); }
    // Sent on every tick while something is playing; the last line of a pattern is all zeros.
    write('M '+out.map(v=>Math.round(Math.max(0,Math.min(1,v))*255)).join(' ')+'\n');
    if(!active.length){ clearInterval(timer); timer=null; }
  }
  function play(name,gain,mask){
    const p=PATTERNS[name]; if(!p||!writer) return;
    active.push({p,t0:performance.now()/1000,gain:Math.max(0.3,Math.min(1,gain==null?1:gain)),mask:mask||ALL});
    if(active.length>8) active.shift();
    if(!timer) timer=setInterval(tick,33);
    tick();      // the first levels go out now, not on the next timer beat
  }
  function drop(){
    try{ if(writer) writer.releaseLock(); }catch(e){}
    const p=port, r=reader; writer=null; port=null; reader=null; active=[];
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
  // What the wearer feels for one game event. `e.side` is the fighter it happened to (for `ko`, the winner).
  function hear(e){
    if(!writer||!e) return;
    switch(e.e){
      case 'hit': { if(e.side!==side) return;
        const w=e.w!==undefined?e.w:Math.min(1,(e.n||0)/18), gain=0.45+0.55*w;
        const from=e.dir==='L'?RIGHT:LEFT;      // knocked to the left means struck on the right
        if(e.ult&&e.fin) play('crit',1);
        else if(e.el==='fire'||e.el==='water'||e.el==='plant'){ play('thud',gain,from); play(e.el,gain); }
        else play(w>0.7?'strong':'thud',gain,from);
        break; }
      case 'block': if(e.side===side) play('block',0.8); break;
      case 'heal': if(e.side===side) play('heal',0.8); break;
      case 'ult': play(e.side===side?'cast':'heart',1); break;
      case 'quake': play('quake',0.7); break;
      case 'ko': play(e.side===side?'win':'ko',1); break;
    }
  }
  if(navigator.serial){
    if(navigator.serial.addEventListener) navigator.serial.addEventListener('disconnect',e=>{ if(port&&(e.target===port||e.port===port)) drop(); });
    // A board this browser was already allowed to use is opened again without asking.
    if(navigator.serial.getPorts) navigator.serial.getPorts().then(ps=>{ if(ps.length===1&&!port) return open(ps[0]); }).catch(()=>{});
  }
  window.HAP={
    supported:!!navigator.serial, patterns:Object.keys(PATTERNS),
    connect, disconnect:drop, play, hear,
    connected:()=>!!writer,
    onStatus(fn){ listeners.push(fn); },
    get side(){ return side; },
    set side(v){ side=v?1:0; try{ localStorage.setItem('dd-hap-side',String(side)); }catch(e){} }
  };
})();
