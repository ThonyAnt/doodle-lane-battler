// Akimbo (a pistol in each hand) clips.
//   akimbo_shot (front gun)  ->  akimbo_rapid (back gun)  ->  akimbo_rapid2 (front gun)  ->  akimbo_rapid  -> ...
//   akimbo_air (both guns, one after the other), akimbo_power (braced double shot), akimbo_stance
//
// The FRONT hand's gun points along the pose's weapon angle (a); the BACK hand's gun along the key's ang2 (a2).
// At a front-gun shot the front hand is at about (80,-120) with the barrel level; at a back-gun shot the back hand is
// at about (73,-107) (the rules fire those from a lower, nearer muzzle). The pose is held flat (ease:'hold') across
// each mark so the shot frame is exact. While one gun fires the other is carried barrel-up by the face, so the two
// arms pump past each other like pistons.
//
// Hand-offs are exact: R1 (front gun kicked up, back gun coming forward) is akimbo_shot at 0.15 and the whole of
// akimbo_rapid2's ending, and is where akimbo_rapid starts; R2 is the mirror, between akimbo_rapid and akimbo_rapid2.
(function(){
  const A=ANIM, S=Math.sin, C=Math.cos;

  // Pose builder: h hips, lean spine angle (+ forward), hd head angle, fh/bh front/back hand, f1/f2 rear/lead foot,
  // a front gun angle, a2 back gun angle (goes on the key), es/bs elbow bend side, k1s/k2s knee bend side.
  function hint(r,e,side){ const dx=e[0]-r[0],dy=e[1]-r[1],d=Math.hypot(dx,dy)||1; return [(r[0]+e[0])/2-dy/d*22*side,(r[1]+e[1])/2+dx/d*22*side]; }
  function B(o){
    const h=o.h, ln=o.lean||0, hd=o.hd===undefined?ln*1.2:o.hd;
    const neck=[h[0]+A.TORSO*S(ln),h[1]-A.TORSO*C(ln)], head=[neck[0]+A.NECK*S(hd),neck[1]-A.NECK*C(hd)];
    const be=hint(neck,o.bh,o.bs||1), fe=hint(neck,o.fh,o.es||1), k1=hint(h,o.f1,o.k1s||-1), k2=hint(h,o.f2,o.k2s||-1);
    return [head[0],head[1],neck[0],neck[1],h[0],h[1],be[0],be[1],o.bh[0],o.bh[1],fe[0],fe[1],o.fh[0],o.fh[1],k1[0],k1[1],o.f1[0],o.f1[1],k2[0],k2[1],o.f2[0],o.f2[1],o.a];
  }
  const k=(t,o,ease)=>({t,p:B(o),ang2:o.a2,ease});
  const W=(o,set)=>Object.assign({},o,set);

  // Stance: front gun at low-ready, back gun carried barrel-up beside the head.
  const AS={h:[0,-68],lean:.1,fh:[44,-98],a:.3,bh:[-6,-140],a2:-1.5,f1:[-32,0],f2:[34,0]};
  A.POSES.akimbo_stance=B(AS);
  // Front gun on the line, body turned in behind it, back gun cocked by the ear.
  const AIM1={h:[8,-68],lean:.2,fh:[80,-120],a:0,bh:[-8,-136],a2:-1.4,f1:[-40,0],f2:[40,0]};
  // Back gun on the line (shoulders turned the other way, rear heel up), front gun kicked up by the face.
  const AIM2={h:[6,-66],lean:.22,fh:[12,-148],a:-1.4,bh:[73,-107],a2:0,f1:[-36,-4],f2:[38,0]};
  // R1: front gun still high from its kick, back gun already pushing out. R2: the mirror.
  const R1={h:[2,-68],lean:.05,fh:[26,-144],a:-1.2,bh:[44,-112],a2:-.25,f1:[-36,0],f2:[36,0]};
  const R2={h:[-2,-68],lean:0,fh:[50,-118],a:-.2,bh:[16,-142],a2:-1.2,f1:[-34,0],f2:[36,0]};

  // ---------------------------------------------------------------- stance
  A.add('akimbo_stance',{dur:1.1,loop:true,weapon:'akimbo',
    keys:[
      k(0,   AS),
      k(.55, W(AS,{h:[0,-66],lean:.12,fh:[45,-95],a:.36,bh:[-7,-137],a2:-1.56})),
      k(1.1, AS)
    ]});

  // ---------------------------------------------------------------- opening shot (front gun)
  A.add('akimbo_shot',{dur:.24,weapon:'akimbo',
    keys:[
      k(0,   AS),
      // dip back, gun drawn in to the ribs
      k(.03, {h:[-6,-64],lean:-.05,fh:[20,-104],a:-.5,bh:[-10,-138],a2:-1.6,f1:[-34,0],f2:[30,0]},'out'),
      k(.06, AIM1,'snap'),
      k(.075,AIM1,'hold'),
      // kick: barrel and hand first
      k(.095,W(AIM1,{fh:[58,-140],a:-.8,bh:[4,-130],a2:-1.1}),'snap'),
      // shoulders follow; the back gun starts forward
      k(.15, R1,'out'),
      k(.24, AS)
    ],
    marks:[{t:.07,type:'shot'}]});

  // ---------------------------------------------------------------- follow-up, back gun
  A.add('akimbo_rapid',{dur:.16,weapon:'akimbo',
    keys:[
      k(0,   R1),
      k(.03, AIM2,'snap'),
      k(.05, AIM2,'hold'),
      k(.07, W(AIM2,{h:[2,-67],lean:.14,bh:[54,-128],a2:-.75,fh:[24,-140],a:-1}),'snap'),
      k(.13, R2,'out'),
      k(.16, R2,'hold')
    ],
    marks:[{t:.045,type:'shot'}]});

  // ---------------------------------------------------------------- follow-up, front gun
  A.add('akimbo_rapid2',{dur:.16,weapon:'akimbo',
    keys:[
      k(0,   R2),
      k(.03, AIM1,'snap'),
      k(.05, AIM1,'hold'),
      k(.07, W(AIM1,{h:[4,-69],lean:.12,fh:[58,-140],a:-.8,bh:[10,-130],a2:-1}),'snap'),
      k(.13, R1,'out'),
      k(.16, R1,'hold')
    ],
    marks:[{t:.045,type:'shot'}]});

  // ---------------------------------------------------------------- air shot
  // Knees tuck, then the body lays back with the legs kicked out in front and the guns fire one after the other,
  // each kick folding that arm up and shoving the body further back.
  const AA1={h:[14,-82],lean:-.1,hd:-.3,fh:[80,-120],a:0,bh:[30,-116],a2:-.3,f1:[40,-70],f2:[60,-50]};
  const AA2=W(AA1,{h:[10,-82],lean:-.18,fh:[32,-150],a:-1.2,bh:[73,-107],a2:0,f1:[44,-76],f2:[58,-44]});
  A.add('akimbo_air',{dur:.30,weapon:'akimbo',
    keys:[
      {t:0,  p:'air',ang2:-.9},
      k(.035,{h:[2,-80],lean:-.1,fh:[24,-120],a:-.5,bh:[10,-112],a2:-.6,f1:[-6,-40],f2:[30,-56]},'out'),
      k(.06, AA1,'snap'),
      k(.08, AA1,'hold'),
      k(.10, W(AA1,{fh:[50,-146],a:-.9,bh:[58,-110],a2:-.1}),'snap'),
      k(.12, AA2,'snap'),
      k(.14, AA2,'hold'),
      k(.17, W(AA2,{h:[4,-80],lean:-.3,hd:-.5,bh:[48,-130],a2:-.8,fh:[20,-152],a:-1.4}),'snap'),
      k(.24, {h:[0,-78],lean:0,fh:[36,-140],a:-1.2,bh:[-24,-142],a2:-1.1,f1:[-10,-22],f2:[30,-28]}),
      {t:.30, p:'air',ang2:-.9}
    ],
    marks:[{t:.07,type:'shot'},{t:.13,type:'shot'}]});

  // ---------------------------------------------------------------- charged shot
  // Arms cross at the chest in a crouch, both guns are flung out level and held on the target, then they fire one
  // after the other; the second kick throws the arms up and skids the whole body back.
  const BR={h:[4,-58],lean:.25,fh:[80,-120],a:0,bh:[73,-107],a2:0,f1:[-52,0],f2:[44,0]};
  const BR2=W(BR,{h:[6,-56],lean:.28});
  const BRB=W(BR,{h:[2,-57],lean:.15,fh:[44,-150],a:-1.2});
  A.add('akimbo_power',{dur:.62,weapon:'akimbo',
    keys:[
      k(0,   AS),
      k(.08, {h:[-6,-56],lean:.1,hd:.3,fh:[-18,-124],a:-2,bh:[26,-126],a2:-1.1,f1:[-44,0],f2:[40,0]},'out'),
      k(.18, BR,'snap'),
      k(.32, BR2),
      k(.345,BR2,'hold'),
      k(.365,W(BR2,{h:[2,-56],lean:.15,fh:[56,-144],a:-1}),'snap'),
      k(.39, BRB,'out'),
      k(.405,BRB,'hold'),
      k(.43, {h:[-12,-52],lean:-.2,hd:-.4,fh:[0,-170],a:-1.6,bh:[10,-158],a2:-1.3,f1:[-66,0],f2:[26,-12]},'snap'),
      k(.52, {h:[-8,-62],lean:0,fh:[30,-122],a:-.4,bh:[0,-142],a2:-1.4,f1:[-56,0],f2:[24,0]}),
      k(.62, AS)
    ],
    marks:[{t:.34,type:'shot'},{t:.40,type:'shot'}]});
})();
