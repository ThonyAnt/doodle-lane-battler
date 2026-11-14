// Broadblade (heavy two-handed sword) attack clips.
//   Ground combo:  blade1 | blade1_b  ->  blade2 | blade2_b  ->  blade3
//   Variants:      blade_run (running), blade_air (airborne), blade_up (launcher)
//
// Combo hand-offs are exact: every opener has the shared LOW pose as a key at its cancel time (0.24) and every
// second hit starts on LOW; every second hit has the shared HIGH pose as a key at its cancel time (0.26) and
// blade3 starts on HIGH. Change LOW / HIGH and all five clips stay in sync.
//
// Weapon angles never wind: every clip ends at the 'ready' angle (-0.85) itself, not at -0.85 plus a full turn,
// so a cross-fade out of any clip cannot whirl the blade.
(function(){
  const A=ANIM, S=Math.sin, C=Math.cos;

  // Pose builder. Bodies are described the way an animator thinks about them and turned into the 23-number pose:
  //   h     hips [x,y]
  //   lean  spine angle from vertical in radians (+ = leaning forward)
  //   hd    head angle from vertical (default: a bit more than the spine, so the head leads)
  //   f1,f2 back foot, front foot
  //   a     weapon angle
  //   fh    front hand; default is on the shoulder circle along the weapon angle (where orbit:1 puts it anyway)
  //   bh    back hand; default is on the hilt (where grip:1 puts it anyway)
  //   es,bs,k1s,k2s  bend side of front elbow, back elbow, knees (rarely needed)
  function hint(r,e,side){ const dx=e[0]-r[0],dy=e[1]-r[1],d=Math.hypot(dx,dy)||1; return [(r[0]+e[0])/2-dy/d*20*side,(r[1]+e[1])/2+dx/d*20*side]; }
  function B(o){
    const h=o.h, ln=o.lean||0, hd=o.hd===undefined?ln*1.25:o.hd, a=o.a;
    const neck=[h[0]+A.TORSO*S(ln),h[1]-A.TORSO*C(ln)], head=[neck[0]+A.NECK*S(hd),neck[1]-A.NECK*C(hd)];
    const fh=o.fh||[neck[0]+A.ARM*C(a),neck[1]+A.ARM*S(a)], bh=o.bh||[fh[0]-13*C(a),fh[1]-13*S(a)];
    const be=hint(neck,bh,o.bs||1), fe=hint(neck,fh,o.es||1), k1=hint(h,o.f1,o.k1s||-1), k2=hint(h,o.f2,o.k2s||-1);
    return [head[0],head[1],neck[0],neck[1],h[0],h[1],be[0],be[1],bh[0],bh[1],fe[0],fe[1],fh[0],fh[1],k1[0],k1[1],o.f1[0],o.f1[1],k2[0],k2[1],o.f2[0],o.f2[1],a];
  }

  // Shared hand-off poses.
  // LOW: end of a down-cut. Sunk over the front knee, blade tip resting on the floor in front, body coiled to rise.
  const LOW=B({h:[14,-52],lean:.55,hd:.5,f1:[-50,0],f2:[60,0],a:.34,fh:[80,-52]});
  // HIGH: end of a rising cut. Tall, arched back, blade carried up and over behind the shoulder, body part-turned.
  const HIGH=B({h:[-4,-62],lean:-.3,hd:-.1,f1:[-52,0],f2:[48,0],a:-2.55});
  const HIGH_TURN=.65;

  // ---------------------------------------------------------------- combo 1
  // Opening diagonal down-cut: rock back with the blade behind the shoulder, step in, cut to the floor.
  A.add('blade1',{dur:.34,weapon:'blade',
    keys:[
      {t:0,   p:'ready'},
      {t:.07, p:B({h:[-12,-70],lean:-.22,f1:[-48,0],f2:[36,-14],a:-2.5}),orbit:1,grip:1,ease:'out'},
      {t:.12, p:B({h:[14,-58],lean:.42,f1:[-44,0],f2:[60,0],a:.05}),orbit:1,grip:1,ease:'in'},
      {t:.165,p:B({h:[18,-47],lean:.68,hd:.7,f1:[-48,0],f2:[60,0],a:.3,fh:[84,-45]}),grip:1,ease:'out'},
      {t:.24, p:LOW,grip:1},
      {t:.34, p:'ready'}
    ],
    trail:[[.075,.19]], marks:[{t:.12,type:'hit'}]});

  // Alternate opener: chamber at the hip, lunging thrust, then rip the blade up and chop it down to the floor.
  A.add('blade1_b',{dur:.34,weapon:'blade',
    keys:[
      {t:0,   p:'ready'},
      {t:.065,p:B({h:[-14,-60],lean:-.12,f1:[-44,0],f2:[34,-10],a:-.1,fh:[-4,-82]}),grip:1,ease:'out'},
      {t:.12, p:B({h:[22,-56],lean:.6,hd:.45,f1:[-36,0],f2:[64,0],a:0}),orbit:1,grip:1,ease:'in'},
      {t:.16, p:B({h:[16,-66],lean:.25,f1:[-40,0],f2:[60,0],a:-1.05}),orbit:1,grip:1,ease:'out'},
      {t:.205,p:B({h:[18,-48],lean:.66,hd:.65,f1:[-48,0],f2:[60,0],a:.28,fh:[84,-45]}),grip:1,ease:'in'},
      {t:.24, p:LOW,grip:1,ease:'out'},
      {t:.34, p:'ready'}
    ],
    trail:[[.07,.22]], marks:[{t:.12,type:'hit'}]});

  // ---------------------------------------------------------------- combo 2
  // Rising cut out of the low follow-through: sink, drive up off both legs, blade up and over, small hop, turning.
  A.add('blade2',{dur:.36,weapon:'blade',
    keys:[
      {t:0,   p:LOW,grip:1},
      {t:.055,p:B({h:[-8,-46],lean:.6,hd:.75,f1:[-50,0],f2:[60,0],a:.26,fh:[14,-44]}),grip:1,ease:'out'},
      {t:.13, p:B({h:[14,-68],lean:.2,hd:.1,f1:[-28,0],f2:[44,0],a:-.02}),orbit:1,grip:1,ease:'in'},
      {t:.185,p:B({h:[8,-96],lean:-.2,hd:-.4,f1:[-16,-18],f2:[36,-40],a:-1.95}),orbit:1,grip:1,turn:.9,ease:'out'},
      {t:.26, p:HIGH,orbit:1,grip:1,turn:HIGH_TURN},
      {t:.36, p:'ready'}
    ],
    trail:[[.075,.21]], marks:[{t:.13,type:'hit'}]});

  // Alternate second hit: spinning backhand. Turn the back to the target with the blade whipping round behind,
  // come round low and fast, then let the blade carry up and over.
  A.add('blade2_b',{dur:.36,weapon:'blade',
    keys:[
      {t:0,   p:LOW,grip:1},
      {t:.07, p:B({h:[0,-52],lean:.3,f1:[-40,0],f2:[44,0],a:.45}),orbit:1,grip:1,turn:-1,ease:'smooth'},
      {t:.13, p:B({h:[14,-58],lean:.4,f1:[-44,0],f2:[58,0],a:-.12}),orbit:1,grip:1,turn:1,ease:'in'},
      {t:.19, p:B({h:[4,-76],lean:-.08,f1:[-36,0],f2:[40,0],a:-1.7}),orbit:1,grip:1,turn:.9,ease:'out'},
      {t:.26, p:HIGH,orbit:1,grip:1,turn:HIGH_TURN},
      {t:.36, p:'ready'}
    ],
    trail:[[.06,.21]], marks:[{t:.13,type:'hit'}]});

  // ---------------------------------------------------------------- combo 3
  // Finisher: keep turning out of HIGH into a full spin with the blade flung wide, leap, overhead slam, hold, recover.
  A.add('blade3',{dur:.64,weapon:'blade',
    keys:[
      {t:0,   p:HIGH,orbit:1,grip:1,turn:HIGH_TURN},
      {t:.05, p:B({h:[0,-62],lean:-.1,f1:[-20,0],f2:[22,0],a:-2.8}),orbit:1,grip:1,turn:0,ease:'in'},
      {t:.10, p:B({h:[0,-50],lean:-.35,f1:[-50,0],f2:[44,0],a:-3.6}),orbit:1,grip:1,turn:-1,ease:'out'},
      {t:.15, p:B({h:[0,-58],lean:-.1,f1:[-24,0],f2:[22,0],a:-3.35}),orbit:1,grip:1,turn:0,ease:'in'},
      {t:.20, p:B({h:[-2,-74],lean:-.05,f1:[-28,-4],f2:[24,-10],a:-2.75}),orbit:1,grip:1,turn:1,ease:'out'},
      {t:.255,p:B({h:[2,-116],lean:-.3,f1:[-36,-78],f2:[26,-62],a:-2.2}),orbit:1,grip:1,ease:'out'},
      {t:.30, p:B({h:[10,-86],lean:.5,f1:[-38,-44],f2:[46,-16],a:.15}),orbit:1,grip:1,ease:'in'},
      {t:.335,p:B({h:[8,-38],lean:.78,hd:.5,f1:[-58,0],f2:[50,0],a:.1,fh:[80,-20]}),grip:1,ease:'out'},
      {t:.38, p:B({h:[8,-33],lean:.86,hd:.6,f1:[-58,0],f2:[50,0],a:.06,fh:[80,-14]}),grip:1},
      {t:.46, p:B({h:[6,-38],lean:.78,hd:.45,f1:[-58,0],f2:[50,0],a:.1,fh:[80,-19]}),grip:1},
      {t:.55, p:B({h:[2,-58],lean:.3,f1:[-48,0],f2:[54,0],a:-.4,fh:[44,-82]}),grip:1},
      {t:.64, p:'ready'}
    ],
    trail:[[.03,.16],[.25,.36]], marks:[{t:.30,type:'hit'}]});

  // ---------------------------------------------------------------- variants
  // Running attack: blade dragged behind, body dives low, hilt leads, blade whips over and across, skid to a stop.
  A.add('blade_run',{dur:.42,weapon:'blade',
    keys:[
      {t:0,   p:B({h:[0,-64],lean:.5,f1:[-40,-12],f2:[34,0],a:-3.3,fh:[-24,-76]}),grip:1},
      {t:.07, p:B({h:[-4,-50],lean:.85,hd:.7,f1:[-48,0],f2:[40,-8],a:-3.05,fh:[-26,-72]}),grip:1,ease:'out'},
      {t:.11, p:B({h:[8,-50],lean:.9,hd:.7,f1:[-50,0],f2:[52,0],a:-2.5,fh:[32,-76]}),grip:1,ease:'linear'},
      {t:.14, p:B({h:[12,-50],lean:.8,hd:.6,f1:[-50,0],f2:[58,0],a:-.25,fh:[84,-76]}),grip:1,ease:'linear'},
      {t:.18, p:B({h:[14,-46],lean:.7,hd:.6,f1:[-44,0],f2:[60,0],a:.3,fh:[76,-40]}),grip:1,ease:'out'},
      {t:.27, p:B({h:[-8,-50],lean:.05,hd:.3,f1:[-30,0],f2:[62,0],a:.2,fh:[40,-62]}),grip:1},
      {t:.42, p:'ready'}
    ],
    trail:[[.09,.22]], marks:[{t:.14,type:'hit'}]});

  // Air attack: forward somersault wheel slash. One full body turn; the blade leads the turn so it crosses the
  // front twice (the two hits). Ends on rot 6.283 = upright; the game treats the end of the clip as rot 0.
  A.add('blade_air',{dur:.42,weapon:'blade',
    keys:[
      {t:0,   p:'air',rot:0},
      {t:.04, p:B({h:[0,-80],lean:-.3,f1:[-44,-36],f2:[-4,-8],a:-2.5}),orbit:1,grip:1,rot:-.15,ease:'out'},
      {t:.10, p:B({h:[0,-80],lean:.35,f1:[-20,-44],f2:[28,-50],a:-.9}),orbit:1,grip:1,rot:.9,ease:'in'},
      {t:.17, p:B({h:[0,-82],lean:.55,f1:[-18,-48],f2:[30,-52],a:0}),orbit:1,grip:1,rot:3.1,ease:'linear'},
      {t:.24, p:B({h:[0,-80],lean:.5,f1:[-18,-46],f2:[28,-50],a:.88}),orbit:1,grip:1,rot:5.4,ease:'linear'},
      {t:.30, p:B({h:[0,-78],lean:.35,f1:[-24,-36],f2:[26,-36],a:.75}),orbit:1,grip:1,rot:6.1,ease:'out'},
      {t:.36, p:B({h:[0,-78],lean:.15,f1:[-28,-18],f2:[24,-20],a:.1}),orbit:1,grip:1,rot:6.283},
      {t:.42, p:'air',rot:6.283}
    ],
    trail:[[.05,.29]], marks:[{t:.10,type:'hit'},{t:.24,type:'hit'}]});

  // Launcher: the blade drops and swings back as the body sinks into a deep crouch, then the legs fire and the
  // blade is ripped up off the floor through the front to overhead, lifting the fighter off the ground.
  A.add('blade_up',{dur:.46,weapon:'blade',
    keys:[
      {t:0,   p:'ready'},
      {t:.045,p:B({h:[-4,-64],lean:.1,f1:[-46,0],f2:[50,0],a:1.45,fh:[14,-108]}),grip:1,ease:'out'},
      {t:.09, p:B({h:[-10,-40],lean:.4,hd:.6,f1:[-44,0],f2:[46,0],a:2.75,fh:[-34,-46]}),grip:1,ease:'out'},
      {t:.108,p:B({h:[-8,-48],lean:.34,hd:.4,f1:[-44,0],f2:[47,0],a:2.3,fh:[-18,-82]}),grip:1,ease:'linear'},
      {t:.13, p:B({h:[0,-62],lean:.2,f1:[-44,0],f2:[48,0],a:1.35,fh:[12,-106]}),grip:1,ease:'linear'},
      {t:.16, p:B({h:[8,-74],lean:.12,hd:-.1,f1:[-28,0],f2:[40,0],a:-.1}),orbit:1,grip:1,ease:'linear'},
      {t:.20, p:B({h:[6,-98],lean:-.12,hd:-.3,f1:[-20,-16],f2:[22,-12],a:-1.75}),orbit:1,grip:1,ease:'out'},
      {t:.26, p:B({h:[2,-100],lean:-.22,hd:-.3,f1:[-24,-18],f2:[24,-20],a:-2.45}),orbit:1,grip:1},
      {t:.33, p:B({h:[0,-54],lean:.15,f1:[-44,0],f2:[46,0],a:-2.1}),orbit:1,grip:1},
      {t:.46, p:'ready'}
    ],
    trail:[[.10,.23]], marks:[{t:.16,type:'hit'}]});
})();
