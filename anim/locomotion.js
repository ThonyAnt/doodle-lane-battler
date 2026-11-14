// Locomotion clips: runs, idles, jump / air / land, hit reactions, knock-out.
// Poses are built with mk(): author hips, torso lean, hands (relative to the shoulder) and feet;
// elbows and knees are placed by the same two-bone rule the engine uses, so the bend hints are always consistent.
(function(){
  const A=ANIM;

  // Middle joint of a two-bone limb. side: legs -1 = knee forward/up, arms +1 = elbow back/down.
  function mid(rx,ry,e,l1,l2,side){
    let dx=e[0]-rx,dy=e[1]-ry,d=Math.hypot(dx,dy)||0.001; const max=l1+l2-0.5;
    if(d>max){ dx*=max/d; dy*=max/d; d=max; e[0]=rx+dx; e[1]=ry+dy; }
    const ux=dx/d,uy=dy/d,a=(l1*l1-l2*l2+d*d)/(2*d),h=Math.sqrt(Math.max(0,l1*l1-a*a));
    return [rx+ux*a-uy*h*side, ry+uy*a+ux*h*side];
  }
  // o: h [x,y] hips | lean torso angle from vertical (+ = forward) | head neck angle from vertical (default lean+0.1)
  //    bh, fh hands RELATIVE to the shoulder | f1, f2 feet (absolute) | ang weapon angle
  //    be, fe, k1, k2 optional bend side overrides (arms default +1, legs default -1)
  function mk(o){
    const hx=o.h[0],hy=o.h[1],l=o.lean||0,ha=o.head===undefined?l+0.1:o.head;
    const nx=hx+Math.sin(l)*A.TORSO,ny=hy-Math.cos(l)*A.TORSO;
    const bh=[nx+o.bh[0],ny+o.bh[1]],fh=[nx+o.fh[0],ny+o.fh[1]],f1=o.f1.slice(),f2=o.f2.slice();
    const be=mid(nx,ny,bh,A.UPPER,A.FORE,o.be||1),fe=mid(nx,ny,fh,A.UPPER,A.FORE,o.fe||1);
    const k1=mid(hx,hy,f1,A.THIGH,A.SHIN,o.k1||-1),k2=mid(hx,hy,f2,A.THIGH,A.SHIN,o.k2||-1);
    return [nx+Math.sin(ha)*A.NECK,ny-Math.cos(ha)*A.NECK,nx,ny,hx,hy,be[0],be[1],bh[0],bh[1],fe[0],fe[1],fh[0],fh[1],
      k1[0],k1[1],f1[0],f1[1],k2[0],k2[1],f2[0],f2[1],o.ang||0];
  }

  // Run cycle builder. Eight keys: contact, down, passing, up(flight) for the near leg, then the same for the far leg.
  //   stance[4]  planted foot through contact/down/passing/push-off     swing[4]  the other foot at those same moments
  //   hy[4]      hip height at those moments, hx hip x
  //   body(j)    j = 0..7, returns {lean, head, bh, fh, ang, be, fe}
  function cycle(name,dur,weapon,c){
    const keys=[];
    for(let i=0;i<=8;i++){
      const j=i%8,k=j%4,b=c.body(j),st=c.stance[k],sw=c.swing[k];
      keys.push({t:+(dur*i/8).toFixed(4),ease:'linear',p:mk({h:[c.hx+(c.sway?c.sway[k]:0),c.hy[k]],lean:b.lean,head:b.head,bh:b.bh,fh:b.fh,ang:b.ang,be:b.be,fe:b.fe,
        f2:j<4?st:sw,f1:j<4?sw:st})});
    }
    A.add(name,{dur,loop:true,weapon,keys,marks:[{t:0,type:'step'},{t:dur/2,type:'step'}]});
  }

  const RUN_LEGS={
    hx:-6, hy:[-70,-60,-68,-80],
    stance:[[38,-2.5],[12,0],[-14,-1.5],[-52,-16]],
    swing:[[-66,-44],[-48,-60],[0,-34],[44,-30]]
  };

  // ---- run: near leg strikes at 0, far leg at 0.28. Free (back) arm pumps hard, weapon arm rides steadier.
  (function(){
    const lean=[0.40,0.48,0.42,0.34];
    const bh=[[44,-6],[36,14],[8,38],[-28,32],[-50,16],[-44,26],[-6,40],[30,20]];
    const fh=[[-10,38],[-6,40],[8,40],[22,34],[32,24],[30,28],[14,38],[-2,40]];
    const ang=[-0.9,-0.86,-0.76,-0.66,-0.6,-0.64,-0.74,-0.86];
    cycle('run',0.56,'blade',Object.assign({},RUN_LEGS,{body:j=>({lean:lean[j%4],head:lean[j%4]-0.05,bh:bh[j],fh:fh[j],ang:ang[j]})}));
  })();

  // ---- run_aim: same legs, upright steady torso, weapon held out at shoulder height.
  (function(){
    const lean=[0.13,0.17,0.15,0.11];
    const bh=[[26,24],[22,28],[4,38],[-18,36],[-30,28],[-26,32],[-4,38],[18,30]];
    const bob=[0,3,1,-2];
    cycle('run_aim',0.56,'gun',Object.assign({},RUN_LEGS,{hx:-4,
      body:j=>({lean:lean[j%4],head:0.08,bh:bh[j],fh:[69,1+bob[j%4]],ang:[0.03,0.05,0,-0.04][j%4]})}));
  })();

  // ---- sprint: 45 degree lean, long strides, real flight, free arm streaming straight back, blade trailing low.
  (function(){
    const lean=[0.76,0.82,0.78,0.70];
    const bh=[[-69,-14],[-70,-6],[-69,-12],[-67,-22],[-70,-10],[-71,-4],[-70,-10],[-68,-20]];
    const fh=[[-34,36],[-30,40],[-24,42],[-20,38],[-18,36],[-22,40],[-28,42],[-34,38]];
    const ang=[-2.85,-2.95,-2.9,-2.78,-2.8,-2.92,-2.96,-2.86];
    cycle('sprint',0.40,'blade',{
      hx:-18, hy:[-64,-55,-63,-80],
      stance:[[32,-3.5],[2,0],[-28,-2.5],[-66,-24]],
      swing:[[-82,-44],[-60,-66],[-12,-34],[38,-44]],
      body:j=>({lean:lean[j%4],head:lean[j%4]-0.3,bh:bh[j],fh:fh[j],ang:ang[j]})
    });
  })();

  // ---- run_b: low ninja run, both arms swept back, short fast steps.
  (function(){
    const lean=[0.90,0.96,0.92,0.86];
    const bh=[[-66,-10],[-67,-2],[-66,-8],[-64,-18],[-66,-6],[-67,0],[-66,-6],[-64,-16]];
    const fh=[[-62,4],[-60,10],[-62,4],[-64,-6],[-62,8],[-60,12],[-62,6],[-64,-4]];
    const ang=[-2.95,-3.02,-2.96,-2.86,-2.92,-3.0,-2.96,-2.88];
    cycle('run_b',0.56,'blade',{
      hx:-16, hy:[-62,-53,-59,-68],
      stance:[[34,-2],[10,0],[-14,-1],[-42,-10]],
      swing:[[-62,-36],[-50,-52],[-10,-28],[34,-22]],
      body:j=>({lean:lean[j%4],head:lean[j%4]-0.5,bh:bh[j],fh:fh[j],ang:ang[j]})
    });
  })();

  // ---- idle: slow breath and a small weight shift onto the front foot. Feet never move.
  (function(){
    const f1=[-30,0],f2=[36,0];
    const a=mk({h:[0,-75],lean:-0.07,head:-0.13,bh:[-16,49],fh:[43,41],fe:-1,f1,f2,ang:-0.95});
    const b=mk({h:[-1.5,-75.5],lean:-0.09,head:-0.16,bh:[-18,47],fh:[42,39],fe:-1,f1,f2,ang:-0.99});
    const c=mk({h:[1.5,-73],lean:-0.05,head:-0.08,bh:[-15,50],fh:[44,42],fe:-1,f1,f2,ang:-0.91});
    A.add('idle',{dur:1.6,loop:true,weapon:'blade',keys:[{t:0,p:a},{t:0.5,p:b},{t:1.1,p:c},{t:1.6,p:a}]});
  })();

  // ---- fight_idle: the 'ready' stance, bouncing: sink back, pop up, sink forward. Guard hand up in front of the chest.
  (function(){
    const f1=[-46,0],f2=[50,0];
    const a=mk({h:[0,-66],lean:-0.26,head:-0.1,bh:[34,6],fh:[40,26],fe:-1,f1,f2,ang:-0.9});
    const b=mk({h:[-7,-59],lean:-0.32,head:-0.12,bh:[30,12],fh:[38,32],fe:-1,f1,f2,ang:-0.78});
    const c=mk({h:[1,-68],lean:-0.24,head:-0.1,bh:[36,2],fh:[40,22],fe:-1,f1,f2,ang:-1.0});
    const d=mk({h:[7,-60],lean:-0.14,head:-0.02,bh:[38,10],fh:[44,30],fe:-1,f1,f2,ang:-0.8});
    A.add('fight_idle',{dur:0.9,loop:true,weapon:'blade',keys:[{t:0,p:a},{t:0.22,p:b},{t:0.45,p:c},{t:0.68,p:d},{t:0.9,p:a}]});
  })();

  // ---- skid: heel dug in far ahead, body thrown back, back knee nearly on the floor, free arm flung out behind.
  A.add('skid',{dur:0.22,weapon:'blade',keys:[
    {t:0,    p:mk({h:[-4,-60],lean:-0.2,head:0,bh:[-40,-10],fh:[36,30],f1:[-30,0],f2:[50,0],ang:-0.5})},
    {t:0.06, p:mk({h:[-14,-46],lean:-0.52,head:-0.25,bh:[-44,-50],fh:[46,24],f1:[-40,0],f2:[54,0],ang:-0.2}),ease:'snap'},
    {t:0.13, p:mk({h:[-8,-52],lean:-0.4,head:-0.2,bh:[-52,-34],fh:[44,22],fe:-1,f1:[-42,0],f2:[55,0],ang:-0.45}),ease:'out'},
    {t:0.22, p:'ready'}
  ]});

  // ---- jump: crouch, then snap to full extension with the arms thrown up; toes leave the floor on the last key.
  A.add('jump',{dur:0.18,weapon:'blade',keys:[
    {t:0,    p:mk({h:[0,-66],lean:-0.2,head:-0.1,bh:[-12,32],fh:[40,26],fe:-1,f1:[-40,0],f2:[44,0],ang:-0.85})},
    {t:0.07, p:mk({h:[-2,-44],lean:0.55,head:0.45,bh:[-46,26],fh:[-18,46],f1:[-34,0],f2:[36,0],ang:-0.1}),ease:'out'},
    {t:0.14, p:mk({h:[2,-79],lean:0.04,head:-0.25,bh:[6,-68],fh:[30,-62],f1:[-24,0],f2:[26,0],ang:-1.5}),ease:'snap'},
    {t:0.18, p:mk({h:[2,-90],lean:0,head:-0.3,bh:[2,-70],fh:[26,-65],f1:[-22,-12],f2:[22,-8],ang:-1.6}),ease:'linear'}
  ]});

  // ---- rise: near knee tucked, far leg trailing, arms up and back with the blade cocked overhead.
  (function(){
    const a=mk({h:[0,-84],lean:0.12,head:-0.1,bh:[-46,-40],fh:[16,-58],f1:[-28,-8],f2:[18,-50],ang:-1.75});
    const b=mk({h:[0,-84],lean:0.09,head:-0.14,bh:[-49,-35],fh:[19,-55],f1:[-32,-10],f2:[20,-46],ang:-1.67});
    A.add('rise',{dur:0.5,loop:true,weapon:'blade',keys:[{t:0,p:a},{t:0.25,p:b},{t:0.5,p:a}]});
  })();

  // ---- fall: legs reaching for the floor, arms left behind overhead, fluttering.
  (function(){
    const a=mk({h:[0,-84],lean:-0.05,head:0.25,bh:[-40,-48],fh:[36,-46],f1:[-24,-6],f2:[18,-14],ang:-1.25});
    const b=mk({h:[0,-84],lean:-0.02,head:0.3,bh:[-35,-54],fh:[40,-42],f1:[-20,-10],f2:[23,-10],ang:-1.38});
    const c=mk({h:[0,-84],lean:-0.07,head:0.22,bh:[-43,-45],fh:[33,-50],f1:[-26,-5],f2:[16,-15],ang:-1.2});
    A.add('fall',{dur:0.5,loop:true,weapon:'blade',keys:[{t:0,p:a},{t:0.17,p:b},{t:0.34,p:c},{t:0.5,p:a}]});
  })();

  // ---- land: three-point squash (back knee and free hand to the floor, blade flung up behind), then spring up.
  A.add('land',{dur:0.16,weapon:'blade',marks:[{t:0,type:'land'}],keys:[
    {t:0,    p:mk({h:[0,-62],lean:0.15,head:0.2,bh:[-34,-20],fh:[40,-10],f1:[-44,0],f2:[46,0],ang:-1.0})},
    {t:0.05, p:mk({h:[-4,-40],lean:0.85,head:0.45,bh:[6,70],fh:[-42,-20],f1:[-54,0],f2:[50,0],ang:-2.5}),ease:'snap'},
    {t:0.11, p:mk({h:[0,-64],lean:-0.1,head:-0.1,bh:[-14,30],fh:[38,22],fe:-1,f1:[-48,0],f2:[52,0],ang:-0.95}),ease:'out'},
    {t:0.16, p:'ready'}
  ]});

  // ---- hit_react: struck high from the front. Head and chest whip back, hips carry forward, arms fling, front foot lifts.
  A.add('hit_react',{dur:0.22,weapon:'blade',keys:[
    {t:0,    p:mk({h:[2,-67],lean:-0.3,head:-0.2,bh:[-10,32],fh:[40,24],fe:-1,f1:[-46,0],f2:[50,0],ang:-0.85})},
    {t:0.04, p:mk({h:[12,-70],lean:-0.66,head:-1.05,bh:[30,-20],fh:[52,-10],f1:[-34,0],f2:[46,-16],ang:-1.5}),ease:'snap'},
    {t:0.10, p:mk({h:[6,-66],lean:-0.5,head:-0.7,bh:[-22,-36],fh:[40,-30],f1:[-36,0],f2:[32,-22],ang:-1.9}),ease:'out'},
    {t:0.16, p:mk({h:[-2,-62],lean:-0.08,head:0.12,bh:[-14,30],fh:[36,30],fe:-1,f1:[-46,0],f2:[52,0],ang:-0.6})},
    {t:0.22, p:'ready'}
  ]});

  // ---- hit_react_b: gut shot. Folds in half around the blow with a small hop back, crumples, then straightens.
  A.add('hit_react_b',{dur:0.22,weapon:'blade',keys:[
    {t:0,    p:mk({h:[0,-67],lean:-0.1,head:0,bh:[-10,32],fh:[40,24],fe:-1,f1:[-46,0],f2:[50,0],ang:-0.85})},
    {t:0.04, p:mk({h:[-14,-70],lean:0.78,head:1.3,bh:[-12,34],fh:[12,40],f1:[-44,-6],f2:[28,-9],ang:0.3}),ease:'snap'},
    {t:0.11, p:mk({h:[-18,-56],lean:0.98,head:1.45,bh:[-16,30],fh:[18,36],f1:[-50,0],f2:[26,0],ang:0.42}),ease:'out'},
    {t:0.17, p:mk({h:[-8,-62],lean:0.3,head:0.35,bh:[-12,34],fh:[36,34],f1:[-48,0],f2:[46,0],ang:-0.2})},
    {t:0.22, p:'ready'}
  ]});

  // ---- ko: blown off the feet backwards, flat in the air, slams down on the back, one bounce, then still in 'down'.
  A.add('ko',{dur:0.8,weapon:'blade',keys:[
    {t:0,    p:mk({h:[-4,-72],lean:-0.5,head:-0.9,bh:[40,-10],fh:[50,-20],f1:[-30,0],f2:[30,-12],ang:-1.2})},
    {t:0.10, p:mk({h:[2,-94],lean:-0.95,head:-0.4,bh:[58,-6],fh:[60,12],f1:[44,-44],f2:[60,-62],ang:-0.5}),ease:'out'},
    {t:0.26, p:mk({h:[-6,-98],lean:-1.72,head:-1.5,bh:[34,-54],fh:[50,-44],f1:[40,-140],f2:[64,-122],ang:-1.2})},
    {t:0.42, p:mk({h:[-9,-16],lean:-1.48,head:-1.2,bh:[-35,12],fh:[40,-34],f1:[36,-70],f2:[56,-54],ang:-0.6}),ease:'in'},
    {t:0.52, p:mk({h:[-9,-34],lean:-1.42,head:-1.3,bh:[-30,-8],fh:[46,-14],f1:[52,-40],f2:[66,-22],ang:-0.2}),ease:'out'},
    {t:0.66, p:'down',ease:'in'},
    {t:0.80, p:'down',ease:'hold'}
  ]});
})();
