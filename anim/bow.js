// Bow move set: stance, standard shot, rapid follow-up, air shot, charged shot, plus random alternates.
// The FRONT hand holds the bow grip and `ang` is the aim line. The BACK hand is the string hand: at pull p the
// string sits 14+46p units behind the grip along the aim line, so the builder below puts the hand exactly there.
// Every shot releases with an ease:'hold' key AT the shot mark, so pull drops 1 -> 0 in a single frame.
(function(){
  const TORSO=ANIM.TORSO, NECK=ANIM.NECK;

  // Archer pose builder. Everything hangs off the hips and a torso lean, so the body always drives the arms.
  //   hips [x,y]   lean  torso angle from vertical (positive = forward)   tilt  extra head angle
  //   ang          aim angle          pull  string draw 0..1
  //   reach, lift  bow hand sits `reach` along the aim line from the shoulder, `lift` above it (puts the string at the jaw)
  //   fh / fhN     bow hand override (absolute / relative to the shoulder)
  //   bh / bhN     string hand override (absolute / relative to the shoulder); default = on the string
  //   be, fe       elbow hints (absolute)      f1,f2,k1,k2  feet and knee hints
  function B(o){
    const hx=o.hips[0], hy=o.hips[1], l=o.lean||0, hl=l+(o.tilt||0), a=o.ang||0, c=Math.cos(a), s=Math.sin(a);
    const nx=hx+Math.sin(l)*TORSO, ny=hy-Math.cos(l)*TORSO;
    const reach=o.reach===undefined?68:o.reach, lift=o.lift===undefined?10:o.lift, pull=o.pull||0;
    const fh=o.fh||(o.fhN?[nx+o.fhN[0],ny+o.fhN[1]]:[nx+c*reach+s*lift, ny+s*reach-c*lift]);
    const back=14+46*pull;
    const bh=o.bh||(o.bhN?[nx+o.bhN[0],ny+o.bhN[1]]:[fh[0]-c*back, fh[1]-s*back]);
    const be=o.be||[bh[0]-c*30-6, bh[1]-s*30-18];
    const fe=o.fe||[(nx+fh[0])/2, (ny+fh[1])/2+10];
    const f1=o.f1||[-42,0], f2=o.f2||[46,0];
    const k1=o.k1||[(hx+f1[0])/2+20,(hy+f1[1])/2-4], k2=o.k2||[(hx+f2[0])/2+20,(hy+f2[1])/2-4];
    return [nx+Math.sin(hl)*NECK, ny-Math.cos(hl)*NECK, nx,ny, hx,hy, be[0],be[1], bh[0],bh[1], fe[0],fe[1], fh[0],fh[1],
      k1[0],k1[1], f1[0],f1[1], k2[0],k2[1], f2[0],f2[1], a];
  }
  // Key builder: pose and pull always come from the same description, so hand and string cannot disagree.
  function K(t,o,ease,extra){ const k={t:t,p:B(o),pull:o.pull||0}; if(ease) k.ease=ease; if(extra) for(const x in extra) k[x]=extra[x]; return k; }

  // ---- shared poses -------------------------------------------------------------------------------------------
  // Carry/ready: bow low and forward, tipped toward the ground, string hand loose by the hip quiver.
  const STANCE={hips:[0,-70],lean:-0.05,fh:[46,-95],fe:[18,-106],ang:0.32,bh:[-25,-75],be:[-38,-100],f1:[-40,0],f2:[44,0]};
  const STANCE_IN={hips:[0,-71.5],lean:-0.07,fh:[45,-97.5],fe:[17,-108],ang:0.28,bh:[-26,-77],be:[-39,-102.5],f1:[-40,0],f2:[44,0]};
  // "Bow still up" pose that bow_shot passes through at t=0.42; the quick shots start and loop from here.
  const UP={hips:[0,-64],lean:0.03,ang:0.12,reach:60,lift:2,bh:[-36,-98],be:[-48,-118],f1:[-54,0],f2:[56,0]};
  // Where the quick shots end: bow dropping toward the carry, a short blend away from both STANCE and UP.
  const EASY={hips:[0,-67],lean:-0.01,fh:[42,-92],ang:0.4,bh:[-30,-86],be:[-42,-108],f1:[-46,0],f2:[50,0]};
  // Airborne carry, close to the 'air' base pose.
  const AIR={hips:[0,-78],lean:0,fh:[42,-114],fe:[24,-118],ang:0.25,bh:[-36,-108],be:[-34,-126],
    k1:[-16,-46],f1:[-28,-10],k2:[18,-48],f2:[24,-12]};

  ANIM.POSES.bow_stance=B(STANCE);
  ANIM.POSES.bow_up=B(UP);
  ANIM.POSES.bow_air=B(AIR);

  // ---- 1. stance ----------------------------------------------------------------------------------------------
  ANIM.add('bow_stance',{
    dur:1.2, loop:true, weapon:'bow',
    keys:[ K(0,STANCE), K(0.6,STANCE_IN), K(1.2,STANCE) ]
  });

  // ---- 2. standard shot ---------------------------------------------------------------------------------------
  // Shared tail: release at 0.30, follow-through, bow-up settle, back to the carry.
  function shotTail(){
    return [
      // release: string hand already leaving the jaw, torso starts to come forward
      K(0.30,{hips:[-10,-54],lean:-0.33,tilt:0.22,ang:-0.02,bhN:[-16,-16],be:[-70,-124],f1:[-64,0],f2:[64,0]},'hold'),
      // follow-through: string hand flung back behind the head, bow tips forward in the hand, body rocks over the front leg
      K(0.35,{hips:[5,-58],lean:0.16,tilt:-0.08,ang:0.36,reach:66,lift:4,bhN:[-58,-22],be:[-34,-150],f1:[-64,0],f2:[62,0]},'snap'),
      K(0.42,UP,'out'),
      K(0.50,STANCE)
    ];
  }
  ANIM.add('bow_shot',{
    dur:0.50, weapon:'bow',
    keys:[
      K(0,STANCE),
      // dip forward, string hand snatches an arrow at the hip, back foot peels off the floor
      K(0.07,{hips:[3,-64],lean:0.17,fh:[46,-92],ang:0.4,bh:[-30,-64],be:[-46,-92],f1:[-44,-7],f2:[48,0]},'out'),
      // bow swings up, arrow goes on the string, back foot lands wide
      K(0.15,{hips:[-1,-59],lean:0.02,ang:0.1,pull:0.12,reach:62,lift:6,f1:[-60,-1.5],f2:[60,0]}),
      // full draw: side-on, torso laid back against the bow, string at the jaw
      K(0.24,{hips:[-10,-54],lean:-0.36,tilt:0.26,ang:-0.06,pull:1,f1:[-64,0],f2:[64,0]},'out'),
      K(0.295,{hips:[-12,-54],lean:-0.40,tilt:0.28,ang:-0.07,pull:1,f1:[-64,0],f2:[64,0]})
    ].concat(shotTail()),
    marks:[{t:0.30,type:'shot'}]
  });

  // Alternate: spin-around draw. The archer coils, hops through a full turn while raising and drawing the bow,
  // and lands facing forward at full draw.
  ANIM.add('bow_shot_b',{
    dur:0.50, weapon:'bow',
    keys:[
      K(0,STANCE),
      K(0.05,{hips:[3,-60],lean:0.22,fh:[34,-78],ang:0.8,bh:[-28,-60],be:[-46,-86],f1:[-40,-2.5],f2:[44,-1.5]},'out'),
      // back to the opponent, off the ground, bow high, arrow nocked
      K(0.14,{hips:[0,-74],lean:0.06,ang:-0.35,pull:0.4,reach:60,lift:8,f1:[-26,-16],f2:[28,-10]},'linear',{turn:-1}),
      // lands wide and side-on at full draw
      K(0.25,{hips:[-10,-54],lean:-0.36,tilt:0.26,ang:-0.06,pull:1,f1:[-64,-3],f2:[64,-2]},'out'),
      K(0.295,{hips:[-12,-54],lean:-0.40,tilt:0.28,ang:-0.07,pull:1,f1:[-64,0],f2:[64,0]})
    ].concat(shotTail()),
    marks:[{t:0.30,type:'shot'}]
  });

  // ---- 3. rapid follow-up -------------------------------------------------------------------------------------
  // Hop shot: nock on the way up, loose at the top of the hop, land in the follow-through.
  ANIM.add('bow_quick',{
    dur:0.34, weapon:'bow',
    keys:[
      K(0,UP),
      K(0.05,{hips:[3,-58],lean:0.16,ang:0.22,reach:58,lift:4,bh:[-24,-66],be:[-44,-92],f1:[-52,-1.5],f2:[54,-2]},'out'),
      K(0.10,{hips:[-2,-72],lean:-0.08,ang:0.04,pull:0.4,reach:64,lift:8,f1:[-42,-10],f2:[42,-12]}),
      K(0.15,{hips:[-6,-77],lean:-0.30,tilt:0.2,ang:-0.05,pull:1,f1:[-46,-15],f2:[50,-19]},'out'),
      K(0.175,{hips:[-7,-77],lean:-0.32,tilt:0.2,ang:-0.06,pull:1,f1:[-47,-14],f2:[51,-18]}),
      K(0.18,{hips:[-6,-76],lean:-0.26,tilt:0.18,ang:-0.01,bhN:[-16,-16],be:[-64,-146],f1:[-47,-13],f2:[51,-17]},'hold'),
      K(0.23,{hips:[4,-58],lean:0.14,tilt:-0.08,ang:0.32,reach:66,lift:4,bhN:[-58,-20],be:[-34,-146],f1:[-56,-2.5],f2:[58,-3]},'snap'),
      K(0.30,UP,'out'),
      K(0.34,EASY)
    ],
    marks:[{t:0.18,type:'shot'}]
  });

  // Alternate: drop under the opponent's guard into a deep wide crouch and snap the shot from there.
  ANIM.add('bow_quick_b',{
    dur:0.34, weapon:'bow',
    keys:[
      K(0,UP),
      K(0.05,{hips:[5,-50],lean:0.36,ang:0.42,reach:56,lift:4,bh:[-18,-48],be:[-40,-72],f1:[-58,0],f2:[60,0]},'out'),
      K(0.10,{hips:[-2,-42],lean:0.06,ang:0.05,pull:0.4,reach:64,lift:8,f1:[-64,0],f2:[66,0]}),
      K(0.15,{hips:[-9,-38],lean:-0.26,tilt:0.2,ang:-0.10,pull:1,f1:[-68,0],f2:[68,0]},'out'),
      K(0.175,{hips:[-10,-38],lean:-0.29,tilt:0.2,ang:-0.11,pull:1,f1:[-68,0],f2:[68,0]}),
      K(0.18,{hips:[-9,-38],lean:-0.23,tilt:0.18,ang:-0.05,bhN:[-16,-16],be:[-64,-110],f1:[-68,0],f2:[68,0]},'hold'),
      K(0.23,{hips:[3,-46],lean:0.2,tilt:-0.1,ang:0.3,reach:66,lift:4,bhN:[-58,-16],be:[-30,-136],f1:[-64,0],f2:[64,0]},'snap'),
      K(0.30,UP,'out'),
      K(0.34,EASY)
    ],
    marks:[{t:0.18,type:'shot'}]
  });

  // ---- 4. air shot --------------------------------------------------------------------------------------------
  ANIM.add('bow_air',{
    dur:0.42, weapon:'bow',
    keys:[
      K(0,AIR),
      // curl forward over the bow, hand to the quiver, knees coming up
      K(0.07,{hips:[1,-78],lean:0.26,ang:0.75,reach:52,lift:2,bh:[-18,-70],be:[-40,-96],f1:[-24,-24],f2:[26,-36]},'out'),
      K(0.14,{hips:[-2,-80],lean:-0.12,ang:0.52,pull:0.4,reach:64,lift:8,f1:[-30,-30],k1:[-6,-46],f2:[32,-50]}),
      // laid back in the air, knees tucked, aiming down at the ground target
      K(0.20,{hips:[-4,-82],lean:-0.44,tilt:0.34,ang:0.44,pull:1,f1:[-36,-36],k1:[-4,-44],f2:[32,-60]},'out'),
      K(0.215,{hips:[-5,-82],lean:-0.46,tilt:0.34,ang:0.44,pull:1,f1:[-37,-37],k1:[-5,-44],f2:[32,-61]}),
      K(0.22,{hips:[-4,-82],lean:-0.42,tilt:0.3,ang:0.44,bhN:[-10,-24],be:[-70,-150],f1:[-37,-37],k1:[-5,-44],f2:[32,-61]},'hold'),
      // recoil throws the body back and up, legs kick out forward, bow kicks up
      K(0.27,{hips:[-13,-89],lean:-0.62,tilt:0.3,ang:0.08,reach:66,lift:4,bhN:[-50,-34],be:[-80,-150],f1:[22,-30],k1:[14,-70],f2:[54,-50],k2:[34,-86]},'snap'),
      K(0.34,{hips:[-6,-83],lean:-0.24,tilt:0.1,ang:0.2,reach:56,lift:2,bh:[-52,-112],be:[-50,-134],f1:[-10,-14],f2:[36,-22]},'out'),
      K(0.42,AIR)
    ],
    marks:[{t:0.22,type:'shot'}]
  });

  // ---- 5. charged shot ----------------------------------------------------------------------------------------
  // Raise the bow high, then sink onto the back knee while hauling the string down and back; strain; let go.
  const KNEEL={k1:[-26,-4],f1:[-67,0],k2:[42,-48],f2:[46,0]};
  function kneel(o){ for(const x in KNEEL) if(!(x in o)) o[x]=KNEEL[x]; return o; }
  ANIM.add('bow_power',{
    dur:0.80, weapon:'bow',
    keys:[
      K(0,STANCE),
      // rise tall, arrow out of the quiver, bow sweeping up
      K(0.10,{hips:[3,-75],lean:0.10,fhN:[46,-30],ang:-0.5,bh:[-28,-66],be:[-46,-94],f1:[-36,0],f2:[40,-5]},'out'),
      // bow high overhead, arrow on the string, front foot reaching out
      K(0.19,{hips:[0,-73],lean:0.0,ang:-0.72,pull:0.12,reach:64,lift:6,f1:[-40,0],f2:[52,-1]}),
      // sinking, string coming back as the bow comes down
      K(0.31,{hips:[-4,-56],lean:-0.16,tilt:0.1,ang:-0.38,pull:0.6,f1:[-60,0],f2:[50,0]}),
      // back knee on the floor, whole body laid back against the draw
      K(0.43,kneel({hips:[-10,-44],lean:-0.46,tilt:0.3,ang:-0.14,pull:1}),'out'),
      // strain: three keys a few units apart
      K(0.49,kneel({hips:[-12,-43],lean:-0.50,tilt:0.32,ang:-0.17,pull:1})),
      K(0.53,kneel({hips:[-10,-45],lean:-0.46,tilt:0.28,ang:-0.13,pull:1})),
      K(0.575,kneel({hips:[-13,-43],lean:-0.52,tilt:0.32,ang:-0.16,pull:1})),
      K(0.58,kneel({hips:[-12,-44],lean:-0.46,tilt:0.26,ang:-0.08,bhN:[-18,-14],be:[-80,-110]}),'hold'),
      // violent recoil: upper body slides back, bow kicks up, string arm thrown out behind
      K(0.63,kneel({hips:[-23,-46],lean:-0.78,tilt:0.4,ang:-0.6,reach:66,lift:2,bhN:[-64,-4],be:[-90,-100],f2:[38,0],k2:[30,-50]}),'snap'),
      K(0.69,kneel({hips:[-21,-47],lean:-0.64,tilt:0.26,ang:-0.42,reach:64,lift:2,bhN:[-58,6],be:[-84,-90],f2:[40,0],k2:[32,-50]}),'out'),
      // slow recovery: rock forward off the knee and stand
      K(0.75,{hips:[-6,-58],lean:0.06,ang:0.3,reach:56,lift:2,bh:[-40,-80],be:[-52,-104],f1:[-56,0],f2:[46,0]}),
      K(0.80,STANCE,'out')
    ],
    marks:[{t:0.58,type:'shot'}]
  });
})();
