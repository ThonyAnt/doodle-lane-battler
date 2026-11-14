// Thrown-weapon move set (shuriken, kunai, knives, cards, rocks): stance, throw, backhand follow-ups, aerial fan,
// charged spin throw, plus random alternates.
// The FRONT hand carries the projectile. At every shot mark the throwing hand is just reaching full extension
// forward of the body at chest height and still travelling fast (arrive with ease 'in'/'linear', leave with 'out'),
// so the game can spawn the projectile at the hand. Throws marked BACK HAND put the back hand there instead.
// Order of every throw: hips and chest coil away -> elbow leads with the hand lagging behind it -> arm cracks
// straight at the mark -> hand carries on across the body while the off arm rips the opposite way.
(function(){
  const TORSO=ANIM.TORSO, NECK=ANIM.NECK;

  // Pose builder. The body hangs off the hips and a torso lean, hands are given relative to the shoulder.
  //   h [x,y] hips      lean  torso angle from vertical (positive = forward)      tilt  extra head angle
  //   f / b    front / back hand RELATIVE TO THE SHOULDER (reach is 72)           fA / bA  same, absolute
  //   fs / bs  elbow side: 1 = elbow below a forward arm / above a backward arm, -1 = the other way
  //   f1,f2    back / front foot        k1,k2  knee hints (default: knees forward)     a  projectile angle
  function hint(r,e,side){ const dx=e[0]-r[0],dy=e[1]-r[1],d=Math.hypot(dx,dy)||1; return [(r[0]+e[0])/2-dy/d*22*side,(r[1]+e[1])/2+dx/d*22*side]; }
  function H(o){
    const hx=o.h[0],hy=o.h[1],l=o.lean||0,hl=l+(o.tilt||0);
    const nx=hx+Math.sin(l)*TORSO, ny=hy-Math.cos(l)*TORSO;
    const fh=o.fA||[nx+o.f[0],ny+o.f[1]], bh=o.bA||[nx+o.b[0],ny+o.b[1]];
    const fe=hint([nx,ny],fh,o.fs||1), be=hint([nx,ny],bh,o.bs||1);
    const f1=o.f1||[-46,0], f2=o.f2||[44,0];
    const k1=o.k1||[(hx+f1[0])/2+20,(hy+f1[1])/2-4], k2=o.k2||[(hx+f2[0])/2+20,(hy+f2[1])/2-4];
    return [nx+Math.sin(hl)*NECK,ny-Math.cos(hl)*NECK,nx,ny,hx,hy,be[0],be[1],bh[0],bh[1],fe[0],fe[1],fh[0],fh[1],
      k1[0],k1[1],f1[0],f1[1],k2[0],k2[1],f2[0],f2[1],o.a||0];
  }
  function K(t,o,ease,extra){ const k={t:t,p:Array.isArray(o)?o:H(o)}; if(ease) k.ease=ease; if(extra) for(const x in extra) k[x]=extra[x]; return k; }

  // ---- shared poses -------------------------------------------------------------------------------------------
  // Low side-on crouch: projectile cocked up beside the ear, elbow down and back, off hand out in front as a sight.
  const STANCE={h:[0,-58],lean:0.2,tilt:-0.1,f:[-32,-12],fs:-1,b:[44,12],f1:[-46,0],f2:[44,0],a:-2.3};
  const STANCE_IN={h:[-1,-54],lean:0.24,tilt:-0.12,f:[-33,-8],fs:-1,b:[46,16],f1:[-46,0],f2:[44,0],a:-2.4};
  // Where hurl_shot is at t=0.22: follow-through spent, throwing hand wrapped across the body at the rear hip,
  // chest still turned over the front knee. This IS the wind-up of the backhand, so the quick throws start here.
  const REC={h:[8,-55],lean:0.42,tilt:-0.22,f:[-40,26],fs:1,b:[30,-6],bs:-1,f1:[-52,0],f2:[50,0],a:2.2};
  // Where the quick throws end: halfway back to the stance.
  const EASY={h:[4,-57],lean:0.3,tilt:-0.15,f:[-34,6],fs:-1,b:[36,6],f1:[-49,0],f2:[47,0],a:0.4};

  ANIM.POSES.hurl_stance=H(STANCE);
  ANIM.POSES.hurl_rec=H(REC);

  // ---- 1. stance ----------------------------------------------------------------------------------------------
  ANIM.add('hurl_stance',{
    dur:1.0, loop:true, weapon:'star',
    keys:[ K(0,STANCE), K(0.5,STANCE_IN), K(1.0,STANCE) ]
  });

  // ---- 2. standard throw --------------------------------------------------------------------------------------
  // Overhand whip: sit back onto the rear leg with the arm stretched out behind, stride, elbow leads, crack.
  ANIM.add('hurl_shot',{
    dur:0.30, weapon:'star',
    keys:[
      K(0,STANCE),
      // coil: weight on the rear leg, chest laid back, arm far behind, front foot picked up, off hand sights the target
      K(0.05,{h:[-16,-54],lean:-0.4,tilt:0.35,f:[-62,-22],fs:1,b:[68,-6],f1:[-48,0],f2:[30,-30],k2:[34,-62],a:-2.6},'out'),
      // stride lands, hips already forward, elbow leading with the hand still behind the head
      K(0.09,{h:[6,-58],lean:0.2,tilt:-0.05,f:[-22,-36],fs:1,b:[28,12],f1:[-54,0],f2:[56,-2],a:-1.4},'in'),
      // release: whole body over the front leg, arm straight at chest height, off arm ripped back
      K(0.12,{h:[13,-53],lean:0.5,tilt:-0.25,f:[63,-10],b:[-62,-16],f1:[-66,0],f2:[60,0],a:0},'linear'),
      // follow-through: hand carries down across the body past the front knee, back heel peels up
      K(0.16,{h:[19,-48],lean:0.86,tilt:-0.4,f:[-20,58],fs:-1,b:[-56,-42],f1:[-62,-8],f2:[60,0],a:1.5},'out'),
      K(0.22,REC),
      K(0.30,STANCE)
    ],
    marks:[{t:0.12,type:'shot'}]
  });

  // Alternate: underhand scoop. Drops into a deep crouch with the arm swung up behind, the hand skims the floor
  // and releases on the way up, finishing tall with the arm high.
  ANIM.add('hurl_shot_b',{
    dur:0.30, weapon:'star',
    keys:[
      K(0,STANCE),
      // deep crouch, chest down over the front knee, arm swung up behind like a bowler, off hand low in front
      K(0.05,{h:[-8,-38],lean:0.62,tilt:-0.35,f:[-58,-26],fs:1,b:[34,36],f1:[-58,0],f2:[50,0],a:-2.4},'out'),
      // bottom of the scoop: hand skimming the floor under the body
      K(0.09,{h:[0,-40],lean:0.42,tilt:-0.3,f:[4,66],fs:-1,b:[16,24],f1:[-58,0],f2:[54,0],a:1.0},'in'),
      // release on the upswing: legs drive up, arm straight out
      K(0.12,{h:[10,-60],lean:0.14,tilt:-0.05,f:[66,2],b:[-50,22],f1:[-54,0],f2:[54,0],a:0},'linear'),
      // follow-through: up onto the toes, arm sweeps high overhead, chest open, off arm down behind
      K(0.16,{h:[9,-74],lean:-0.2,tilt:0.25,f:[34,-58],fs:1,b:[-44,40],f1:[-42,-6],f2:[44,-10],a:-1.3},'out'),
      K(0.22,REC),
      K(0.30,STANCE)
    ],
    marks:[{t:0.12,type:'shot'}]
  });

  // ---- 3. follow-up throws ------------------------------------------------------------------------------------
  // Cross-body backhand: the hand is already wrapped across the body, it tucks to the far shoulder with the elbow
  // pointing at the target, then the arm unfolds outward and the chest snaps open.
  ANIM.add('hurl_quick',{
    dur:0.22, weapon:'star',
    keys:[
      K(0,REC),
      // tuck: shoulders turned away, hand at the rear shoulder, elbow aimed forward, off hand out front
      K(0.04,{h:[-5,-55],lean:0.06,tilt:0.25,f:[-22,8],fs:-1,b:[50,10],f1:[-52,0],f2:[46,-6],a:3.4},'out'),
      // release: arm unfolded straight, chest open, off arm ripped back and down
      K(0.08,{h:[10,-58],lean:0.3,tilt:-0.15,f:[64,-5],b:[-50,16],f1:[-54,0],f2:[54,0],a:0},'in'),
      // follow-through: backhand carries up and out, body rises and rocks back behind it
      K(0.12,{h:[4,-65],lean:-0.1,tilt:0.15,f:[50,-46],fs:1,b:[-58,26],f1:[-50,0],f2:[50,-5],a:-1.2},'out'),
      // hand sweeps back down across the body: same pose the clip starts from, so it chains into itself
      K(0.18,REC),
      K(0.22,EASY)
    ],
    marks:[{t:0.08,type:'shot'}]
  });

  // Alternate: double flick. Both hands cross at the chest, then snap forward together and fling apart.
  ANIM.add('hurl_quick_b',{
    dur:0.22, weapon:'star',
    keys:[
      K(0,REC),
      // crossed arms: sink, both hands at the opposite shoulders, elbows stacked pointing forward
      K(0.04,{h:[-7,-48],lean:0.04,tilt:0.2,f:[-22,4],fs:-1,b:[-6,26],bs:-1,f1:[-54,0],f2:[50,0],a:3.2},'out'),
      // release: both arms straight in a narrow V, body lunging behind them, back foot skips off the floor
      K(0.08,{h:[11,-55],lean:0.46,tilt:-0.25,f:[63,-10],b:[58,10],f1:[-52,-10],f2:[56,0],a:0},'in'),
      // fling apart: front hand high, back hand low behind, chest thrown open
      K(0.12,{h:[5,-62],lean:-0.06,tilt:0.1,f:[42,-54],fs:1,b:[-50,40],f1:[-52,-2],f2:[52,0],a:-1.3},'out'),
      K(0.18,REC),
      K(0.22,EASY)
    ],
    marks:[{t:0.08,type:'shot'}]
  });

  // ---- 4. aerial fan ------------------------------------------------------------------------------------------
  // Three throws while the body pitches from laid-back to piked: front hand level, BACK hand 35 degrees down,
  // front hand steeply down. Each arm re-cocks while the other one throws.
  const AIR=ANIM.POSES.air;
  ANIM.add('hurl_air',{
    dur:0.36, weapon:'star',
    keys:[
      K(0,AIR),
      // twist away: laid back, throwing arm cocked behind the head, knees snatching up
      K(0.05,{h:[-2,-80],lean:-0.36,tilt:0.3,f:[-44,-36],fs:1,b:[52,-4],f1:[-30,-16],f2:[34,-70],k2:[38,-112],a:-2.4},'out'),
      // throw 1, front hand, level
      K(0.10,{h:[2,-80],lean:0.28,tilt:-0.15,f:[66,14],b:[-40,-34],bs:1,f1:[-70,-48],f2:[16,-60],k2:[38,-98],a:0},'in'),
      // front hand carries down across, back elbow leads through
      K(0.14,{h:[2,-81],lean:0.36,tilt:-0.2,f:[-6,56],fs:-1,b:[-10,-40],bs:1,f1:[-50,-50],k1:[-10,-70],f2:[10,-30],k2:[30,-66],a:1.6},'out'),
      // throw 2, BACK hand, forward and down
      K(0.18,{h:[0,-82],lean:0.52,tilt:-0.25,f:[-56,6],fs:1,b:[57,36],f1:[14,-62],k1:[36,-100],f2:[-24,-8],a:-2.8},'in'),
      // back hand carries down under the body, front arm up behind the head again
      K(0.22,{h:[0,-83],lean:0.6,tilt:-0.3,f:[-36,-44],fs:1,b:[-12,60],bs:-1,f1:[-10,-50],k1:[26,-76],f2:[-44,-22],a:-1.6},'out'),
      // throw 3, front hand, steeply down: fully piked, legs flung up behind
      K(0.26,{h:[-2,-86],lean:0.82,tilt:-0.3,f:[32,62],b:[-50,-30],bs:1,f1:[-66,-78],k1:[-26,-64],f2:[-60,-40],k2:[-22,-48],a:1.0},'in'),
      // hand whips through under the body
      K(0.30,{h:[-1,-83],lean:0.6,tilt:-0.2,f:[-24,60],fs:-1,b:[-56,-22],bs:1,f1:[-56,-44],k1:[-18,-50],f2:[-12,-22],k2:[14,-52],a:2.4},'out'),
      K(0.36,AIR)
    ],
    marks:[{t:0.10,type:'shot'},{t:0.18,type:'shot'},{t:0.26,type:'shot'}]
  });

  // ---- 5. charged throw ---------------------------------------------------------------------------------------
  // Long lean-back wind-up, a low 360 spin that speeds up, a leap out of the spin with the arm cocked high,
  // release at the top with the body thrown flat forward, then a landing slam with the hand raking the floor.
  ANIM.add('hurl_power',{
    dur:0.66, weapon:'star',
    keys:[
      K(0,STANCE),
      // big wind-up: one long diagonal from the front heel to the hand stretched far behind
      K(0.10,{h:[-18,-50],lean:-0.56,tilt:0.35,f:[-66,14],fs:1,b:[54,-30],f1:[-40,0],f2:[58,0],k2:[26,-34],a:-3.0},'out',{turn:1}),
      // spin, first half (slower): low, arms flung wide by the turn, back to the opponent
      K(0.20,{h:[0,-44],lean:0.26,tilt:-0.1,f:[-64,-6],fs:1,b:[56,8],f1:[-34,0],f2:[36,-5],a:-6.0},'in',{turn:-1}),
      // spin, second half (faster): comes round to the front loaded on the back leg, arm trailing
      K(0.28,{h:[-8,-46],lean:-0.12,tilt:0.2,f:[-62,-22],fs:1,b:[50,-4],f1:[-36,0],f2:[40,0],a:-9.0},'linear',{turn:1}),
      // leap: arched back at the top, arm cocked high behind the head, front knee driven up, off hand sights
      K(0.355,{h:[-2,-108],lean:-0.42,tilt:0.35,f:[-44,-46],fs:1,b:[62,0],f1:[-48,-62],k1:[-8,-72],f2:[30,-76],k2:[36,-118],a:-11.0},'out'),
      // elbow leads, body starting to fold forward
      K(0.395,{h:[8,-104],lean:0.14,tilt:-0.1,f:[-16,-46],fs:1,b:[30,22],f1:[-56,-66],k1:[-16,-76],f2:[40,-58],k2:[44,-100],a:-11.8},'in'),
      // release: body flat out forward in the air, arm slammed straight, back leg and off arm thrown out behind
      K(0.42,{h:[14,-84],lean:0.56,tilt:-0.25,f:[59,16],b:[-62,-22],f1:[-66,-70],k1:[-26,-68],f2:[48,-30],k2:[54,-68],a:-12.566},'linear'),
      // landing slam: deep over the front leg, hand raking the floor, back leg still high
      K(0.47,{h:[20,-40],lean:1.12,tilt:-0.45,fA:[58,-12],fs:-1,b:[-58,-36],f1:[-62,-22],k1:[-20,-34],f2:[52,0],a:-11.2},'out'),
      // overshoot: hand drags on behind along the floor, back foot comes down
      K(0.54,{h:[17,-42],lean:1.0,tilt:-0.4,fA:[14,-13],fs:-1,b:[-52,-44],f1:[-60,0],f2:[52,0],a:-10.6},'out'),
      // rise
      K(0.61,{h:[7,-54],lean:0.44,tilt:-0.2,f:[-36,16],fs:-1,b:[30,-2],f1:[-52,0],f2:[48,0],a:-13.6}),
      // same angle as the stance two full turns on (looks identical), then jump to the stance angle itself
      K(0.659,H(STANCE).slice(0,22).concat([-2.3-4*Math.PI])),
      K(0.66,STANCE,'hold')
    ],
    marks:[{t:0.42,type:'shot'}]
  });
})();
