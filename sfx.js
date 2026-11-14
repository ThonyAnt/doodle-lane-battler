// Doodle Duel sound effects. Most sounds are made here with the Web Audio API (oscillators and filtered noise). Sword
// slashes, weapon swings and gunshots are recordings in /sfx (public-domain packs, see sfx/CREDITS.md); if a recording
// has not loaded or cannot be decoded, the synthesized version plays instead. The page calls SFX.play(name, opts) from its game events; nothing in the rules or the server knows
// about sound, and every hook in duel.html checks window.SFX, so the page works without this file.
//   opts: {w: weight 0..1 (louder and lower), pan: -1..1, st: weapon style, el: element, small: true, blade: a bladed swing}
// Browsers only allow sound after a tap or a key press, so the audio engine starts on the first one. The on/off choice is
// kept in localStorage as "dd-sfx".
(function(){
  'use strict';
  let ctx=null, out=null, noiseBuf=null, muted=false, vol=0.5; const last={};
  try{ const s=JSON.parse(localStorage.getItem('dd-sfx')||'{}'); muted=!!s.muted; if(s.vol>=0) vol=s.vol; }catch(e){}
  const save=()=>{ try{ localStorage.setItem('dd-sfx',JSON.stringify({muted,vol})); }catch(e){} };
  function unlock(){
    if(!ctx){
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return false;
      ctx=new AC(); const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=6; comp.attack.value=0.002; comp.release.value=0.12;
      out=ctx.createGain(); out.gain.value=muted?0:vol; out.connect(comp); comp.connect(ctx.destination);
      noiseBuf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    }
    if(ctx.state==='suspended') ctx.resume();
    loadAll();
    return true;
  }
  // an output for one sound, panned left or right
  function bus(pan){ if(!pan||!ctx.createStereoPanner) return out; const p=ctx.createStereoPanner(); p.pan.value=Math.max(-1,Math.min(1,pan)); p.connect(out); return p; }
  // a volume envelope: quick attack, then a fall to silence over dur
  function env(dst,t,dur,g,att){ const n=ctx.createGain(); n.gain.setValueAtTime(0.0001,t); n.gain.linearRampToValueAtTime(g,t+(att||0.004)); n.gain.exponentialRampToValueAtTime(0.0001,t+dur); n.connect(dst); return n; }
  // a pitched tone gliding from f0 to f1
  function tone(dst,type,f0,f1,dur,g,at,att){ const t=ctx.currentTime+(at||0), o=ctx.createOscillator(); o.type=type; o.frequency.setValueAtTime(f0,t); if(f1&&f1!==f0) o.frequency.exponentialRampToValueAtTime(f1,t+dur);
    o.connect(env(dst,t,dur,g,att)); o.start(t); o.stop(t+dur+0.02); }
  // a burst of noise through a filter whose frequency glides from f0 to f1
  function noise(dst,kind,f0,f1,dur,g,at,q,att){ const t=ctx.currentTime+(at||0), s=ctx.createBufferSource(), f=ctx.createBiquadFilter(); s.buffer=noiseBuf; s.loop=true; f.type=kind; f.Q.value=q||1;
    f.frequency.setValueAtTime(f0,t); if(f1&&f1!==f0) f.frequency.exponentialRampToValueAtTime(f1,t+dur); s.connect(f); f.connect(env(dst,t,dur,g,att)); s.start(t,Math.random()*0.5); s.stop(t+dur+0.02); }
  // Recordings: a few takes of each sound, loaded once the audio engine starts. smp plays a random take (never the same
  // one twice running) at a slightly varied speed, and says whether it could.
  const FILES={slash:[1,2,3,4,5,6,7,8,9,10].map(n=>'slash'+n+'.ogg'),swishL:[1,2,3,4].map(n=>'swishL'+n+'.wav'),swishH:[1,2,3,4].map(n=>'swishH'+n+'.wav'),
    pistol:[1,2,3,4].map(n=>'pistol'+n+'.wav'),magnum:[1,2,3].map(n=>'magnum'+n+'.wav')}, BUF={}, lastTake={}; let loading=false;
  function loadAll(){ if(loading||!ctx||!window.fetch) return; loading=true;
    for(const set in FILES){ BUF[set]=[]; FILES[set].forEach((f,i)=>{ fetch('/sfx/'+f).then(r=>r.ok?r.arrayBuffer():Promise.reject()).then(a=>new Promise((ok,no)=>ctx.decodeAudioData(a,ok,no))).then(b=>{ BUF[set][i]=b; }).catch(()=>{}); }); } }
  function smp(dst,set,g,rate){ const have=(BUF[set]||[]).map((b,i)=>b?i:-1).filter(i=>i>=0); if(!have.length) return false;
    let i=have[Math.floor(Math.random()*have.length)]; if(have.length>1&&i===lastTake[set]) i=have[(have.indexOf(i)+1)%have.length]; lastTake[set]=i;
    const src=ctx.createBufferSource(), n=ctx.createGain(); src.buffer=BUF[set][i]; src.playbackRate.value=(rate||1)*(0.95+Math.random()*0.1); n.gain.value=g; src.connect(n); n.connect(dst); src.start(); return true; }
  const notes=(dst,type,list,step,dur,g)=>list.forEach((f,i)=>tone(dst,type,f,f,dur,g,i*step));

  // name -> [shortest gap between two plays in ms, how to make it]
  const S={
    click:  [30, d=>{ tone(d,'square',1300,900,0.025,0.10); }],
    swing:  [50, (d,o)=>{ const w=o.w||0.3; if(o.blade?smp(d,'slash',0.75,1.08-0.2*w):smp(d,w>0.55?'swishH':'swishL',0.9,1.1-0.25*w)) return; noise(d,'bandpass',500-200*w,2600-900*w,0.13+0.08*w,0.22+0.12*w,0,1.4,0.03); }],
    slash:  [60, d=>{ if(smp(d,'slash',0.85,0.9)) return; noise(d,'bandpass',900,5200,0.16,0.3,0,2,0.02); tone(d,'sawtooth',1400,500,0.12,0.05); }],
    hit:    [35, (d,o)=>{ const w=Math.min(1,o.w||0.3); tone(d,'sine',190-70*w,48,0.10+0.12*w,0.5+0.3*w); noise(d,'lowpass',2600-1200*w,400,0.07+0.05*w,0.35+0.25*w);
              if(o.el==='fire') noise(d,'highpass',2500,6000,0.18,0.12,0.02); if(o.el==='water') tone(d,'sine',500,1100,0.12,0.12,0.02); if(o.el==='plant') tone(d,'triangle',260,180,0.12,0.14,0.02); }],
    block:  [60, d=>{ tone(d,'square',980,940,0.11,0.10); tone(d,'square',1470,1440,0.09,0.07); noise(d,'highpass',4000,4000,0.03,0.2); }],
    shot:   [45, (d,o)=>{ const st=o.st||'gun';
              if(st==='bow'){ tone(d,'triangle',330,170,0.16,0.3); noise(d,'bandpass',1200,3600,0.14,0.14,0.02,2,0.03); }
              else if(st==='staff'){ tone(d,'sine',420,1250,0.2,0.2); tone(d,'triangle',630,1880,0.2,0.08); }
              else if(st==='hurl'){ noise(d,'bandpass',700,2400,0.16,0.22,0,1.5,0.04); }
              else if(smp(d,st==='akimbo'?'pistol':'magnum',st==='akimbo'?0.7:0.85,1)){ tone(d,'sine',150,45,0.09,0.35); }
              else{ noise(d,'highpass',1200,500,0.07,0.45); tone(d,'square',720,140,0.07,0.18); } }],
    boom:   [90, (d,o)=>{ const k=o.small?0.6:1; noise(d,'lowpass',1400*k,70,0.5*k,0.8*k); tone(d,'sine',110,32,0.45*k,0.7*k); noise(d,'highpass',2000,800,0.06,0.3*k); }],
    quake:  [120,d=>{ noise(d,'lowpass',260,50,0.55,0.9,0,1,0.03); tone(d,'sine',70,34,0.5,0.6); }],
    dash:   [80, d=>{ noise(d,'bandpass',400,3400,0.18,0.3,0,1.2,0.02); tone(d,'sawtooth',180,520,0.14,0.05); }],
    jump:   [60, d=>{ tone(d,'square',300,640,0.09,0.07); }],
    land:   [80, d=>{ tone(d,'sine',120,58,0.07,0.28); noise(d,'lowpass',500,200,0.05,0.14); }],
    heal:   [150,d=>{ notes(d,'triangle',[523,659,784,1047],0.07,0.16,0.14); }],
    zip:    [60, d=>{ tone(d,'square',1900,820,0.06,0.07); }],
    ult:    [300,d=>{ tone(d,'sawtooth',110,880,0.55,0.16,0,0.2); tone(d,'sawtooth',165,1320,0.55,0.08,0,0.2); noise(d,'bandpass',300,5000,0.6,0.25,0,0.8,0.4); tone(d,'sine',90,30,0.5,0.7,0.5); }],
    ko:     [400,d=>{ tone(d,'sawtooth',420,52,0.75,0.2); tone(d,'square',210,26,0.75,0.1); noise(d,'lowpass',1800,60,0.7,0.6); }],
    tick:   [200,d=>{ tone(d,'square',660,660,0.07,0.12); }],
    go:     [300,d=>{ tone(d,'square',990,990,0.28,0.14); tone(d,'square',1485,1485,0.28,0.06); }],
    round:  [400,d=>{ notes(d,'triangle',[392,523],0.12,0.2,0.16); }],
    win:    [800,d=>{ notes(d,'square',[523,659,784,1047,784,1047],0.11,0.2,0.11); notes(d,'triangle',[262,330,392,523,392,523],0.11,0.2,0.1); }],
    made:   [100,d=>{ notes(d,'triangle',[660,990],0.06,0.1,0.16); }],
    glyph:  [70, d=>{ tone(d,'triangle',880,1320,0.05,0.12); noise(d,'bandpass',3000,5000,0.04,0.08,0,3); }],
    forge:  [150,d=>{ tone(d,'square',1200,1180,0.09,0.09); tone(d,'square',1800,1780,0.2,0.08,0.09); noise(d,'highpass',5000,5000,0.03,0.2); }],
    recycle:[200,d=>{ for(let i=0;i<4;i++) noise(d,'bandpass',1500+900*i,900+500*i,0.05,0.22,i*0.045,2); }],
    restore:[200,d=>{ notes(d,'sine',[784,1175],0.08,0.22,0.14); }],
    del:    [300,d=>{ tone(d,'square',233,233,0.32,0.14); tone(d,'square',220,220,0.32,0.14); noise(d,'lowpass',900,100,0.3,0.5); }],
    hack:   [300,d=>{ notes(d,'square',[880,660,990,740,1175],0.045,0.05,0.09); }],
  };
  function play(name,o){
    const def=S[name]; if(!def||muted||!ctx||ctx.state!=='running') return;
    const now=performance.now(); if(now-(last[name]||0)<def[0]) return; last[name]=now;
    try{ def[1](bus(o&&o.pan),o||{}); }catch(e){}
  }
  function setMuted(m){ muted=!!m; if(out) out.gain.value=muted?0:vol; save(); if(!muted&&unlock()) play('click'); }
  for(const ev of ['pointerdown','keydown','touchend']) window.addEventListener(ev,unlock,{capture:true,passive:true});
  window.SFX={play,unlock,setMuted,toggle:()=>{ setMuted(!muted); return muted; },get muted(){ return muted; },get state(){ return ctx?ctx.state:'off'; },get loaded(){ let n=0; for(const k in BUF) n+=BUF[k].filter(Boolean).length; return n; },names:Object.keys(S)};
})();
