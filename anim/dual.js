// Dual-wield (a one-handed weapon in each hand: twin swords, daggers, axes, sai) attack clips.
//   Ground combo:  dual1 (front hand)  ->  dual2 (back hand)  ->  dual3 (front hand, rising)  ->  dual4 (double chop)
//   Variants:      dual_run (running double slash), dual_air (wheel), dual_up (double rising cut), dual_stance
//
// The FRONT hand's weapon uses the pose's weapon angle (a); the BACK hand's weapon uses the key's ang2 (a2). Both are
// authored on every key, so each blade is always doing something deliberate. trail = front blade, trail2 = back blade.
//
// Combo hand-offs are exact: each clip has the shared pose as a key at its cancel time and the next clip starts on it.
//   dual1 @0.16 = X1 -> dual2   (front blade spent low in front, back blade cocked high behind)
//   dual2 @0.16 = X2 -> dual3   (back blade spent low in front, front blade chambered at the rear hip)
//   dual3 @0.19 = X3 -> dual4   (both blades carried up overhead, body arched)
//
// Angles never wind across a clip boundary: dual_up turns both blades a full circle, so it ends on a held key that
// steps back to the stance angles (the same trick as gun_spin).
(function(){
  const A=ANIM, S=Math.sin, C=Math.cos, T=2*Math.PI;

  // Pose builder.
  //   h     hips [x,y]
  //   lean  spine angle from vertical (+ = forward)       hd  head angle (default a bit more than the spine)
  //   fh,bh front hand, back hand                          f1,f2  rear foot, lead foot
  //   a     front weapon angle                             a2  back weapon angle (goes on the key, see k())
  //   es,bs elbow bend side                                k1s,k2s knee bend side (-1 = knee forward/up)
  function hint(r,e,side){ const dx=e[0]-r[0],dy=e[1]-r[1],d=Math.hypot(dx,dy)||1; return [(r[0]+e[0])/2-dy/d*22*side,(r[1]+e[1])/2+dx/d*22*side]; }
  function B(o){
    const h=o.h, ln=o.lean||0, hd=o.hd===undefined?ln*1.2:o.hd;
    const neck=[h[0]+A.TORSO*S(ln),h[1]-A.TORSO*C(ln)], head=[neck[0]+A.NECK*S(hd),neck[1]-A.NECK*C(hd)];
    const be=hint(neck,o.bh,o.bs||1), fe=hint(neck,o.fh,o.es||1), k1=hint(h,o.f1,o.k1s||-1), k2=hint(h,o.f2,o.k2s||-1);
    return [head[0],head[1],neck[0],neck[1],h[0],h[1],be[0],be[1],o.bh[0],o.bh[1],fe[0],fe[1],o.fh[0],o.fh[1],k1[0],k1[1],o.f1[0],o.f1[1],k2[0],k2[1],o.f2[0],o.f2[1],o.a];
  }
  // A key from a pose description. rot and turn may be given in the description too.
  const k=(t,o,ease)=>({t,p:B(o),ang2:o.a2,ease,rot:o.rot,turn:o.turn});

  // Stance: low and side-on, front blade forward as a guard, back blade carried high behind the head.
  const DS={h:[0,-66],lean:.2,fh:[46,-104],a:-.5,bh:[-12,-140],a2:-2,f1:[-40,0],f2:[40,0]};
  A.POSES.dual_stance=B(DS);
  // X1: front blade spent low in front; back blade cocked high behind, shoulders wound up to throw it.
  const X1={h:[10,-60],lean:.4,fh:[56,-66],a:.5,bh:[-20,-142],a2:-2.1,f1:[-44,0],f2:[48,0]};
  // X2: back blade spent low in front; front blade chambered at the rear hip, point trailing behind.
  const X2={h:[8,-56],lean:.32,fh:[-20,-74],a:2.75,bh:[58,-64],a2:.5,f1:[-40,0],f2:[50,0]};
  // X3: both blades ripped up overhead, body tall and arched, heels light.
  const X3={h:[2,-74],lean:-.15,hd:-.25,fh:[30,-184],a:-1.9,bh:[-40,-170],a2:-2.3,f1:[-30,0],f2:[34,0]};

  // ---------------------------------------------------------------- stance
  A.add('dual_stance',{dur:.9,loop:true,weapon:'dual',
    keys:[
      k(0,  DS),
      k(.22,{h:[-2,-62],lean:.24,fh:[45,-99],a:-.44,bh:[-14,-135],a2:-2.08,f1:[-40,0],f2:[40,0]}),
      k(.45,{h:[1,-68],lean:.17,fh:[48,-107],a:-.56,bh:[-10,-143],a2:-1.94,f1:[-40,0],f2:[40,0]}),
      k(.68,{h:[2,-63],lean:.23,fh:[44,-100],a:-.46,bh:[-13,-136],a2:-2.06,f1:[-40,0],f2:[40,0]}),
      k(.9, DS)
    ]});

  // ---------------------------------------------------------------- combo 1
  // Front hand: the blade is pulled back across the body over the rear shoulder, then cut down and forward on a
  // diagonal as the front foot steps in. The back blade is thrown out behind as the counterweight, then cocked.
  A.add('dual1',{dur:.24,weapon:'dual',
    keys:[
      k(0,   DS),
      k(.03, {h:[-6,-64],lean:.05,fh:[-14,-112],a:-2.7,bh:[-30,-128],a2:-2.2,f1:[-40,0],f2:[34,-8]},'out'),
      k(.08, {h:[14,-60],lean:.5,hd:.45,fh:[108,-106],a:.05,bh:[-22,-100],a2:-2.9,f1:[-46,0],f2:[52,0]},'in'),
      k(.11, {h:[16,-58],lean:.55,hd:.5,fh:[90,-72],a:.42,bh:[-18,-118],a2:-2.5,f1:[-46,0],f2:[52,0]},'out'),
      k(.16, X1),
      k(.24, DS)
    ],
    trail:[[.035,.12]], marks:[{t:.08,type:'hit'}]});

  // ---------------------------------------------------------------- combo 2
  // Back hand: the shoulders whip round and the rear blade comes over the top and down through the target while the
  // front blade is ripped back to the rear hip, which loads the next cut.
  A.add('dual2',{dur:.24,weapon:'dual',
    keys:[
      k(0,   X1),
      k(.03, {h:[4,-62],lean:.2,fh:[44,-66],a:.9,bh:[-30,-160],a2:-2.3,f1:[-38,-6],f2:[46,0]},'out'),
      k(.08, {h:[16,-58],lean:.5,hd:.45,fh:[-8,-78],a:2.6,bh:[108,-100],a2:.1,f1:[-30,0],f2:[54,0]},'in'),
      k(.11, {h:[18,-56],lean:.55,hd:.5,fh:[-14,-76],a:2.7,bh:[92,-68],a2:.42,f1:[-32,0],f2:[54,0]},'out'),
      k(.16, X2),
      k(.24, DS)
    ],
    trail2:[[.03,.12]], marks:[{t:.08,type:'hit'}]});

  // ---------------------------------------------------------------- combo 3
  // Front hand again: sink, then the chambered blade is ripped forward and up through the target with a small hop;
  // the back blade follows it up so both finish overhead.
  A.add('dual3',{dur:.28,weapon:'dual',
    keys:[
      k(0,   X2),
      k(.035,{h:[2,-50],lean:.45,hd:.55,fh:[-22,-62],a:2.6,bh:[50,-70],a2:.45,f1:[-42,0],f2:[48,0]},'out'),
      k(.09, {h:[14,-66],lean:.2,hd:.1,fh:[90,-112],a:-.35,bh:[42,-104],a2:.1,f1:[-36,0],f2:[46,0]},'in'),
      k(.13, {h:[10,-84],lean:-.05,hd:-.2,fh:[48,-194],a:-1.35,bh:[14,-168],a2:-1.2,f1:[-22,-12],f2:[30,-18]},'out'),
      k(.19, X3),
      k(.28, DS)
    ],
    trail:[[.045,.15]], trail2:[[.09,.19]], marks:[{t:.09,type:'hit'}]});

  // ---------------------------------------------------------------- combo 4
  // Finisher: a full spin out of the overhead carry with both blades flung level, a leap, then the two blades chop
  // down one after the other (front, then back) into a deep lunge. Hold, recover.
  A.add('dual4',{dur:.58,weapon:'dual',
    keys:[
      k(0,   X3),
      k(.04, {h:[0,-64],lean:-.05,fh:[52,-140],a:-.8,bh:[-52,-136],a2:-2.7,f1:[-22,0],f2:[24,0],turn:0},'in'),
      k(.08, {h:[0,-58],lean:0,fh:[64,-118],a:-.1,bh:[-60,-116],a2:-3.1,f1:[-46,0],f2:[42,0],turn:-1},'out'),
      k(.12, {h:[0,-62],lean:0,fh:[62,-124],a:-.3,bh:[-58,-122],a2:-3,f1:[-24,0],f2:[22,0],turn:0},'in'),
      k(.16, {h:[0,-82],lean:-.2,hd:-.3,fh:[20,-196],a:-1.7,bh:[-50,-180],a2:-2.4,f1:[-30,-30],f2:[24,-24]},'out'),
      k(.20, {h:[10,-72],lean:.45,hd:.4,fh:[98,-104],a:.3,bh:[-10,-176],a2:-1.9,f1:[-36,-20],f2:[44,-6]},'in'),
      k(.24, {h:[12,-56],lean:.6,hd:.5,fh:[86,-60],a:.42,bh:[60,-160],a2:-1,f1:[-48,0],f2:[52,0]},'linear'),
      k(.28, {h:[12,-46],lean:.75,hd:.55,fh:[72,-44],a:.4,bh:[110,-76],a2:.22,f1:[-56,0],f2:[52,0]},'linear'),
      k(.33, {h:[12,-42],lean:.8,hd:.6,fh:[72,-40],a:.36,bh:[108,-70],a2:.3,f1:[-58,0],f2:[52,0]},'out'),
      k(.42, {h:[8,-48],lean:.6,hd:.45,fh:[66,-56],a:.2,bh:[90,-80],a2:0,f1:[-56,0],f2:[52,0]}),
      k(.50, {h:[2,-60],lean:.3,fh:[50,-92],a:-.3,bh:[20,-118],a2:-1.2,f1:[-46,0],f2:[46,0]}),
      k(.58, DS)
    ],
    trail:[[.03,.13],[.15,.25]], trail2:[[.03,.13],[.21,.32]], marks:[{t:.20,type:'hit'},{t:.28,type:'hit'}]});

  // ---------------------------------------------------------------- variants
  // Running attack: both blades streaming behind, body dives, the front blade whips over and across, the back blade
  // follows through the same line a beat later, skid to a stop.
  A.add('dual_run',{dur:.40,weapon:'dual',
    keys:[
      k(0,   {h:[0,-62],lean:.55,fh:[-24,-84],a:-3,bh:[-30,-100],a2:-3.2,f1:[-40,-12],f2:[34,0]}),
      k(.06, {h:[-4,-50],lean:.8,hd:.65,fh:[-20,-70],a:-2.9,bh:[-26,-84],a2:-3.1,f1:[-48,0],f2:[40,-8]},'out'),
      k(.12, {h:[10,-52],lean:.75,hd:.6,fh:[114,-84],a:.1,bh:[-14,-96],a2:-2.9,f1:[-50,0],f2:[56,0]},'in'),
      k(.16, {h:[12,-50],lean:.72,hd:.6,fh:[96,-58],a:.45,bh:[30,-140],a2:-1.7,f1:[-48,0],f2:[58,0]},'linear'),
      k(.20, {h:[14,-48],lean:.7,hd:.6,fh:[70,-46],a:.36,bh:[114,-80],a2:.15,f1:[-44,0],f2:[60,0]},'linear'),
      k(.28, {h:[-6,-50],lean:.1,hd:.3,fh:[50,-62],a:.2,bh:[58,-84],a2:.3,f1:[-30,0],f2:[62,0]},'out'),
      k(.40, DS)
    ],
    trail:[[.07,.17]], trail2:[[.14,.25]], marks:[{t:.12,type:'hit'},{t:.20,type:'hit'}]});

  // Air attack: a forward wheel with the arms spread, one blade ahead and one behind, so the two blades cross the
  // front half a turn apart (the two hits). Ends on rot 6.283 = upright; the game treats the end of a clip as rot 0.
  const WHEEL={h:[0,-80],lean:.3,fh:[83,-146],a:-.2,bh:[-48,-119],a2:-3.34,f1:[-20,-44],f2:[28,-50]};
  A.add('dual_air',{dur:.40,weapon:'dual',
    keys:[
      {t:0,  p:'air',ang2:-2.2,rot:0},
      k(.04, {h:[0,-80],lean:-.2,fh:[40,-176],a:-1.3,bh:[-60,-150],a2:-2.6,f1:[-40,-40],f2:[0,-20],rot:-.15},'out'),
      k(.10, Object.assign({},WHEEL,{rot:1.3}),'in'),
      k(.20, Object.assign({},WHEEL,{h:[0,-82],lean:.36,rot:4.4}),'linear'),
      k(.28, {h:[0,-80],lean:.2,fh:[70,-150],a:-.4,bh:[-46,-124],a2:-3.2,f1:[-24,-36],f2:[26,-36],rot:5.9},'linear'),
      k(.34, {h:[0,-78],lean:.1,fh:[50,-140],a:-.9,bh:[-40,-130],a2:-2.6,f1:[-28,-18],f2:[24,-20],rot:6.283},'out'),
      {t:.40, p:'air',ang2:-2.2,rot:6.283}
    ],
    trail:[[.05,.17]], trail2:[[.13,.27]], marks:[{t:.10,type:'hit'},{t:.20,type:'hit'}]});

  // Launcher: both blades swing back over the top as the body drops into a crouch, then the legs fire and the blades
  // are ripped up off the floor one after the other (front, then back), carrying the fighter into the air.
  // Both blades travel one full backward circle; UNW is the stance with those turns still on, and the last key lets go.
  const UNW=Object.assign({},DS,{a:DS.a-T,a2:DS.a2-T});
  A.add('dual_up',{dur:.44,weapon:'dual',
    keys:[
      k(0,   DS),
      k(.05, {h:[-6,-44],lean:.45,hd:.55,fh:[10,-52],a:-3.68,bh:[-30,-58],a2:-3.4,f1:[-44,0],f2:[44,0]},'out'),
      k(.13, {h:[8,-70],lean:.15,hd:0,fh:[84,-128],a:-.4-T,bh:[-16,-68],a2:-3.7,f1:[-30,0],f2:[40,0]},'in'),
      k(.17, {h:[8,-92],lean:-.05,hd:-.2,fh:[40,-208],a:-1.4-T,bh:[30,-102],a2:1-T,f1:[-24,-14],f2:[26,-10]},'linear'),
      k(.21, {h:[6,-104],lean:-.1,hd:-.3,fh:[10,-226],a:-1.9-T,bh:[66,-150],a2:-.4-T,f1:[-22,-24],f2:[24,-18]},'linear'),
      k(.27, {h:[2,-104],lean:-.2,hd:-.3,fh:[-30,-216],a:-2.3-T,bh:[20,-222],a2:-1.5-T,f1:[-26,-22],f2:[24,-22]},'out'),
      k(.35, {h:[0,-56],lean:.15,fh:[40,-130],a:-1.3-T,bh:[-10,-150],a2:-2-T,f1:[-42,0],f2:[44,0]}),
      k(.43, UNW),
      k(.439,UNW,'hold'),
      k(.44, DS,'hold')
    ],
    trail:[[.07,.19]], trail2:[[.14,.27]], marks:[{t:.13,type:'hit'},{t:.21,type:'hit'}]});
})();
