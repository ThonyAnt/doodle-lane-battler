// Spear (polearm) attack clips, wushu style.
//   Ground combo:  spear1 | spear1_b  ->  spear2 | spear2_b  ->  spear3
//   Variants:      spear_run (running), spear_air (airborne), spear_up (launcher)
//
// The spear is drawn from the FRONT hand along the weapon angle: about 46 units of shaft behind the hand and 172
// in front. The back hand is placed on the shaft line behind the front hand by the pose builder (`back` units
// behind it), so a thrust is authored as "front hand slides out, back hand follows the butt".
//
// Combo hand-offs are exact: every opener has the shared LUNGE pose as a key at its cancel time (0.22) and every
// second hit starts on LUNGE; every second hit has the shared HIGH pose as a key at its cancel time (0.25) and
// spear3 starts on HIGH. Change LUNGE / HIGH and all five clips stay in sync.
//
// Weapon angles never wind: every clip ends at the 'ready' angle (-0.85) itself. The one full in-plane whirl
// (spear3) is unwound inside the clip by unwind(), which swaps the angle for the same angle plus a full turn on
// a held pose, so nothing visible happens and a cross-fade out of the clip cannot whirl the spear.
(function(){
  const A=ANIM, S=Math.sin, C=Math.cos, TAU=Math.PI*2;

  // Pose builder.
  //   h     hips [x,y]
  //   lean  spine angle from vertical in radians (+ = leaning forward)
  //   hd    head angle from vertical (default: a bit more than the spine, so the head leads)
  //   f1,f2 back foot, front foot
  //   a     weapon angle
  //   fh    front hand; default is `r` (54) units from the shoulder along the weapon angle
  //   back  how far behind the front hand the back hand holds the shaft (default 38; up to 46 = the butt)
  //   bh    back hand, only to take it off the shaft on purpose
  //   es,bs,k1s,k2s  bend side of front elbow, back elbow, knees (rarely needed)
  function hint(r,e,side){ const dx=e[0]-r[0],dy=e[1]-r[1],d=Math.hypot(dx,dy)||1; return [(r[0]+e[0])/2-dy/d*20*side,(r[1]+e[1])/2+dx/d*20*side]; }
  function B(o){
    const h=o.h, ln=o.lean||0, hd=o.hd===undefined?ln*1.25:o.hd, a=o.a, back=o.back===undefined?38:o.back, r=o.r||54;
    const neck=[h[0]+A.TORSO*S(ln),h[1]-A.TORSO*C(ln)], head=[neck[0]+A.NECK*S(hd),neck[1]-A.NECK*C(hd)];
    const fh=o.fh||[neck[0]+r*C(a),neck[1]+r*S(a)], bh=o.bh||[fh[0]-back*C(a),fh[1]-back*S(a)];
    const be=hint(neck,bh,o.bs||1), fe=hint(neck,fh,o.es||1), k1=hint(h,o.f1,o.k1s||-1), k2=hint(h,o.f2,o.k2s||-1);
    return [head[0],head[1],neck[0],neck[1],h[0],h[1],be[0],be[1],bh[0],bh[1],fe[0],fe[1],fh[0],fh[1],k1[0],k1[1],o.f1[0],o.f1[1],k2[0],k2[1],o.f2[0],o.f2[1],a];
  }
  // Four keys within 3 ms that hold pose `p` and add `turns` full turns to its weapon angle without anything moving.
  function unwind(t,p,turns){
    const q=p.slice(); q[22]+=TAU*turns;
    return [{t:t,p:p},{t:t+.001,p:p,ease:'hold'},{t:t+.002,p:q,ease:'hold'},{t:t+.003,p:q,ease:'hold'}];
  }

  // The base 'ready' stance with the back hand moved onto the shaft.
  const READY=A.P('ready',{bh:[2,-61],be:[-30,-84]});
  const AIR=A.P('air',{bh:[27,-104],be:[-8,-100]});

  // Shared hand-off poses.
  // LUNGE: just after a thrust. Deep front stance, spear level and low in front, front hand part-way back.
  const LUNGE=B({h:[12,-52],lean:.42,hd:.35,f1:[-56,0],f2:[62,0],a:.1,fh:[62,-78],back:40});
  // HIGH: end of a rising sweep. Tall and arched, spear carried up and back over the head, body part-turned.
  const HIGH=B({h:[-8,-72],lean:-.24,hd:-.05,f1:[-24,0],f2:[30,-38],a:-2.0,fh:[-30,-174],back:36});
  const HIGH_TURN=.75;

  // ---------------------------------------------------------------- combo 1
  // Snapping lunge thrust: draw the spear back level over a lifted front foot, drive off the back leg, front
  // hand slides out along the shaft, hold at full stretch, ease back to LUNGE.
  A.add('spear1',{dur:.30,weapon:'spear',
    keys:[
      {t:0,   p:READY},
      {t:.055,p:B({h:[-22,-62],lean:-.28,hd:.05,f1:[-52,0],f2:[26,-26],a:-.1,fh:[-12,-86],back:44}),ease:'out'},
      {t:.11, p:B({h:[10,-56],lean:.4,f1:[-52,0],f2:[58,0],a:0,fh:[42,-84],back:44}),ease:'in'},
      {t:.135,p:B({h:[20,-48],lean:.62,hd:.5,f1:[-62,0],f2:[66,0],a:.03,fh:[104,-80],back:46}),ease:'out'},
      {t:.17, p:B({h:[22,-46],lean:.68,hd:.52,f1:[-64,0],f2:[66,0],a:.04,fh:[106,-78],back:46})},
      {t:.22, p:LUNGE},
      {t:.30, p:READY}
    ],
    marks:[{t:.11,type:'hit'}]});

  // Alternate opener: rise onto the toes and pirouette with the spear whirling flat overhead (seen edge-on as
  // the body turns), then chop it down out of the turn into a low thrust.
  A.add('spear1_b',{dur:.30,weapon:'spear',
    keys:[
      {t:0,   p:READY,turn:1},
      {t:.03, p:B({h:[0,-74],lean:-.05,f1:[-28,0],f2:[28,-4],a:-.4,fh:[16,-178],back:30}),turn:0,ease:'in'},
      {t:.055,p:B({h:[0,-78],lean:-.08,f1:[-20,-6],f2:[22,-8],a:-.25,fh:[14,-186],back:30}),turn:-1,ease:'out'},
      {t:.08, p:B({h:[0,-76],lean:-.1,f1:[-22,-4],f2:[24,-6],a:-.9,fh:[4,-186],back:30}),turn:0,ease:'in'},
      {t:.11, p:B({h:[12,-58],lean:.4,f1:[-44,0],f2:[54,0],a:-.08,fh:[44,-106],back:38}),turn:1,ease:'linear'},
      {t:.14, p:B({h:[20,-48],lean:.6,hd:.5,f1:[-58,0],f2:[64,0],a:.2,fh:[92,-70],back:46}),turn:1,ease:'out'},
      {t:.175,p:B({h:[21,-46],lean:.64,hd:.5,f1:[-60,0],f2:[64,0],a:.22,fh:[92,-66],back:46}),turn:1},
      {t:.22, p:LUNGE,turn:1},
      {t:.30, p:READY,turn:1}
    ],
    trail:[[.035,.15]], marks:[{t:.11,type:'hit'}]});

  // ---------------------------------------------------------------- combo 2
  // Rising sweep out of the lunge: snatch the spear back so the tip drops to the floor, then whip it up across
  // the front off both legs, small hop, body turning with it, spear carried up and over to HIGH.
  A.add('spear2',{dur:.34,weapon:'spear',
    keys:[
      {t:0,   p:LUNGE},
      {t:.05, p:B({h:[-8,-46],lean:.3,hd:.5,f1:[-52,0],f2:[56,0],a:.4,fh:[16,-72],back:36}),ease:'out'},
      {t:.12, p:B({h:[12,-62],lean:.22,hd:.1,f1:[-36,0],f2:[50,0],a:-.1,fh:[52,-94],back:38}),ease:'in'},
      {t:.17, p:B({h:[6,-88],lean:-.2,hd:-.4,f1:[-22,-14],f2:[32,-30],a:-1.45,fh:[12,-192],back:36}),turn:.85,ease:'out'},
      {t:.25, p:HIGH,turn:HIGH_TURN},
      {t:.34, p:READY}
    ],
    trail:[[.06,.2]], marks:[{t:.12,type:'hit'}]});

  // Alternate second hit: leg sweep. Drop into a deep crouch turning the back to the target with the spear low
  // behind, whip round so the tip scythes across the floor in front, then let it carry up and over to HIGH.
  A.add('spear2_b',{dur:.34,weapon:'spear',
    keys:[
      {t:0,   p:LUNGE,turn:1},
      {t:.05, p:B({h:[-2,-44],lean:.3,hd:.4,f1:[-44,0],f2:[52,0],a:.3,fh:[30,-80],back:38}),turn:-1},
      {t:.12, p:B({h:[-4,-42],lean:.55,hd:.3,f1:[-52,0],f2:[66,0],a:.22,fh:[38,-66],back:38}),turn:1,ease:'in'},
      {t:.15, p:B({h:[0,-42],lean:.48,hd:.25,f1:[-52,0],f2:[66,0],a:.1,fh:[48,-72],back:38}),turn:1,ease:'out'},
      {t:.20, p:B({h:[4,-74],lean:-.05,hd:-.25,f1:[-28,-4],f2:[36,-18],a:-1.2,fh:[26,-176],back:36}),turn:.9,ease:'in'},
      {t:.25, p:HIGH,turn:HIGH_TURN},
      {t:.34, p:READY}
    ],
    trail:[[.06,.22]], marks:[{t:.12,type:'hit'}]});

  // ---------------------------------------------------------------- combo 3
  // Finisher: chop the spear down out of HIGH into a high chamber, then three stabs (high, mid, low), each a
  // full draw-back and drive with the hips sinking lower every time. Rip the spear up out of the last stab into
  // a full whirl overhead on the toes, slam it down into a planted low guard, hold, recover.
  const PLANT=B({h:[10,-44],lean:.55,hd:.45,f1:[-60,0],f2:[58,0],a:.453-TAU,fh:[36,-84],back:38});
  A.add('spear3',{dur:.62,weapon:'spear',
    keys:[
      {t:0,   p:HIGH,turn:HIGH_TURN},
      {t:.08, p:B({h:[-14,-64],lean:-.14,hd:.1,f1:[-50,0],f2:[40,-8],a:-.16,fh:[-6,-100],back:42}),ease:'out'},
      {t:.18, p:B({h:[14,-64],lean:.36,hd:.2,f1:[-54,0],f2:[58,0],a:-.22,fh:[84,-112],back:46}),ease:'in'},
      {t:.215,p:B({h:[-12,-56],lean:-.05,hd:.15,f1:[-52,0],f2:[44,0],a:.02,fh:[-6,-82],back:42}),ease:'out'},
      {t:.255,p:B({h:[18,-52],lean:.5,hd:.4,f1:[-58,0],f2:[62,0],a:.03,fh:[92,-80],back:46}),ease:'in'},
      {t:.295,p:B({h:[-10,-46],lean:.1,hd:.3,f1:[-52,0],f2:[46,0],a:.2,fh:[-4,-74],back:42}),ease:'out'},
      {t:.335,p:B({h:[18,-40],lean:.7,hd:.5,f1:[-62,0],f2:[62,0],a:.2,fh:[86,-60],back:46}),ease:'in'},
      {t:.375,p:B({h:[8,-60],lean:.15,hd:-.1,f1:[-44,0],f2:[48,0],a:-1.2,fh:[26,-150],back:24}),ease:'linear'},
      {t:.415,p:B({h:[0,-84],lean:-.12,hd:-.3,f1:[-22,-10],f2:[24,-14],a:-2.9,fh:[4,-186],back:22}),ease:'linear'},
      {t:.45, p:B({h:[0,-92],lean:-.05,hd:-.2,f1:[-20,-18],f2:[22,-22],a:-4.4,fh:[4,-198],back:22}),ease:'linear'},
      {t:.472,p:B({h:[4,-78],lean:.2,hd:.1,f1:[-40,-6],f2:[40,-10],a:-5.3,fh:[16,-162],back:30}),ease:'linear'}
    ].concat(unwind(.49,PLANT,1),[
      {t:.55, p:B({h:[8,-48],lean:.5,hd:.4,f1:[-60,0],f2:[58,0],a:.42,fh:[36,-88],back:38})},
      {t:.62, p:READY}
    ]),
    trail:[[.345,.49]], marks:[{t:.16,type:'hit'},{t:.24,type:'hit'},{t:.32,type:'hit'}]});

  // ---------------------------------------------------------------- variants
  // Running attack: lance charge. Tuck the spear back under the arm, throw the body flat behind it with the
  // back leg flying, drive it through, then rear up and skid on the front heel.
  A.add('spear_run',{dur:.44,weapon:'spear',
    keys:[
      {t:0,   p:B({h:[0,-64],lean:.5,f1:[-40,-12],f2:[34,0],a:.12,fh:[34,-84],back:38})},
      {t:.08, p:B({h:[-12,-56],lean:.55,hd:.75,f1:[-46,0],f2:[40,-14],a:-.04,fh:[-4,-86],back:40}),ease:'out'},
      {t:.15, p:B({h:[8,-50],lean:1.0,hd:.75,f1:[-66,-16],f2:[50,0],a:0,fh:[56,-72],back:44}),ease:'in'},
      {t:.18, p:B({h:[16,-46],lean:1.12,hd:.8,f1:[-74,-22],f2:[54,0],a:.02,fh:[100,-66],back:46}),ease:'out'},
      {t:.23, p:B({h:[16,-44],lean:1.15,hd:.8,f1:[-72,-8],f2:[56,0],a:.03,fh:[102,-63],back:46})},
      {t:.31, p:B({h:[-14,-50],lean:-.12,hd:.2,f1:[-34,0],f2:[62,0],a:-.3,fh:[30,-88],back:40})},
      {t:.44, p:READY}
    ],
    marks:[{t:.15,type:'hit'}]});

  // Air attack: diving stab inside a forward flip. Tuck with the spear pulled in, roll over the top, then
  // straighten out head-first with the spear driven down the body line (world angle about 0.9), hold, and
  // finish the flip. Ends on rot 6.283 = upright; the game treats the end of the clip as rot 0.
  A.add('spear_air',{dur:.42,weapon:'spear',
    keys:[
      {t:0,   p:AIR,rot:0},
      {t:.07, p:B({h:[0,-80],lean:.3,hd:.5,f1:[-22,-50],f2:[20,-46],a:-1.9,fh:[-6,-150],back:30}),rot:-.25,ease:'out'},
      {t:.14, p:B({h:[0,-88],lean:.15,f1:[-26,-48],f2:[14,-38],a:-1.65,fh:[4,-168],back:34}),rot:1.2,ease:'in'},
      {t:.20, p:B({h:[0,-98],lean:0,hd:0,f1:[-14,-24],f2:[6,-18],a:-1.57,fh:[2,-194],back:40}),rot:2.2,ease:'linear'},
      {t:.235,p:B({h:[0,-100],lean:-.05,hd:-.1,f1:[-18,-22],f2:[-2,-20],a:-1.57,fh:[0,-224],back:46}),rot:2.47,ease:'out'},
      {t:.28, p:B({h:[0,-98],lean:-.05,hd:-.1,f1:[-18,-20],f2:[-2,-18],a:-1.57,fh:[0,-221],back:46}),rot:2.6},
      {t:.35, p:B({h:[0,-82],lean:.3,f1:[-20,-50],f2:[22,-48],a:-1.3,fh:[20,-152],back:30}),rot:5.0,ease:'in'},
      {t:.42, p:AIR,rot:6.283,ease:'out'}
    ],
    marks:[{t:.20,type:'hit'}]});

  // Launcher: sink into a deep crouch stabbing the tip to the floor in front, then the legs fire and the spear
  // is ripped up off the floor to overhead; the fighter leaves the ground and pirouettes once with the spear
  // twirling above before landing.
  A.add('spear_up',{dur:.48,weapon:'spear',
    keys:[
      {t:0,   p:READY,turn:1},
      {t:.09, p:B({h:[-10,-42],lean:.5,hd:.7,f1:[-48,0],f2:[48,0],a:.34,fh:[34,-76],back:38}),turn:1,ease:'out'},
      {t:.13, p:B({h:[-4,-48],lean:.38,hd:.4,f1:[-46,0],f2:[48,0],a:.3,fh:[42,-76],back:38}),turn:1,ease:'in'},
      {t:.18, p:B({h:[8,-76],lean:.05,hd:-.1,f1:[-30,0],f2:[40,0],a:-.14,fh:[50,-106],back:38}),turn:1,ease:'linear'},
      {t:.225,p:B({h:[4,-100],lean:-.2,hd:-.4,f1:[-18,-20],f2:[24,-26],a:-1.5,fh:[12,-196],back:34}),turn:1,ease:'out'},
      {t:.27, p:B({h:[0,-104],lean:-.1,hd:-.15,f1:[-12,-24],f2:[14,-28],a:-2.2,fh:[-22,-198],back:30}),turn:0,ease:'in'},
      {t:.31, p:B({h:[0,-100],lean:-.12,f1:[-16,-20],f2:[16,-24],a:-2.7,fh:[-40,-176],back:30}),turn:-1,ease:'out'},
      {t:.35, p:B({h:[0,-86],lean:-.1,f1:[-22,-8],f2:[22,-10],a:-2.4,fh:[-32,-176],back:30}),turn:0,ease:'in'},
      {t:.39, p:B({h:[-2,-50],lean:.2,hd:.3,f1:[-48,0],f2:[50,0],a:-1.9,fh:[4,-146],back:36}),turn:1,ease:'out'},
      {t:.48, p:READY,turn:1}
    ],
    trail:[[.10,.24]], marks:[{t:.18,type:'hit'}]});
})();
