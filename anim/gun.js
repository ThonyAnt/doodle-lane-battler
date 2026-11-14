// Gun clips: gun-kata style. The FRONT hand holds the gun; ang is where the barrel points.
// At every shot mark the barrel is level and the front hand is extended forward at about y=-118.
// Recoil order: barrel + hand first (snap), then shoulder/head, then hips/feet, then a slower re-settle.
// The pose is held flat (ease:'hold') across each mark so the shot frame is exact.
(function(){
  const P=ANIM.P;

  // Low-ready stance: wide and slightly crouched, leaning in, gun forward below the chest with the barrel dipped,
  // off arm hanging behind.
  const STANCE=[-1,-146,-4,-123,0,-69,-34,-98,-30,-68,14,-98,38,-86,-22,-34,-44,0,26,-35,48,0,0.45];
  ANIM.POSES.gun_stance=STANCE;
  const S=set=>P(STANCE,set);

  // One-handed side-on aim: body turned in behind the gun, off hand thrown back as a counterweight.
  const AIM=S({head:[20,-146],neck:[13,-124],hips:[7,-69],be:[-20,-112],bh:[-46,-100],fe:[46,-106],fh:[83,-118],
               k1:[-20,-34],f1:[-46,0],k2:[32,-36],f2:[52,0],ang:0});
  // Where gun_shot is at about t=0.18: gun still high, coming back down. gun_rapid starts and ends here.
  const RECOVER=S({head:[-3,-150],neck:[-1,-127],hips:[0,-73],be:[-28,-110],bh:[-36,-92],fe:[24,-106],fh:[54,-126],
                   k1:[-20,-36],f1:[-48,0],k2:[28,-37],f2:[50,0],ang:-0.32});
  ANIM.POSES.gun_aim=AIM; ANIM.POSES.gun_recover=RECOVER;

  // ---------- stance ----------
  ANIM.add('gun_stance',{
    dur:1.2, loop:true, weapon:'gun',
    keys:[
      {t:0.00, p:STANCE},
      {t:0.60, p:S({head:[-2.5,-143.5],neck:[-5,-120.5],hips:[0,-67.5],bh:[-31,-66],fh:[39,-83.5],ang:0.38})},
      {t:1.20, p:STANCE}
    ]
  });

  // ---------- single shot ----------
  ANIM.add('gun_shot',{
    dur:0.26, weapon:'gun',
    keys:[
      {t:0.00, p:STANCE},
      // anticipation: dip and coil back, gun pulled in to the ribs with the barrel flicked up
      {t:0.03, p:S({head:[-14,-137],neck:[-13,-115],hips:[-6,-63],be:[-34,-92],bh:[-16,-74],fe:[0,-90],fh:[22,-98],ang:-0.6,
                    k1:[-24,-33],k2:[24,-34]}), ease:'out'},
      // snap out to the aim, body turning in behind the gun
      {t:0.07, p:AIM, ease:'snap'},
      {t:0.085,p:AIM, ease:'hold'},
      // recoil 1: barrel and hand kick up and back, shoulder only starts to move
      {t:0.105,p:P(AIM,{head:[14,-148],neck:[8,-125],fe:[32,-114],fh:[54,-142],ang:-0.88,bh:[-52,-106]}), ease:'snap'},
      // recoil 2: shoulder, head and hips rock back, back foot skids, front foot pops off the floor
      {t:0.135,p:S({head:[-27,-143],neck:[-18,-122],hips:[-11,-72],be:[-44,-104],bh:[-66,-118],fe:[8,-120],fh:[32,-142],
                    k1:[-30,-34],f1:[-60,0],k2:[22,-44],f2:[46,-10],ang:-0.78}), ease:'out'},
      // gun starts to fall back toward the line (gun_rapid cuts in around here)
      {t:0.18, p:RECOVER, ease:'smooth'},
      // overshoot low, then stance
      {t:0.225,p:S({head:[2,-143],neck:[-2,-120],hips:[1,-66],fh:[42,-82],ang:0.62}), ease:'smooth'},
      {t:0.26, p:STANCE, ease:'smooth'}
    ],
    marks:[{t:0.08,type:'shot'}]
  });

  // ---------- follow-up shots: walk the shots in ----------
  const DRIVE=P(AIM,{head:[21,-145],neck:[14,-123],hips:[9,-69],fe:[46,-106],fh:[84,-118],bh:[-40,-96],be:[-18,-108],
                     k2:[36,-36],f2:[54,0],k1:[-16,-34],f1:[-44,0]});
  ANIM.add('gun_rapid',{
    dur:0.18, weapon:'gun',
    keys:[
      {t:0.00, p:RECOVER},
      // drive forward and re-level, back foot stamps down behind the shot
      {t:0.04, p:DRIVE, ease:'snap'},
      {t:0.055,p:DRIVE, ease:'hold'},
      // kick
      {t:0.075,p:P(DRIVE,{head:[16,-147],neck:[10,-124],fe:[34,-114],fh:[56,-141],ang:-0.82}), ease:'snap'},
      // body takes it: shoulders back, hips check, off arm pumps forward, back foot shuffles a step
      {t:0.105,p:S({head:[-18,-147],neck:[-11,-125],hips:[-6,-74],be:[-32,-100],bh:[-10,-82],fe:[14,-118],fh:[38,-140],
                    k1:[-12,-40],f1:[-38,-8],k2:[26,-38],f2:[50,0],ang:-0.7}), ease:'out'},
      {t:0.16, p:RECOVER, ease:'smooth'},
      {t:0.18, p:RECOVER, ease:'hold'}
    ],
    marks:[{t:0.05,type:'shot'}]
  });

  // ---------- air shot ----------
  // Laid back in the air, one leg kicked out, the other tucked; the shot shoves the whole body backward.
  const AIRAIM=P('air',{head:[-34,-139],neck:[-20,-121],hips:[16,-82],be:[-50,-104],bh:[-76,-118],fe:[14,-106],fh:[50,-117],
                        k1:[40,-108],f1:[18,-74],k2:[52,-68],f2:[92,-56],ang:0});
  ANIM.add('gun_air',{
    dur:0.28, weapon:'gun',
    keys:[
      {t:0.00, p:'air'},
      // tuck: knees up, gun pulled to the chest
      {t:0.035,p:P('air',{head:[-4,-146],neck:[-4,-124],hips:[4,-78],be:[-34,-110],bh:[-30,-90],fe:[10,-102],fh:[26,-112],
                          k1:[14,-108],f1:[-6,-72],k2:[34,-100],f2:[34,-58],ang:-0.5}), ease:'out'},
      // kick out and lay back, gun punched forward
      {t:0.07, p:AIRAIM, ease:'snap'},
      {t:0.085,p:AIRAIM, ease:'hold'},
      // recoil 1: gun flips up, arm folds
      {t:0.105,p:P(AIRAIM,{fe:[4,-128],fh:[22,-150],ang:-0.95,head:[-38,-136]}), ease:'snap'},
      // recoil 2: whole body thrown back and flatter, legs fly up in front
      {t:0.14, p:P(AIRAIM,{head:[-62,-118],neck:[-42,-106],hips:[-2,-78],be:[-72,-92],bh:[-98,-110],fe:[-22,-130],fh:[0,-152],
                           k1:[30,-104],f1:[58,-88],k2:[36,-90],f2:[74,-104],ang:-1.25}), ease:'out'},
      // curl back up
      {t:0.21, p:P('air',{head:[-20,-146],neck:[-14,-126],hips:[0,-78],be:[-44,-112],bh:[-62,-132],fe:[14,-128],fh:[34,-146],
                          k1:[10,-52],f1:[-10,-22],k2:[30,-62],f2:[40,-24],ang:-1.2}), ease:'smooth'},
      {t:0.28, p:'air', ease:'smooth'}
    ],
    marks:[{t:0.08,type:'shot'}]
  });

  // ---------- charged shot ----------
  // Drop to the back knee, two-handed brace, hold, then a huge kick that throws the arms up and skids him back.
  const KNEEL=S({head:[12,-129],neck:[6,-108],hips:[-6,-54],be:[30,-96],bh:[58,-112],fe:[40,-100],fh:[76,-116],
                 k1:[-26,-14],f1:[-62,0],k2:[32,-42],f2:[40,0],ang:0});
  const BRACED=P(KNEEL,{head:[15,-127],neck:[8,-107],hips:[-5,-53],fh:[77,-117]});
  ANIM.add('gun_power',{
    dur:0.60, weapon:'gun',
    keys:[
      {t:0.00, p:STANCE},
      // drop: knee going down, gun drawn back to the chest, off hand comes onto the grip
      {t:0.09, p:S({head:[-6,-124],neck:[-6,-102],hips:[-10,-48],be:[-4,-82],bh:[16,-94],fe:[4,-84],fh:[28,-98],
                    k1:[-28,-14],f1:[-60,0],k2:[30,-42],f2:[40,0],ang:-0.7}), grip:0.7, ease:'out'},
      // press out to the braced aim
      {t:0.19, p:KNEEL, grip:1, ease:'snap'},
      // hold: tiny sink and lean into the sights
      {t:0.35, p:BRACED, grip:1, ease:'smooth'},
      {t:0.365,p:BRACED, grip:1, ease:'hold'},
      // recoil 1: both arms thrown up, barrel to the sky
      {t:0.39, p:P(KNEEL,{head:[6,-128],neck:[2,-107],hips:[-8,-53],be:[0,-140],bh:[10,-160],fe:[14,-138],fh:[30,-166],f2:[39,-3],ang:-1.35}), grip:1, ease:'snap'},
      // recoil 2: torso rocked right back, front foot comes off the floor, whole body skids
      {t:0.43, p:S({head:[-44,-112],neck:[-30,-94],hips:[-20,-40],be:[-40,-140],bh:[-34,-164],fe:[-24,-142],fh:[-14,-166],
                    k1:[-38,-10],f1:[-76,0],k2:[16,-52],f2:[34,-16],ang:-1.9}), grip:0.8, ease:'out'},
      // catch: front foot slaps down further back, arms come over the top
      {t:0.50, p:S({head:[-22,-132],neck:[-18,-110],hips:[-14,-58],be:[-30,-124],bh:[-10,-108],fe:[10,-132],fh:[34,-140],
                    k1:[-36,-26],f1:[-66,0],k2:[18,-40],f2:[28,-2],ang:-0.9}), grip:0.3, ease:'smooth'},
      {t:0.60, p:STANCE, ease:'smooth'}
    ],
    marks:[{t:0.36,type:'shot'}]
  });

  // ---------- flourish ----------
  // Two full twirls round the trigger finger with a cocked hip and the off hand on the hip, catch barrel-up by the
  // face, drop to stance. ang ends two turns away from the stance value, so the last key jumps (ease:'hold') to the
  // equivalent angle and the clip hands back to gun_stance without unwinding.
  const T=-4*Math.PI;
  const COCK=S({head:[-22,-150],neck:[-16,-128],hips:[12,-78],be:[-34,-98],bh:[-4,-84],fe:[16,-102],fh:[46,-112],
                k1:[-8,-38],f1:[-30,0],k2:[36,-42],f2:[40,0]});
  const END=S({ang:0.45+T});
  ANIM.add('gun_spin',{
    dur:0.50, weapon:'gun',
    keys:[
      {t:0.00, p:STANCE},
      // dip and throw the gun out low to start the twirl
      {t:0.07, p:P(COCK,{ang:-0.5,fh:[50,-100],hips:[8,-72],neck:[-12,-124],head:[-14,-147]}), ease:'out'},
      // twirl: hand loops up and round, hip pushes out, front heel lifts
      {t:0.17, p:P(COCK,{ang:-0.5+T*0.36,fh:[54,-116]}), ease:'linear'},
      {t:0.27, p:P(COCK,{ang:-0.5+T*0.74,fh:[40,-126],hips:[14,-80],k2:[40,-46],f2:[44,-8]}), ease:'linear'},
      // catch: barrel up beside the face, chin lifted
      {t:0.34, p:P(COCK,{ang:-1.45+T,fe:[8,-104],fh:[22,-138],head:[-24,-152],neck:[-18,-129],hips:[13,-79],bh:[-2,-82]}), ease:'out'},
      {t:0.40, p:P(COCK,{ang:-1.52+T,fe:[8,-104],fh:[21,-140],head:[-25,-152],neck:[-18,-129],hips:[13,-79],bh:[-2,-82]}), ease:'smooth'},
      {t:0.47, p:END, ease:'smooth'},
      {t:0.499,p:END, ease:'hold'},
      {t:0.50, p:STANCE, ease:'hold'}
    ]
  });

  // ---------- alternates ----------
  // Lean-back shot: torso thrown back away from the gun, front leg kicked up, arm locked straight out.
  const LEAN=S({head:[-22,-143],neck:[-12,-123],hips:[10,-73],be:[-44,-118],bh:[-72,-104],fe:[22,-116],fh:[58,-118],
                k1:[-10,-34],f1:[-34,0],k2:[42,-52],f2:[70,-22],ang:0});
  ANIM.add('gun_shot_b',{
    dur:0.26, weapon:'gun',
    keys:[
      {t:0.00, p:STANCE},
      // anticipation: crunch forward over the gun
      {t:0.03, p:S({head:[6,-136],neck:[1,-115],hips:[-2,-64],be:[-22,-92],bh:[-4,-78],fe:[10,-88],fh:[32,-78],ang:0.9,
                    k2:[26,-36],f2:[46,-4]}), ease:'out'},
      {t:0.07, p:LEAN, ease:'snap'},
      {t:0.085,p:LEAN, ease:'hold'},
      // recoil 1
      {t:0.105,p:P(LEAN,{fe:[10,-136],fh:[30,-150],ang:-0.95,head:[-24,-142]}), ease:'snap'},
      // recoil 2: falls further back onto the rear leg, kicked leg swings higher, off arm windmills down
      {t:0.14, p:S({head:[-36,-138],neck:[-24,-120],hips:[2,-70],be:[-56,-104],bh:[-70,-76],fe:[-4,-140],fh:[16,-156],
                    k1:[-18,-32],f1:[-38,0],k2:[40,-58],f2:[74,-36],ang:-1.2}), ease:'out'},
      // rock forward, foot coming down, gun dropping through the line
      {t:0.19, p:S({head:[-6,-150],neck:[-4,-127],hips:[2,-73],be:[-30,-110],bh:[-40,-92],fe:[24,-108],fh:[52,-128],
                    k1:[-20,-36],f1:[-42,0],k2:[30,-40],f2:[52,-6],ang:-0.35}), ease:'smooth'},
      {t:0.23, p:S({head:[2,-143],neck:[-2,-120],hips:[1,-66],fh:[42,-82],ang:0.6}), ease:'smooth'},
      {t:0.26, p:STANCE, ease:'smooth'}
    ],
    marks:[{t:0.08,type:'shot'}]
  });

  // Fanning: low and wide, gun braced out in front of the chest, back hand slaps across the hammer on every shot
  // and rips back behind the body between shots.
  const FAN0=S({head:[8,-130],neck:[2,-109],hips:[-6,-57],be:[-6,-84],bh:[28,-126],fe:[26,-92],fh:[58,-108],
                k1:[-30,-28],f1:[-54,0],k2:[30,-32],f2:[56,0],ang:-0.25});
  const FANSHOT=P(FAN0,{head:[16,-128],neck:[8,-107],hips:[0,-56],be:[28,-90],bh:[60,-126],fe:[38,-94],fh:[74,-116],ang:0});
  ANIM.add('gun_rapid_b',{
    dur:0.18, weapon:'gun',
    keys:[
      {t:0.00, p:FAN0},
      // slap: palm lands on the hammer as the gun is shoved level
      {t:0.04, p:FANSHOT, ease:'snap'},
      {t:0.055,p:FANSHOT, ease:'hold'},
      // kick: muzzle climbs, slapping hand rips back past the ribs
      {t:0.075,p:P(FANSHOT,{head:[12,-129],neck:[5,-108],be:[-6,-80],bh:[20,-92],fe:[28,-100],fh:[56,-130],ang:-0.75}), ease:'snap'},
      // body: shoulders bounce up and back, hips sit, slap hand flung out behind, front foot skips
      {t:0.105,p:P(FAN0,{head:[-8,-135],neck:[-7,-113],hips:[-10,-60],be:[-40,-96],bh:[-46,-70],fe:[16,-104],fh:[44,-124],
                         k2:[28,-36],f2:[52,-6],ang:-0.55}), ease:'out'},
      {t:0.16, p:FAN0, ease:'smooth'},
      {t:0.18, p:FAN0, ease:'hold'}
    ],
    marks:[{t:0.05,type:'shot'}]
  });
})();
