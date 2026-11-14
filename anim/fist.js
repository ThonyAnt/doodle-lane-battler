// Unarmed / gauntlet martial-arts clips: boxing combinations flowing into kicks.
//   Ground combo:  fist1 | fist1_b  ->  fist2  ->  fist3 | fist3_b  ->  fist4
//   Variants:      fist_run (flying side kick), fist_air (dive kick), fist_up (rising uppercut), fist_stance (guard bounce)
//
// Limbs: the FRONT hand (fh) is the lead/jab hand, the BACK hand (bh) throws the cross. Leg 1 (f1) is the rear leg of
// the guard and throws the snap kick / axe kick; leg 2 (f2) is the lead leg and throws the spin kick and the air kicks.
//
// Combo hand-offs are exact: each clip has the shared pose as a key at its cancel time and the next clip starts on it.
//   fist1 / fist1_b  @0.15 = C1  -> fist2 starts on C1   (jab hand home, rear hand cocked)
//   fist2            @0.17 = C2  -> fist3 / fist3_b start on C2   (weight over the lead foot, rear heel up)
//   fist3 / fist3_b  @0.22 = C3  -> fist4 starts on C3   (kicking leg re-chambered, knee up)
(function(){
  const A=ANIM, S=Math.sin, C=Math.cos;

  // Pose builder.
  //   h     hips [x,y]
  //   lean  spine angle from vertical (+ = forward)       hd  head angle (default a bit more than the spine)
  //   fh,bh front (lead) hand, back (rear) hand            f1,f2  rear foot, lead foot
  //   es,bs elbow bend side (1 = elbow below a forward arm)   k1s,k2s knee bend side (-1 = knee forward/up)
  function hint(r,e,side){ const dx=e[0]-r[0],dy=e[1]-r[1],d=Math.hypot(dx,dy)||1; return [(r[0]+e[0])/2-dy/d*22*side,(r[1]+e[1])/2+dx/d*22*side]; }
  function B(o){
    const h=o.h, ln=o.lean||0, hd=o.hd===undefined?ln*1.2:o.hd;
    const neck=[h[0]+A.TORSO*S(ln),h[1]-A.TORSO*C(ln)], head=[neck[0]+A.NECK*S(hd),neck[1]-A.NECK*C(hd)];
    const be=hint(neck,o.bh,o.bs||1), fe=hint(neck,o.fh,o.es||1), k1=hint(h,o.f1,o.k1s||-1), k2=hint(h,o.f2,o.k2s||-1);
    return [head[0],head[1],neck[0],neck[1],h[0],h[1],be[0],be[1],o.bh[0],o.bh[1],fe[0],fe[1],o.fh[0],o.fh[1],k1[0],k1[1],o.f1[0],o.f1[1],k2[0],k2[1],o.f2[0],o.f2[1],o.a===undefined?-.15:o.a];
  }

  // Boxing guard: side-on, knees bent, chin tucked behind the lead fist, rear fist at the cheek.
  const GUARD=B({h:[0,-68],lean:.2,hd:.32,fh:[40,-120],bh:[24,-110],f1:[-30,0],f2:[30,0]});
  A.POSES.fist_guard=GUARD;

  // Shared hand-off poses.
  // C1: jab hand snapped home, weight rocked onto the rear leg, rear fist cocked at the ribs ready to throw.
  const C1=B({h:[-6,-68],lean:.06,hd:.3,fh:[32,-124],bh:[-8,-100],f1:[-34,0],f2:[28,0]});
  // C2: cross on its way home, weight over the lead foot, rear heel off the floor and already light.
  const C2=B({h:[12,-68],lean:.36,hd:.4,fh:[30,-116],bh:[54,-112],f1:[-28,-5],f2:[30,0]});
  // C3: kicking (rear) leg re-chambered in front with the knee up, standing tall on the lead leg, hands back up.
  const C3=B({h:[8,-76],lean:.05,hd:.25,fh:[42,-124],bh:[20,-112],f1:[30,-30],f2:[20,0]});

  // ---------------------------------------------------------------- stance
  A.add('fist_stance',{dur:.8,loop:true,weapon:'fist',
    keys:[
      {t:0,  p:GUARD},
      {t:.2, p:B({h:[-2,-63],lean:.24,hd:.34,fh:[40,-113],bh:[22,-104],f1:[-31,0],f2:[30,0]})},
      {t:.4, p:B({h:[1,-70],lean:.17,hd:.3,fh:[43,-123],bh:[24,-112],f1:[-29,0],f2:[30,0]})},
      {t:.6, p:B({h:[2,-63],lean:.23,hd:.36,fh:[38,-114],bh:[25,-105],f1:[-30,0],f2:[31,0]})},
      {t:.8, p:GUARD}
    ]});

  // ---------------------------------------------------------------- combo 1
  // Lead jab: a tiny dip and shoulder load, the lead fist snaps out at face height, snaps home.
  A.add('fist1',{dur:.22,weapon:'fist',
    keys:[
      {t:0,   p:GUARD},
      {t:.035,p:B({h:[-5,-65],lean:.1,hd:.3,fh:[26,-116],bh:[20,-108],f1:[-31,0],f2:[28,0]}),ease:'out'},
      {t:.07, p:B({h:[12,-68],lean:.4,hd:.42,fh:[104,-121],bh:[26,-112],f1:[-34,0],f2:[40,0],a:0}),ease:'in'},
      {t:.095,p:B({h:[13,-68],lean:.42,hd:.42,fh:[105,-120],bh:[26,-112],f1:[-34,0],f2:[40,0],a:0})},
      {t:.15, p:C1,ease:'out'},
      {t:.22, p:GUARD}
    ],
    marks:[{t:.07,type:'hit'}]});

  // Alternate opener: level change. Drop under the guard and drive a low straight into the body, pop back up.
  A.add('fist1_b',{dur:.22,weapon:'fist',
    keys:[
      {t:0,   p:GUARD},
      {t:.035,p:B({h:[-4,-56],lean:.3,hd:.4,fh:[22,-92],bh:[26,-104],f1:[-32,0],f2:[30,0]}),ease:'out'},
      {t:.07, p:B({h:[12,-48],lean:.56,hd:.3,fh:[108,-90],bh:[34,-108],f1:[-44,0],f2:[46,0],a:.05}),ease:'in'},
      {t:.095,p:B({h:[13,-47],lean:.58,hd:.3,fh:[109,-89],bh:[34,-108],f1:[-44,0],f2:[46,0],a:.05})},
      {t:.15, p:C1,ease:'out'},
      {t:.22, p:GUARD}
    ],
    marks:[{t:.07,type:'hit'}]});

  // ---------------------------------------------------------------- combo 2
  // Rear cross: hips and shoulders whip round, rear heel lifts and the knee turns in, lead fist back to the chin.
  A.add('fist2',{dur:.24,weapon:'fist',
    keys:[
      {t:0,   p:C1},
      {t:.035,p:B({h:[-8,-66],lean:0,hd:.25,fh:[30,-122],bh:[-22,-104],f1:[-34,0],f2:[28,0]}),ease:'out'},
      {t:.08, p:B({h:[20,-65],lean:.54,hd:.46,fh:[38,-108],bh:[125,-114],f1:[-32,-10],f2:[38,0]}),turn:.92,ease:'in'},
      {t:.11, p:B({h:[21,-64],lean:.57,hd:.46,fh:[38,-107],bh:[126,-112],f1:[-31,-11],f2:[38,0]}),turn:.92},
      {t:.17, p:C2,ease:'out'},
      {t:.24, p:GUARD}
    ],
    marks:[{t:.08,type:'hit'}]});

  // ---------------------------------------------------------------- combo 3
  // Front snap kick with the rear leg: knee drives up to the chest, the shin whips out to the midsection,
  // torso rocks back as a counterweight, shin folds straight back under the knee.
  A.add('fist3',{dur:.30,weapon:'fist',
    keys:[
      {t:0,   p:C2},
      {t:.05, p:B({h:[8,-76],lean:.12,hd:.3,fh:[40,-120],bh:[10,-106],f1:[24,-46],f2:[22,0]}),ease:'out'},
      {t:.10, p:B({h:[6,-80],lean:-.42,hd:-.05,fh:[22,-122],bh:[-58,-98],f1:[89,-92],f2:[18,0]}),ease:'in'},
      {t:.135,p:B({h:[6,-80],lean:-.45,hd:-.05,fh:[22,-121],bh:[-60,-96],f1:[89,-94],f2:[18,0]})},
      {t:.175,p:B({h:[8,-78],lean:-.12,hd:.15,fh:[36,-122],bh:[-4,-104],f1:[36,-52],f2:[20,0]}),ease:'out'},
      {t:.22, p:C3},
      {t:.30, p:GUARD}
    ],
    marks:[{t:.10,type:'hit'}]});

  // Alternate third hit: axe kick. The rear leg swings straight up past the head, then the heel chops down.
  A.add('fist3_b',{dur:.30,weapon:'fist',
    keys:[
      {t:0,   p:C2},
      {t:.055,p:B({h:[8,-80],lean:-.3,hd:0,fh:[6,-112],bh:[-50,-126],f1:[52,-152],f2:[20,0]}),ease:'out'},
      {t:.10, p:B({h:[12,-78],lean:.12,hd:.3,fh:[36,-96],bh:[-34,-140],f1:[94,-92],f2:[20,0]}),ease:'in'},
      {t:.135,p:B({h:[14,-70],lean:.4,hd:.45,fh:[40,-92],bh:[-26,-130],f1:[86,-30],f2:[20,0]}),ease:'linear'},
      {t:.175,p:B({h:[12,-70],lean:.28,hd:.38,fh:[42,-112],bh:[6,-112],f1:[60,-10],f2:[20,0]}),ease:'out'},
      {t:.22, p:C3},
      {t:.30, p:GUARD}
    ],
    marks:[{t:.10,type:'hit'}]});

  // ---------------------------------------------------------------- combo 4
  // Finisher: spinning back kick. The chambered leg stamps down under the hips as the pivot, the body turns its
  // back, the lead leg chambers tight and whips round horizontally at chest height; hold, re-chamber, land.
  A.add('fist4',{dur:.56,weapon:'fist',
    keys:[
      {t:0,   p:C3,turn:1},
      {t:.05, p:B({h:[6,-64],lean:.3,hd:.4,fh:[46,-104],bh:[30,-98],f1:[6,-4],f2:[30,-8]}),turn:.25,ease:'in'},
      {t:.11, p:B({h:[6,-60],lean:.42,hd:.2,fh:[34,-92],bh:[20,-84],f1:[6,0],f2:[30,-34]}),turn:-1,ease:'out'},
      {t:.17, p:B({h:[8,-70],lean:.1,hd:-.2,fh:[30,-108],bh:[4,-96],f1:[6,0],f2:[38,-58]}),turn:-.2,ease:'in'},
      {t:.21, p:B({h:[10,-78],lean:-.35,hd:-.1,fh:[24,-116],bh:[-30,-100],f1:[6,0],f2:[40,-84]}),turn:.75,ease:'linear'},
      {t:.24, p:B({h:[14,-80],lean:-.8,hd:-.25,fh:[8,-112],bh:[-84,-88],f1:[6,0],f2:[97,-104]}),turn:1,ease:'linear'},
      {t:.31, p:B({h:[15,-80],lean:-.86,hd:-.28,fh:[8,-110],bh:[-88,-84],f1:[6,0],f2:[98,-108]}),turn:1},
      {t:.38, p:B({h:[10,-78],lean:-.3,hd:0,fh:[30,-120],bh:[-14,-104],f1:[4,0],f2:[44,-66]}),ease:'out'},
      {t:.43, p:B({h:[5,-66],lean:.08,hd:.25,fh:[38,-114],bh:[8,-100],f1:[-18,0],f2:[39,-9]}),ease:'linear'},
      {t:.455,p:B({h:[2,-54],lean:.36,hd:.42,fh:[44,-98],bh:[26,-90],f1:[-30,0],f2:[34,0]}),ease:'in'},
      {t:.50, p:B({h:[1,-60],lean:.3,hd:.38,fh:[42,-108],bh:[25,-99],f1:[-30,0],f2:[32,0]}),ease:'out'},
      {t:.56, p:GUARD}
    ],
    marks:[{t:.24,type:'hit'}]});

  // ---------------------------------------------------------------- variants
  // Running attack: flying side kick. Leap off the run, tuck, then lay the whole body out behind the lead heel
  // with the arms thrown back and the other leg folded under; drop into a crouch.
  A.add('fist_run',{dur:.42,weapon:'fist',
    keys:[
      {t:0,   p:B({h:[0,-64],lean:.5,hd:.5,fh:[34,-92],bh:[-22,-88],f1:[-40,-12],f2:[30,0]})},
      {t:.06, p:B({h:[-4,-80],lean:.3,hd:.35,fh:[30,-112],bh:[8,-100],f1:[-18,-36],f2:[28,-52]}),ease:'out'},
      {t:.11, p:B({h:[0,-92],lean:-.3,hd:0,fh:[14,-126],bh:[-30,-116],f1:[-6,-58],f2:[34,-86]}),ease:'linear'},
      {t:.14, p:B({h:[8,-96],lean:-1.2,hd:-.7,fh:[-40,-184],bh:[-104,-84],f1:[4,-60],f2:[91,-102]}),ease:'linear'},
      {t:.22, p:B({h:[10,-94],lean:-1.26,hd:-.72,fh:[-46,-185],bh:[-106,-80],f1:[6,-58],f2:[93,-102]})},
      {t:.28, p:B({h:[6,-80],lean:-.5,hd:-.1,fh:[-10,-130],bh:[-50,-110],f1:[-10,-34],f2:[52,-48]}),ease:'in'},
      {t:.31, p:B({h:[2,-60],lean:.05,hd:.25,fh:[22,-112],bh:[-42,-92],f1:[-30,-8],f2:[45,-9]}),ease:'linear'},
      {t:.335,p:B({h:[0,-44],lean:.55,hd:.5,fh:[52,-68],bh:[-30,-58],f1:[-40,0],f2:[40,0]}),ease:'in'},
      {t:.37, p:B({h:[0,-52],lean:.42,hd:.45,fh:[48,-92],bh:[4,-80],f1:[-36,0],f2:[36,0]}),ease:'out'},
      {t:.42, p:GUARD}
    ],
    marks:[{t:.14,type:'hit'}]});

  // Air attack: dive kick. Tuck both knees to the chest, then stomp the lead leg diagonally down-forward with
  // the body leaning back behind it and the arms flung up; fold back to the air pose.
  A.add('fist_air',{dur:.40,weapon:'fist',
    keys:[
      {t:0,   p:'air'},
      {t:.06, p:B({h:[0,-78],lean:.4,hd:.5,fh:[36,-104],bh:[10,-96],f1:[-4,-40],f2:[28,-46]}),ease:'out'},
      {t:.11, p:B({h:[0,-82],lean:.1,hd:.2,fh:[30,-126],bh:[-10,-116],f1:[-6,-46],f2:[30,-56]}),ease:'linear'},
      {t:.14, p:B({h:[2,-80],lean:-.6,hd:-.2,fh:[-18,-176],bh:[-84,-150],f1:[-8,-52],f2:[69,-33]}),ease:'linear'},
      {t:.25, p:B({h:[3,-80],lean:-.66,hd:-.22,fh:[-22,-178],bh:[-88,-146],f1:[-6,-50],f2:[70,-31]})},
      {t:.33, p:B({h:[0,-78],lean:-.1,hd:.1,fh:[30,-142],bh:[-40,-140],f1:[-16,-30],f2:[36,-34]})},
      {t:.40, p:'air'}
    ],
    marks:[{t:.14,type:'hit'}]});

  // Launcher: rising uppercut. Sink deep with the lead fist dropped to the hip, then the legs fire and the fist
  // rips straight up through the chin line to overhead, the body spiralling a full turn at the top of the jump.
  A.add('fist_up',{dur:.46,weapon:'fist',
    keys:[
      {t:0,   p:GUARD},
      {t:.045,p:B({h:[-4,-52],lean:.42,hd:.5,fh:[24,-76],bh:[22,-98],f1:[-30,0],f2:[32,0]}),ease:'out'},
      {t:.09, p:B({h:[-6,-41],lean:.6,hd:.75,fh:[8,-44],bh:[30,-88],f1:[-29,0],f2:[34,0],a:-.3}),ease:'out'},
      {t:.125,p:B({h:[2,-60],lean:.36,hd:.3,fh:[52,-92],bh:[14,-96],f1:[-30,0],f2:[32,0],a:-.3}),ease:'in'},
      {t:.15, p:B({h:[8,-92],lean:.14,hd:-.15,fh:[66,-194],bh:[-10,-112],f1:[-18,-10],f2:[26,-22],a:-.3}),ease:'linear'},
      {t:.19, p:B({h:[6,-118],lean:-.04,hd:-.3,fh:[24,-244],bh:[-22,-124],f1:[-12,-50],f2:[22,-70],a:-.3}),turn:1,ease:'out'},
      {t:.235,p:B({h:[5,-122],lean:-.08,hd:-.25,fh:[16,-248],bh:[-26,-122],f1:[-14,-58],f2:[22,-74],a:-.3}),turn:-1,ease:'linear'},
      {t:.28, p:B({h:[4,-108],lean:-.06,hd:-.1,fh:[18,-230],bh:[-24,-112],f1:[-16,-40],f2:[22,-52],a:-.3}),turn:1,ease:'linear'},
      {t:.32, p:B({h:[1,-72],lean:.12,hd:.2,fh:[38,-156],bh:[-4,-110],f1:[-26,-7],f2:[28,-8]}),ease:'linear'},
      {t:.34, p:B({h:[0,-58],lean:.28,hd:.3,fh:[44,-124],bh:[12,-102],f1:[-28,0],f2:[30,0]}),ease:'in'},
      {t:.38, p:B({h:[0,-51],lean:.42,hd:.5,fh:[46,-94],bh:[24,-88],f1:[-29,0],f2:[33,0]}),ease:'out'},
      {t:.42, p:B({h:[0,-60],lean:.3,hd:.4,fh:[42,-110],bh:[24,-100],f1:[-31,0],f2:[31,0]})},
      {t:.46, p:GUARD}
    ],
    marks:[{t:.15,type:'hit'}]});
})();
