// Staff / wand move set: battle-mage casting. Stance, standard cast, tap follow-up, air cast, charged spell, alternates.
// The FRONT hand holds the staff; it is drawn along `ang` from 56 units behind the hand to an orb 88 units in front.
// At every shot mark the orb points forward (down-forward for the air cast) with the front hand out at shoulder height,
// and the pose is held flat (ease:'hold') across the mark so the shot frame is exact.
//
// Winding: staff_shot and staff_power twirl `ang` through whole turns. Angles are not wrapped, so each of them reaches
// its cast pose on the wound angle (0 - 2pi*n) and, inside the flat hold at the shot mark, jumps to the identical pose
// at the plain angle. From the mark onward every clip is on the same winding as the stance, so cancels and cross-fades
// never unwind the staff.
(function(){
  const TORSO=ANIM.TORSO, NECK=ANIM.NECK, TAU=Math.PI*2;

  // Mage pose builder. Everything hangs off the hips and a torso lean, so the body always drives the arms.
  //   hips [x,y]   lean  torso angle from vertical (positive = forward)   tilt  extra head angle
  //   ang          staff angle
  //   fh / fhN     staff hand (absolute / relative to the shoulder)
  //   bh / bhN     free hand (absolute / relative to the shoulder)
  //   fe, be       elbow hints (absolute)      f1,f2,k1,k2  feet and knee hints
  function M(o){
    const hx=o.hips[0], hy=o.hips[1], l=o.lean||0, hl=l+(o.tilt||0);
    const nx=hx+Math.sin(l)*TORSO, ny=hy-Math.cos(l)*TORSO;
    const fh=o.fh||[nx+o.fhN[0],ny+o.fhN[1]], bh=o.bh||[nx+o.bhN[0],ny+o.bhN[1]];
    const el=(h,back)=>{ const mx=(nx+h[0])/2,my=(ny+h[1])/2; return h[1]<ny-25?[mx+(back?-18:18),my+4]:[mx+(back?-12:-4),my+(back?12:16)]; };
    const fe=o.fe||el(fh,0), be=o.be||el(bh,1);
    const f1=o.f1||[-34,0], f2=o.f2||[36,0];
    const k1=o.k1||[(hx+f1[0])/2+20,(hy+f1[1])/2-4], k2=o.k2||[(hx+f2[0])/2+20,(hy+f2[1])/2-4];
    return [nx+Math.sin(hl)*NECK, ny-Math.cos(hl)*NECK, nx,ny, hx,hy, be[0],be[1], bh[0],bh[1], fe[0],fe[1], fh[0],fh[1],
      k1[0],k1[1], f1[0],f1[1], k2[0],k2[1], f2[0],f2[1], o.ang||0];
  }
  function K(t,o,ease,extra){ const k={t:t,p:M(o)}; if(ease) k.ease=ease; if(extra) for(const x in extra) k[x]=extra[x]; return k; }
  // Same description with some fields replaced.
  function W(o,set){ const r={}; for(const x in o) r[x]=o[x]; for(const x in set) r[x]=set[x]; return r; }

  // ---- shared poses -------------------------------------------------------------------------------------------
  // Mage ready: staff upright with the orb tipped forward above the head, free hand open at the side.
  const STANCE={hips:[0,-72],lean:-0.04,fh:[30,-98],ang:-1.25,bh:[-30,-82],f1:[-34,0],f2:[36,0]};
  // Top of the sway: the whole figure drifts up as if half weightless, staff tipping upright, free hand lifting.
  const STANCE_IN={hips:[0,-75],lean:-0.07,fh:[28,-103],ang:-1.34,bh:[-34,-87],f1:[-34,0],f2:[36,0]};
  // "Staff still forward" pose that the standard casts pass through at t=0.36; the quick casts start and loop from here.
  const FWD={hips:[3,-67],lean:0.10,fh:[66,-108],ang:-0.16,bh:[-34,-92],f1:[-44,0],f2:[52,0]};
  // Where the quick casts end: staff lifting back toward the stance, a short blend away from both STANCE and FWD.
  const EASY={hips:[2,-69],lean:0.05,fh:[54,-106],ang:-0.45,bh:[-32,-88],f1:[-41,0],f2:[46,0]};

  ANIM.POSES.staff_stance=M(STANCE);
  ANIM.POSES.staff_fwd=M(FWD);

  // ---- 1. stance ----------------------------------------------------------------------------------------------
  ANIM.add('staff_stance',{
    dur:1.2, loop:true, weapon:'staff',
    keys:[ K(0,STANCE), K(0.6,STANCE_IN), K(1.2,STANCE) ]
  });

  // ---- 2. standard cast ---------------------------------------------------------------------------------------
  // Full backward twirl into an underhand scoop-thrust: the orb tips forward, sweeps back over the head as the body
  // coils onto the back leg, drops behind, then scoops under and forward as the caster lunges.
  const CAST={hips:[12,-60],lean:0.34,tilt:-0.15,fhN:[69,-3],ang:-0.04,bhN:[-62,10],f1:[-44,0],f2:[62,0]};
  ANIM.add('staff_shot',{
    dur:0.44, weapon:'staff',
    keys:[
      K(0,STANCE),
      // anticipation: dip forward, orb tips toward the target, free hand drops behind
      K(0.05,{hips:[4,-66],lean:0.16,fh:[56,-100],ang:-0.65,bh:[-36,-70],f1:[-36,0],f2:[40,-1]},'out'),
      // coil: staff swept flat over the head pointing back, weight on the back leg, front foot peels, free hand reaches out
      K(0.12,{hips:[-10,-66],lean:-0.24,tilt:0.1,fhN:[6,-62],ang:-3.0,bhN:[52,-6],f1:[-42,0],f2:[36,-8]}),
      // deep coil: staff hand drawn to the back hip, orb hanging low behind
      K(0.188,{hips:[-14,-58],lean:-0.30,tilt:0.12,fh:[-18,-88],fe:[-52,-96],ang:-4.0,bhN:[40,-20],f1:[-46,0],f2:[30,-3]}),
      // lunge: scoop the orb under and out
      K(0.232,W(CAST,{ang:-0.04-TAU}),'snap'),
      K(0.238,W(CAST,{ang:-0.04-TAU}),'hold'),
      K(0.24,CAST,'hold'),
      K(0.256,CAST,'hold'),
      // recoil shiver: orb kicks up and the arm jolts back, front foot pops, then a rebound low
      K(0.285,{hips:[3,-64],lean:0.08,tilt:0.12,fhN:[54,-14],ang:-0.46,bhN:[-50,-14],f1:[-46,0],f2:[56,-5]},'snap'),
      K(0.32,{hips:[8,-63],lean:0.22,fhN:[64,2],ang:0.06,bhN:[-44,14],f1:[-44,0],f2:[56,-0.6]}),
      K(0.36,FWD),
      K(0.44,STANCE)
    ],
    trail:[[0.08,0.232]],
    marks:[{t:0.24,type:'shot'}]
  });

  // Alternate: no twirl. The free hand draws a wide circle (low behind, overhead, out in front, back to the ribs)
  // and punches the palm forward while the staff is swept back behind the body like a tail.
  const PALM={hips:[12,-60],lean:0.36,tilt:-0.15,bhN:[69,-4],fhN:[-52,26],ang:-3.55,f1:[-44,0],f2:[62,0]};
  ANIM.add('staff_shot_b',{
    dur:0.44, weapon:'staff',
    keys:[
      K(0,STANCE),
      K(0.05,{hips:[2,-62],lean:0.14,fh:[34,-92],ang:-1.1,bh:[-36,-66],f1:[-36,0],f2:[40,0]},'out'),
      // rise, palm high overhead, staff starting to swing back
      K(0.11,{hips:[-4,-76],lean:-0.14,bhN:[-14,-68],fh:[14,-100],ang:-1.9,f1:[-36,0],f2:[34,-4]}),
      K(0.15,{hips:[-9,-70],lean:-0.22,bhN:[54,-34],fhN:[0,30],ang:-2.7,f1:[-42,0],f2:[32,-8]}),
      // coiled: palm cocked at the ribs, staff back
      K(0.19,{hips:[-12,-60],lean:-0.26,tilt:0.1,bhN:[8,22],fhN:[-22,20],ang:-3.3,f1:[-46,0],f2:[30,-3]}),
      K(0.234,PALM,'snap'),
      K(0.256,PALM,'hold'),
      // recoil: palm kicked up, body rocks back
      K(0.29,{hips:[4,-64],lean:0.10,tilt:0.1,bhN:[40,-22],fhN:[-40,-10],ang:-2.9,f1:[-46,0],f2:[56,-4]},'snap'),
      // staff swings over the top to the front as the palm withdraws
      K(0.36,{hips:[2,-68],lean:0.06,fh:[56,-112],ang:-0.7,bh:[-30,-96],f1:[-44,0],f2:[50,0]}),
      K(0.44,STANCE)
    ],
    marks:[{t:0.24,type:'shot'}]
  });

  // ---- 3. tap follow-up ---------------------------------------------------------------------------------------
  // Draw the staff back to the chest as the free hand pushes out and the front foot lifts, then step and jab.
  const JAB={hips:[12,-62],lean:0.30,tilt:-0.12,fhN:[69,-1],ang:0,bhN:[-58,14],f1:[-43,0],f2:[64,0]};
  ANIM.add('staff_quick',{
    dur:0.30, weapon:'staff',
    keys:[
      K(0,FWD),
      K(0.06,{hips:[-7,-68],lean:-0.12,fh:[20,-100],ang:-0.55,bhN:[38,4],f1:[-44,0],f2:[36,-10]},'out'),
      K(0.128,JAB,'snap'),
      K(0.146,JAB,'hold'),
      // recoil: orb kicks up, back foot shuffles a step in
      K(0.18,{hips:[4,-65],lean:0.10,fhN:[54,-8],ang:-0.38,bhN:[-40,6],f1:[-34,-7],f2:[55,0]},'snap'),
      K(0.26,FWD),
      K(0.30,EASY)
    ],
    marks:[{t:0.14,type:'shot'}]
  });

  // Alternate: spinning cast. Dip, hop through a full turn with the arms spread and the staff whirling flat,
  // land low and wide with the orb thrust out.
  const SPINCAST={hips:[8,-54],lean:0.26,tilt:-0.1,fhN:[70,-7],ang:0.02,bhN:[-60,-6],f1:[-50,0],f2:[62,0]};
  ANIM.add('staff_quick_b',{
    dur:0.30, weapon:'staff',
    keys:[
      K(0,FWD),
      K(0.04,{hips:[-4,-62],lean:0.2,fh:[40,-92],ang:0.5,bh:[-30,-70],f1:[-40,-1.5],f2:[44,-1.5]},'out',{turn:0.6}),
      K(0.09,{hips:[0,-76],lean:0,fhN:[62,-4],ang:-0.1,bhN:[-52,0],f1:[-22,-12],f2:[24,-9]},'linear',{turn:-1}),
      K(0.132,W(SPINCAST,{f1:[-50,-1.5],f2:[62,-1.5]}),'out'),
      K(0.146,SPINCAST,'hold'),
      K(0.18,{hips:[2,-58],lean:0.06,fhN:[52,-14],ang:-0.4,bhN:[-44,8],f1:[-48,0],f2:[56,-6]},'snap'),
      K(0.26,FWD),
      K(0.30,EASY)
    ],
    trail:[[0.04,0.132]],
    marks:[{t:0.14,type:'shot'}]
  });

  // ---- 4. air cast --------------------------------------------------------------------------------------------
  // Arch back with the staff swung overhead and hang there, then jackknife and whip the orb down at the ground target.
  const STRIKE={hips:[-4,-84],lean:0.5,tilt:-0.25,fhN:[58,36],ang:0.5,bhN:[-56,-26],f1:[-60,-70],f2:[-30,-22]};
  ANIM.add('staff_air',{
    dur:0.44, weapon:'staff',
    keys:[
      {t:0,p:'air'},
      K(0.06,{hips:[2,-80],lean:-0.2,tilt:-0.1,fhN:[10,-66],ang:-2.2,bhN:[50,-20],f1:[-40,-16],f2:[4,-8]},'out'),
      // full arch: staff laid back over the head, free hand sighting the target, legs trailing
      K(0.14,{hips:[6,-84],lean:-0.42,tilt:-0.2,fhN:[-22,-62],ang:-3.5,bhN:[56,-28],f1:[-52,-34],f2:[-22,-14]}),
      K(0.19,{hips:[7,-86],lean:-0.46,tilt:-0.22,fhN:[-26,-60],ang:-3.65,bhN:[58,-30],f1:[-55,-37],f2:[-25,-16]}),
      K(0.218,STRIKE,'snap'),
      K(0.236,STRIKE,'hold'),
      // recoil pops the body up and back, legs swing through underneath
      K(0.28,{hips:[-8,-88],lean:0.12,fhN:[60,10],ang:0.0,bhN:[-50,-10],f1:[-10,-18],f2:[40,-34]},'snap'),
      K(0.36,{hips:[-2,-81],lean:0,fh:[50,-128],ang:-0.7,bh:[-50,-136],f1:[-22,-12],f2:[28,-16]}),
      {t:0.44,p:'air'}
    ],
    trail:[[0.19,0.225]],
    marks:[{t:0.22,type:'shot'}]
  });

  // ---- 5. charged spell ---------------------------------------------------------------------------------------
  // Two hands raise the staff, the caster lifts off the floor while the staff whirls two full turns overhead and the
  // free hand sweeps a wide circle and presses down at the ground, the body arches back in a strained two-handed hold,
  // then drops into a lunge and slams the orb level. The recoil rocks the caster right back.
  const T2=2*TAU;
  const SLAM={hips:[14,-56],lean:0.42,tilt:-0.2,fhN:[68,-9],ang:0.03,bhN:[50,-9],f1:[-46,0],f2:[66,0]};
  ANIM.add('staff_power',{
    dur:0.90, weapon:'staff',
    keys:[
      K(0,STANCE),
      K(0.10,{hips:[2,-80],lean:0.04,tilt:-0.1,fhN:[4,-66],ang:-1.75,bhN:[0,-52],f1:[-24,-3],f2:[26,-3]},'out',{grip:1}),
      K(0.22,{hips:[-2,-90],lean:-0.12,tilt:-0.1,fhN:[-8,-64],ang:-1.75-T2/3,bhN:[56,-30],f1:[-20,-18],f2:[16,-14]},'linear',{grip:0.2}),
      K(0.34,{hips:[3,-98],lean:-0.22,tilt:-0.12,fhN:[8,-66],ang:-1.75-T2*2/3,bhN:[52,40],f1:[-24,-28],f2:[8,-22]},'linear'),
      K(0.46,{hips:[-3,-102],lean:-0.32,tilt:-0.15,fhN:[-6,-66],ang:-1.75-T2,bhN:[-30,50],f1:[-30,-34],f2:[2,-26]},'linear',{grip:0.2}),
      // strained hold: arched like a drawn bow, staff laid back behind the head in both hands
      K(0.53,{hips:[4,-100],lean:-0.5,tilt:-0.25,fhN:[-30,-58],ang:-3.1-T2,bhN:[-40,-50],f1:[-48,-46],f2:[-22,-30]},'out',{grip:1}),
      K(0.558,{hips:[2,-99],lean:-0.47,tilt:-0.22,fhN:[-28,-59],ang:-3.0-T2,bhN:[-40,-50],f1:[-46,-45],f2:[-21,-29]},'smooth',{grip:1}),
      K(0.588,{hips:[6,-101],lean:-0.56,tilt:-0.28,fhN:[-34,-56],ang:-3.25-T2,bhN:[-40,-50],f1:[-50,-48],f2:[-24,-32]},'smooth',{grip:1}),
      K(0.614,W(SLAM,{ang:0.03-T2}),'snap',{grip:1}),
      K(0.619,W(SLAM,{ang:0.03-T2}),'hold',{grip:1}),
      K(0.62,SLAM,'hold',{grip:1}),
      K(0.636,SLAM,'hold',{grip:1}),
      // recoil 1: staff kicks up, hands thrown up and back, front foot pops
      K(0.67,{hips:[-6,-60],lean:-0.12,fhN:[44,-44],ang:-1.0,bhN:[10,-40],f1:[-52,0],f2:[50,-10]},'snap',{grip:0.6}),
      // recoil 2: rocked right back on the rear leg, front knee up, free hand flung behind
      K(0.74,{hips:[-20,-66],lean:-0.46,tilt:0.2,fhN:[36,-56],ang:-1.7,bhN:[-40,30],f1:[-52,0],f2:[36,-36]},'out'),
      // slow recovery: rock forward past the stance, then settle
      K(0.82,{hips:[3,-66],lean:0.12,fh:[38,-96],ang:-1.05,bh:[-26,-78],f1:[-42,0],f2:[40,-3]}),
      K(0.90,STANCE)
    ],
    trail:[[0.10,0.46],[0.588,0.614]],
    marks:[{t:0.62,type:'shot'}]
  });
})();
