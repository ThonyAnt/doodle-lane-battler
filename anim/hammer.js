// War hammer (huge two-handed maul) attack clips. The hammer is heavy: it leads and the body follows.
//   Ground combo:  hammer1 | hammer1_b  ->  hammer2 | hammer2_b  ->  hammer3
//   Variants:      hammer_run (running), hammer_air (airborne), hammer_up (whirlwind)
//
// Combo hand-offs are exact: every opener has the shared BACK pose as a key at its cancel time (0.38) and every
// second hit starts on BACK; every second hit has the shared HIGH pose as a key at its cancel time (0.42) and
// hammer3 starts on HIGH. Change BACK / HIGH and all five clips stay in sync.
//
// Horizontal swings are drawn with `turn`: the body (and the hammer with it) is mirrored through 0, so a hammer held
// out at arm's length sweeps from behind the fighter to the front and round again. The weapon angle tilts that
// orbit (high on the way in, low on the way out) so the head never just slides along a line.
// At a hit the turn is still rising (about 0.8), which keeps the head inside reach and moving fast at the mark.
(function(){
  const A=ANIM, S=Math.sin, C=Math.cos;

  // Pose builder (same convention as blade.js).
  //   h hips, lean spine angle from vertical (+ = forward), hd head angle, f1 back foot, f2 front foot, a weapon angle,
  //   fh front hand (default: on the shoulder circle along the weapon angle, where orbit:1 puts it),
  //   bh back hand (default: on the haft, where grip:1 puts it), es/bs/k1s/k2s bend sides.
  function hint(r,e,side){ const dx=e[0]-r[0],dy=e[1]-r[1],d=Math.hypot(dx,dy)||1; return [(r[0]+e[0])/2-dy/d*20*side,(r[1]+e[1])/2+dx/d*20*side]; }
  function B(o){
    const h=o.h, ln=o.lean||0, hd=o.hd===undefined?ln*1.25:o.hd, a=o.a;
    const neck=[h[0]+A.TORSO*S(ln),h[1]-A.TORSO*C(ln)], head=[neck[0]+A.NECK*S(hd),neck[1]-A.NECK*C(hd)];
    const fh=o.fh||[neck[0]+A.ARM*C(a),neck[1]+A.ARM*S(a)], bh=o.bh||[fh[0]-13*C(a),fh[1]-13*S(a)];
    const be=hint(neck,bh,o.bs||1), fe=hint(neck,fh,o.es||1), k1=hint(h,o.f1,o.k1s||-1), k2=hint(h,o.f2,o.k2s||-1);
    return [head[0],head[1],neck[0],neck[1],h[0],h[1],be[0],be[1],bh[0],bh[1],fe[0],fe[1],fh[0],fh[1],k1[0],k1[1],o.f1[0],o.f1[1],k2[0],k2[1],o.f2[0],o.f2[1],a];
  }

  // Shared hand-off poses.
  // BACK: end of a round swing. The hammer has dragged the fighter right round: back to the target (turn -1),
  // bent over toward the hammer, whose head has dropped onto the floor behind.
  const BACK=B({h:[6,-54],lean:.45,hd:.3,f1:[-50,0],f2:[54,0],a:.42});
  const BACK_TURN=-1;
  // HIGH: end of a rising swing. Standing tall and arched back, the hammer straight-armed overhead and already
  // toppling backward, about to pull the fighter over.
  const HIGH=B({h:[-2,-70],lean:-.22,hd:-.35,f1:[-40,0],f2:[40,0],a:-1.95});

  // ---------------------------------------------------------------- combo 1
  // Haymaker: twist away and haul the hammer round behind (front foot comes off the floor, nearly tipping over),
  // then the hips fire and it comes round flat across the chest, and keeps going, spinning the fighter with it.
  A.add('hammer1',{dur:.50,weapon:'hammer',
    keys:[
      {t:0,   p:'ready'},
      {t:.07, p:B({h:[-6,-56],lean:-.05,f1:[-40,0],f2:[40,0],a:-.75}),orbit:1,grip:1,turn:-.3,ease:'linear'},
      {t:.15, p:B({h:[-12,-60],lean:.42,hd:.1,f1:[-44,-20],f2:[52,0],a:-.42}),orbit:1,grip:1,turn:-.9,ease:'out'},
      {t:.185,p:B({h:[-18,-56],lean:.6,hd:.3,f1:[-36,-34],f2:[52,0],a:-.3}),orbit:1,grip:1,turn:-1},
      {t:.22, p:B({h:[12,-58],lean:.3,hd:.5,f1:[-48,0],f2:[58,0],a:-.03}),orbit:1,grip:1,turn:.8,ease:'in'},
      {t:.24, p:B({h:[16,-56],lean:.45,hd:.6,f1:[-46,0],f2:[60,0],a:.1}),orbit:1,grip:1,turn:1,ease:'linear'},
      {t:.31, p:B({h:[8,-62],lean:.3,hd:0,f1:[-20,0],f2:[22,-12],a:.24}),orbit:1,grip:1,turn:0,ease:'linear'},
      {t:.38, p:BACK,orbit:1,grip:1,turn:BACK_TURN,ease:'out'},
      {t:.50, p:'ready'}
    ],
    trail:[[.18,.34]], marks:[{t:.22,type:'hit'}]});

  // Alternate opener: overhead chop. The hammer is hung down the back, the fighter rocks onto the back foot, then
  // it comes over the top into the floor, bounces, and the rebound swings it up and round behind, turning the fighter.
  A.add('hammer1_b',{dur:.50,weapon:'hammer',
    keys:[
      {t:0,   p:'ready'},
      {t:.07, p:B({h:[-8,-66],lean:-.15,f1:[-46,0],f2:[44,-6],a:-1.7}),orbit:1,grip:1,ease:'out'},
      {t:.15, p:B({h:[-14,-60],lean:-.42,hd:-.6,f1:[-46,0],f2:[30,-24],a:-3.55,fh:[-46,-150]}),grip:1,ease:'out'},
      {t:.19, p:B({h:[4,-68],lean:.08,hd:-.2,f1:[-46,0],f2:[52,-8],a:-1.3}),orbit:1,grip:1,ease:'in'},
      {t:.22, p:B({h:[14,-48],lean:.7,hd:.7,f1:[-50,0],f2:[58,0],a:.14,fh:[58,-46]}),grip:1,ease:'linear'},
      {t:.265,p:B({h:[10,-58],lean:.42,hd:.1,f1:[-48,0],f2:[56,0],a:-.6}),orbit:1,grip:1,ease:'out'},
      {t:.32, p:B({h:[4,-66],lean:.1,hd:-.2,f1:[-22,0],f2:[22,-12],a:-.5}),orbit:1,grip:1,turn:0,ease:'in'},
      {t:.38, p:BACK,orbit:1,grip:1,turn:BACK_TURN,ease:'out'},
      {t:.50, p:'ready'}
    ],
    trail:[[.155,.30]], marks:[{t:.22,type:'hit'}]});

  // ---------------------------------------------------------------- combo 2
  // Golf-swing uppercut out of BACK: sink while the head drags on the floor behind, then unwind; the hammer comes
  // through low under the body and rips up the front, lifting the fighter off the floor, to overhead.
  A.add('hammer2',{dur:.56,weapon:'hammer',
    keys:[
      {t:0,   p:BACK,orbit:1,grip:1,turn:BACK_TURN},
      {t:.09, p:B({h:[0,-38],lean:.72,hd:.9,f1:[-52,0],f2:[54,0],a:.24}),orbit:1,grip:1,turn:-1,ease:'out'},
      {t:.18, p:B({h:[0,-50],lean:.25,hd:.5,f1:[-24,0],f2:[24,0],a:.42}),orbit:1,grip:1,turn:0,ease:'in'},
      {t:.24, p:B({h:[12,-60],lean:.22,hd:-.1,f1:[-40,0],f2:[46,0],a:.3}),orbit:1,grip:1,turn:.85,ease:'linear'},
      {t:.29, p:B({h:[8,-90],lean:-.15,hd:-.5,f1:[-22,-10],f2:[26,-24],a:-1.25}),orbit:1,grip:1,ease:'linear'},
      {t:.35, p:B({h:[2,-98],lean:-.28,hd:-.45,f1:[-30,-18],f2:[24,-14],a:-1.82}),orbit:1,grip:1,ease:'out'},
      {t:.42, p:HIGH,orbit:1,grip:1},
      {t:.56, p:'ready'}
    ],
    trail:[[.15,.34]], marks:[{t:.24,type:'hit'}]});

  // Alternate second hit: spinning backhand. Heave the head off the floor to chest height, whip round flat, and
  // let it drag the fighter another half turn while it spirals up to overhead.
  A.add('hammer2_b',{dur:.56,weapon:'hammer',
    keys:[
      {t:0,   p:BACK,orbit:1,grip:1,turn:BACK_TURN},
      {t:.09, p:B({h:[-6,-60],lean:-.12,hd:.1,f1:[-46,0],f2:[50,0],a:-.08}),orbit:1,grip:1,turn:-1,ease:'out'},
      {t:.18, p:B({h:[0,-58],lean:0,f1:[-22,0],f2:[22,-10],a:-.12}),orbit:1,grip:1,turn:0,ease:'in'},
      {t:.24, p:B({h:[12,-58],lean:.3,hd:.5,f1:[-44,0],f2:[56,0],a:0}),orbit:1,grip:1,turn:.82,ease:'linear'},
      {t:.26, p:B({h:[16,-56],lean:.42,hd:.6,f1:[-44,0],f2:[58,0],a:.1}),orbit:1,grip:1,turn:1,ease:'linear'},
      {t:.33, p:B({h:[6,-70],lean:.05,hd:-.3,f1:[-20,-12],f2:[22,0],a:-.75}),orbit:1,grip:1,turn:.08,ease:'linear'},
      {t:.42, p:HIGH,orbit:1,grip:1,ease:'out'},
      {t:.56, p:'ready'}
    ],
    trail:[[.13,.37]], marks:[{t:.24,type:'hit'}]});

  // ---------------------------------------------------------------- combo 3
  // Finisher: the overhead hammer topples back and the fighter sinks under it, jumps, arches with the hammer hung
  // down behind the head, then folds and drives it into the floor. Long crouched hold, then heave it back up.
  A.add('hammer3',{dur:.86,weapon:'hammer',
    keys:[
      {t:0,   p:HIGH,orbit:1,grip:1},
      {t:.11, p:B({h:[-8,-50],lean:-.12,hd:.2,f1:[-44,0],f2:[42,0],a:-2.35}),orbit:1,grip:1,ease:'out'},
      {t:.20, p:B({h:[0,-98],lean:-.25,hd:-.3,f1:[-30,-22],f2:[22,-30],a:-2.6}),orbit:1,grip:1,ease:'in'},
      {t:.31, p:B({h:[2,-128],lean:-.5,hd:-.75,f1:[-54,-94],f2:[-14,-70],a:-3.95,fh:[-34,-218]}),grip:1,ease:'out'},
      {t:.37, p:B({h:[4,-122],lean:-.2,hd:-.2,f1:[-46,-80],f2:[6,-62],a:-2.3}),orbit:1,grip:1,ease:'in'},
      {t:.40, p:B({h:[8,-100],lean:.28,hd:.4,f1:[-44,-48],f2:[38,-32],a:-1.05}),orbit:1,grip:1,ease:'linear'},
      {t:.425,p:B({h:[4,-68],lean:.6,hd:.6,f1:[-50,-16],f2:[46,-10],a:-.3}),orbit:1,grip:1,ease:'linear'},
      {t:.44, p:B({h:[0,-46],lean:.75,hd:.6,f1:[-54,0],f2:[48,0],a:.08,fh:[56,-47]}),grip:1,ease:'linear'},
      {t:.455,p:B({h:[-2,-42],lean:.8,hd:.7,f1:[-55,0],f2:[48,0],a:.1,fh:[57,-41]}),grip:1,ease:'linear'},
      {t:.50, p:B({h:[-6,-36],lean:.92,hd:.85,f1:[-58,0],f2:[48,0],a:.08,fh:[58,-37]}),grip:1,ease:'out'},
      {t:.64, p:B({h:[-6,-40],lean:.86,hd:.6,f1:[-58,0],f2:[48,0],a:.09,fh:[58,-39]}),grip:1},
      {t:.73, p:B({h:[0,-50],lean:.3,hd:.5,f1:[-52,0],f2:[52,0],a:-.2,fh:[42,-66]}),grip:1,ease:'in'},
      {t:.80, p:B({h:[-8,-66],lean:-.3,hd:-.1,f1:[-48,0],f2:[54,0],a:-1.1,fh:[20,-100]}),grip:1,ease:'out'},
      {t:.86, p:'ready'}
    ],
    trail:[[.34,.47]], marks:[{t:.44,type:'hit'}]});

  // ---------------------------------------------------------------- variants
  // Running attack: the head drags along the ground behind; plant and sink, the hammer swings through under the
  // rising body and up the front in a diagonal, hauling the fighter upright and back onto the heels in a skid.
  A.add('hammer_run',{dur:.52,weapon:'hammer',
    keys:[
      {t:0,   p:B({h:[0,-62],lean:.5,f1:[-40,-12],f2:[34,0],a:2.8,fh:[-20,-72]}),grip:1},
      {t:.09, p:B({h:[-8,-48],lean:.72,hd:.6,f1:[-46,0],f2:[46,0],a:2.92,fh:[-34,-60]}),grip:1,ease:'out'},
      {t:.125,p:B({h:[-2,-64],lean:.4,hd:.5,f1:[-42,-4],f2:[38,0],a:2.5,fh:[-24,-104]}),grip:1,ease:'in'},
      {t:.155,p:B({h:[4,-90],lean:.1,hd:.3,f1:[-34,-24],f2:[24,-10],a:1.57,fh:[8,-143]}),grip:1,ease:'linear'},
      {t:.20, p:B({h:[14,-64],lean:.4,hd:.2,f1:[-44,0],f2:[56,0],a:.22,fh:[50,-88]}),grip:1,ease:'linear'},
      {t:.25, p:B({h:[16,-72],lean:.22,hd:-.1,f1:[-28,-10],f2:[58,0],a:-.8}),orbit:1,grip:1,ease:'linear'},
      {t:.33, p:B({h:[2,-62],lean:-.28,hd:-.45,f1:[-36,0],f2:[64,0],a:-1.6}),orbit:1,grip:1,ease:'out'},
      {t:.40, p:B({h:[-4,-56],lean:-.2,hd:0,f1:[-42,0],f2:[62,0],a:-1.35}),orbit:1,grip:1},
      {t:.52, p:'ready'}
    ],
    trail:[[.11,.31]], marks:[{t:.20,type:'hit'}]});

  // Air attack: hammer raised overhead with the body arched like a bow, then the fighter folds in half and
  // drives it straight down in front.
  A.add('hammer_air',{dur:.50,weapon:'hammer',
    keys:[
      {t:0,   p:'air',rot:0},
      {t:.07, p:B({h:[0,-80],lean:-.15,f1:[-32,-22],f2:[8,-12],a:-1.5}),orbit:1,grip:1,rot:-.08,ease:'out'},
      {t:.16, p:B({h:[0,-82],lean:-.5,hd:-.8,f1:[-54,-46],f2:[-28,-24],a:-2.1}),orbit:1,grip:1,rot:-.22,ease:'out'},
      {t:.215,p:B({h:[0,-84],lean:-.58,hd:-.9,f1:[-58,-56],f2:[-34,-30],a:-2.3}),orbit:1,grip:1,rot:-.28},
      {t:.26, p:B({h:[0,-86],lean:.5,hd:.6,f1:[-22,-34],f2:[12,-36],a:.42}),orbit:1,grip:1,rot:.15,ease:'in'},
      {t:.30, p:B({h:[0,-88],lean:1.05,hd:1.25,f1:[2,-42],f2:[34,-52],a:.95}),orbit:1,grip:1,rot:.3,ease:'linear'},
      {t:.38, p:B({h:[0,-86],lean:1.0,hd:1.1,f1:[0,-38],f2:[30,-46],a:1.02}),orbit:1,grip:1,rot:.3},
      {t:.45, p:B({h:[0,-80],lean:.3,f1:[-20,-18],f2:[22,-20],a:-.1}),orbit:1,grip:1,rot:.08},
      {t:.50, p:'air',rot:0}
    ],
    trail:[[.215,.33]], marks:[{t:.26,type:'hit'}]});

  // Whirlwind: hammer-thrower spin. The hammer is held out at arm's length and the body leans away from it and
  // goes round two and a half times; the head comes across the front at each mark (high coming in, low going out).
  // Then the hammer drops and the fighter staggers.
  const SPIN_F=o=>B(Object.assign({h:[-8,-56],lean:-.32,hd:-.1,f1:[-32,0],f2:[28,-12],a:.14},o||{}));
  const SPIN_B=o=>B(Object.assign({h:[-8,-64],lean:-.26,hd:-.5,f1:[-28,-12],f2:[32,0],a:-.36},o||{}));
  A.add('hammer_up',{dur:.60,weapon:'hammer',
    keys:[
      {t:0,   p:'ready'},
      {t:.07, p:B({h:[-4,-50],lean:.05,f1:[-40,0],f2:[40,0],a:-.55}),orbit:1,grip:1,turn:0,ease:'out'},
      {t:.14, p:SPIN_B({a:-.45}),orbit:1,grip:1,turn:-1,ease:'out'},
      {t:.21, p:SPIN_F(),orbit:1,grip:1,turn:1,ease:'linear'},
      {t:.28, p:SPIN_B(),orbit:1,grip:1,turn:-1,ease:'linear'},
      {t:.35, p:SPIN_F({h:[-8,-58]}),orbit:1,grip:1,turn:1,ease:'linear'},
      {t:.42, p:SPIN_B({h:[-6,-62]}),orbit:1,grip:1,turn:-1,ease:'linear'},
      {t:.49, p:SPIN_F({h:[-4,-56],a:.18}),orbit:1,grip:1,turn:1,ease:'linear'},
      {t:.545,p:B({h:[12,-56],lean:.38,hd:.8,f1:[-26,-14],f2:[50,0],a:.36}),orbit:1,grip:1,turn:.3,ease:'out'},
      {t:.60, p:'ready'}
    ],
    trail:[[.10,.52]], marks:[{t:.20,type:'hit'},{t:.34,type:'hit'},{t:.48,type:'hit'}]});
})();
