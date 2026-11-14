// The ultimate (move `fleet` in the rules): the fighter sinks, floats up with the weapon raised while copies of the
// drawing gather in a fan overhead, then snaps the arm down at the foe to send them, and hangs there until the volley is out.
// The rules lift the fighter a little during the rise; the tucked feet here add the rest of the float.
(function(){
  const A=ANIM, P=A.P;
  // Sunk and coiled: the anticipation before the rise.
  const COIL=P('ready',{hips:[-2,-46],neck:[-12,-98],head:[-12,-121],fh:[10,-66],bh:[-30,-62],ang:1.0});
  // Aloft: chest open, weapon straight up, back arm thrown wide, legs tucked one above the other.
  const RISE=P('cheer',{hips:[0,-92],neck:[-6,-146],head:[-12,-168],fh:[14,-212],bh:[-58,-158],f1:[-20,-26],k1:[-30,-62],f2:[16,-44],k2:[28,-72],ang:-1.62});
  const HOLD=P(RISE,{hips:[0,-96],neck:[-9,-150],head:[-17,-171],fh:[6,-216],bh:[-64,-166],f1:[-22,-30],f2:[14,-48],ang:-1.78});
  // The command: the whole body whips forward and the weapon points at the foe.
  const SEND=P(RISE,{hips:[0,-90],neck:[12,-143],head:[26,-162],fh:[70,-136],bh:[-36,-112],f1:[-34,-22],k1:[-30,-58],f2:[10,-36],k2:[26,-66],ang:0.12});
  const KEEP=P(SEND,{neck:[10,-144],head:[23,-164],fh:[66,-140],bh:[-40,-118],ang:0.04});
  A.add('fleet',{dur:1.5,weapon:'blade',punch:0,
    keys:[
      {t:0,   p:'ready'},
      {t:.12, p:COIL,ease:'out'},
      {t:.36, p:RISE,ease:'snap'},
      {t:.54, p:HOLD,ease:'smooth'},
      {t:.62, p:SEND,ease:'in'},
      {t:.70, p:P(SEND,{fh:[74,-130],ang:0.2}),ease:'out'},
      {t:1.22,p:KEEP,ease:'smooth'},
      {t:1.38,p:P('ready',{hips:[0,-54],neck:[-10,-106],head:[-10,-129]}),ease:'in'},
      {t:1.5, p:'ready',ease:'out'}
    ],
    trail:[[.56,.68]], marks:[{t:.62,type:'cast'}]});

  // ---------------------------------------------------------------- hammer: EARTHSHAKER
  // Sink, leap with the hammer hauled up behind the head (the rules lift the fighter), come down on it with the whole
  // body, and stay bent over the head of the hammer while the ground settles.
  const HAUL=P('leap',{hips:[0,-84],neck:[-14,-136],head:[-22,-157],fh:[-40,-186],bh:[-52,-176],f1:[-30,-34],k1:[-36,-66],f2:[14,-50],k2:[30,-76],ang:-2.5});
  const SLAM=P('follow',{hips:[8,-46],neck:[40,-88],head:[58,-104],fh:[86,-46],bh:[74,-50],f1:[-56,0],f2:[52,0],ang:.36});
  A.add('ult_slam',{dur:1.15,weapon:'hammer',punch:0,
    keys:[
      {t:0,   p:'ready'},
      {t:.1,  p:COIL,ease:'out',grip:1},
      {t:.3,  p:HAUL,ease:'snap',grip:1},
      {t:.42, p:P(HAUL,{fh:[-48,-190],ang:-2.75}),grip:1},
      {t:.5,  p:SLAM,ease:'in',orbit:.4,grip:1},
      {t:.56, p:P(SLAM,{hips:[8,-40],neck:[42,-80],head:[62,-94],fh:[88,-40],ang:.31}),ease:'out',grip:1},
      {t:.85, p:P(SLAM,{hips:[6,-48]}),grip:1},
      {t:1.15,p:'ready'}
    ],
    trail:[[.42,.58]], marks:[{t:.56,type:'cast'}]});

  // ---------------------------------------------------------------- fists: HUNDRED HANDS
  // Coil back, lunge, then the two hands take turns as fast as they can; the last one is a full-body straight.
  const JAB_F=P('thrust',{hips:[6,-66],neck:[22,-116],head:[36,-136],fh:[78,-112],bh:[4,-104],f1:[-50,0],f2:[46,0],ang:0});
  const JAB_B=P('thrust',{hips:[2,-66],neck:[18,-118],head:[32,-138],fh:[20,-108],bh:[74,-120],f1:[-50,0],f2:[46,0],ang:-.2});
  { const keys=[{t:0,p:'ready'},{t:.16,p:P('wind',{hips:[-10,-62],fh:[-30,-104],bh:[-52,-92],ang:-.4}),ease:'out'},{t:.3,p:P(JAB_F,{hips:[14,-60]}),ease:'in'}];
    for(let j=0;j<8;j++) keys.push({t:+(.4+j*.065).toFixed(3),p:j%2?JAB_B:JAB_F,ease:'snap'});
    keys.push({t:.93,p:P(JAB_F,{hips:[16,-58],neck:[36,-106],head:[52,-124],fh:[88,-104],bh:[-30,-96]}),ease:'out'},{t:1.1,p:'ready'});
    A.add('ult_rush',{dur:1.1,weapon:'fist',punch:0,spline:false,keys,marks:[{t:.3,type:'cast'}]}); }

  // ---------------------------------------------------------------- twin blades: CROSS CUT
  // Drop low with both blades drawn back, then three cuts, one for each blink through the foe: the body is already on
  // the far side when each lands, so every cut finishes long and low, facing back the way it came.
  const DRAWN=P('ready',{hips:[-8,-44],neck:[-22,-94],head:[-24,-117],fh:[-44,-70],bh:[-58,-84],f1:[-52,0],f2:[40,0],ang:2.7});
  const CUT_A=P('slash',{hips:[10,-54],neck:[34,-100],head:[50,-118],fh:[88,-92],bh:[-28,-70],f1:[-58,0],f2:[54,0],ang:.15});
  const CUT_B=P('slash',{hips:[10,-52],neck:[32,-98],head:[48,-116],fh:[40,-60],bh:[84,-110],f1:[-58,0],f2:[54,0],ang:1.0});
  A.add('ult_dash',{dur:1.05,weapon:'dual',punch:0,
    keys:[
      {t:0,   p:'ready'},
      {t:.2,  p:DRAWN,ease:'out',ang2:2.9},
      {t:.32, p:P(DRAWN,{hips:[-12,-40]}),ang2:3.0},
      {t:.37, p:CUT_A,ease:'snap',ang2:1.2},
      {t:.52, p:P(CUT_A,{fh:[84,-80],ang:.5}),ang2:1.4},
      {t:.57, p:CUT_B,ease:'snap',ang2:-.1},
      {t:.72, p:P(CUT_B,{bh:[80,-98]}),ang2:.2},
      {t:.77, p:P(CUT_A,{fh:[90,-100],bh:[70,-76],ang:-.1}),ease:'snap',ang2:.35},
      {t:.9,  p:P(CUT_A,{hips:[8,-50],fh:[86,-90],bh:[66,-66],ang:.2}),ang2:.55},
      {t:1.05,p:'ready'}
    ],
    trail:[[.33,.42],[.73,.82]], trail2:[[.53,.62],[.73,.82]], marks:[{t:.36,type:'cast'}]});

  // ---------------------------------------------------------------- bow and gun: SKY PIERCER, BULLET STORM
  // Lean back and draw, drop into a wide braced stance, let go, and ride the recoil until it is over.
  const BRACE=P('thrust',{hips:[-6,-56],neck:[4,-110],head:[14,-131],fh:[58,-112],bh:[10,-108],f1:[-62,0],f2:[50,0],ang:0});
  A.add('ult_shoot',{dur:1.2,weapon:'gun',punch:0,
    keys:[
      {t:0,   p:'ready'},
      {t:.2,  p:P('gather',{hips:[-10,-70],neck:[-26,-122],head:[-34,-143],fh:[30,-150],bh:[-10,-128],ang:-1.1}),ease:'out',pull:.4},
      {t:.44, p:P(BRACE,{neck:[0,-112],head:[8,-134],fh:[54,-114],bh:[-14,-112]}),ease:'smooth',pull:1},
      {t:.5,  p:BRACE,ease:'in',pull:1},
      {t:.56, p:P(BRACE,{hips:[-12,-54],neck:[-6,-108],head:[2,-130],fh:[46,-118],ang:-.14}),ease:'snap',pull:0},
      {t:.7,  p:P(BRACE,{fh:[56,-110],ang:.05})},
      {t:.84, p:P(BRACE,{hips:[-10,-55],fh:[50,-116],ang:-.1})},
      {t:1.04,p:BRACE},
      {t:1.2, p:'ready'}
    ],
    marks:[{t:.5,type:'cast'}]});

  // ---------------------------------------------------------------- twin pistols: CROSSFIRE
  // A quick twirl of both guns, then arms flung out to either side, one gun on each flank, bouncing with every pair of shots.
  const SPREAD=P('ready',{hips:[0,-66],neck:[0,-120],head:[2,-143],fh:[66,-116],bh:[-66,-116],f1:[-44,0],f2:[44,0],ang:0});
  A.add('ult_akimbo',{dur:1.2,weapon:'akimbo',punch:0,
    keys:[
      {t:0,   p:'ready'},
      {t:.16, p:P('gather',{hips:[0,-58],neck:[-4,-110],head:[-4,-133],fh:[18,-92],bh:[-16,-92],ang:-1.6}),ease:'out',ang2:-1.6},
      {t:.34, p:P(SPREAD,{hips:[0,-74],fh:[40,-150],bh:[-40,-150],ang:-4.7}),ease:'smooth',ang2:1.5},
      {t:.45, p:SPREAD,ease:'snap',ang2:Math.PI},
      {t:.53, p:P(SPREAD,{hips:[0,-62],fh:[60,-122],bh:[-60,-122],ang:-.16}),ang2:Math.PI+.16},
      {t:.61, p:SPREAD,ang2:Math.PI},
      {t:.69, p:P(SPREAD,{hips:[0,-62],fh:[60,-122],bh:[-60,-122],ang:-.16}),ang2:Math.PI+.16},
      {t:.77, p:SPREAD,ang2:Math.PI},
      {t:.85, p:P(SPREAD,{hips:[0,-62],fh:[60,-122],bh:[-60,-122],ang:-.16}),ang2:Math.PI+.16},
      {t:.95, p:SPREAD,ang2:Math.PI},
      {t:1.2, p:'ready'}
    ],
    marks:[{t:.45,type:'cast'}]});
})();
