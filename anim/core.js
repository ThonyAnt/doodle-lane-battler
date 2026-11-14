// Doodle Duel animation core: skeleton poses, clips, sampling, and drawing.
// Shared by the game (duel.html) and the preview lab (anim-lab.html). Pure canvas 2D, no dependencies.
//
// POSE: 23 numbers in local units, fighter facing RIGHT, feet on y=0, up is NEGATIVE y, x=0 under the hips at rest.
//   [0,1] head  [2,3] neck/shoulder  [4,5] hips  [6,7] back elbow  [8,9] back hand
//   [10,11] front elbow  [12,13] front hand (holds the weapon)  [14,15] knee1  [16,17] foot1
//   [18,19] knee2  [20,21] foot2  [22] weapon angle in radians (0 = pointing right, negative = up, positive = down)
// A standing figure is about 175 units tall. Limb lengths are enforced at sample time, so limbs never stretch:
// author hands, feet, hips, neck and head; elbows and knees only say which way the joint bends.
(function(g){
  'use strict';
  const A=g.ANIM={clips:{},ARM:54,UPPER:36,FORE:36,THIGH:42,SHIN:42,TORSO:55,NECK:23};
  const IDX={head:0,neck:2,hips:4,be:6,bh:8,fe:10,fh:12,k1:14,f1:16,k2:18,f2:20};
  A.IDX=IDX;
  A.POSES={
    idle: [-7,-154,-4,-132,0,-77,-30,-112,-20,-83,22,-112,39,-91,-18,-39,-33,0,24,-40,41,0,-0.95],
    ready:[-15,-137,-13,-116,0,-63,-37,-104,-25,-84,9,-102,27,-89,-22,-32,-47,0,30,-33,56,0,-0.85],
    wind: [-24,-142,-18,-119,0,-73,-45,-101,-61,-78,-43,-145,-34,-167,-27,-35,-54,0,29,-38,53,0,-2.35],
    slash:[35,-139,20,-119,0,-70,-17,-103,-41,-121,50,-110,77,-94,-25,-34,-55,0,39,-30,70,0,0.24],
    follow:[43,-134,26,-113,0,-67,-6,-85,-32,-72,49,-90,54,-63,-25,-33,-53,0,35,-29,65,0,0.90],
    hurt:[-29,-147,-22,-125,-8,-75,-53,-110,-68,-126,5,-108,28,-115,-31,-37,-45,0,19,-37,38,0,-0.6],
    guard:[-17,-146,-12,-124,0,-76,10,-109,33,-112,21,-115,38,-124,-24,-36,-43,0,25,-38,47,0,-1.3],
    thrust:[25,-145,14,-124,0,-76,-19,-108,-46,-116,46,-118,80,-116,-22,-37,-52,0,36,-35,62,0,0],
    leap:[-15,-154,-8,-130,0,-78,-40,-151,-33,-183,16,-155,-2,-184,-29,-55,-48,-27,32,-57,48,-38,-1.95],
    air:[2,-152,0,-130,0,-78,-34,-126,-52,-148,26,-122,44,-138,-16,-46,-28,-10,18,-48,24,-12,-1.1],
    gather:[-19,-151,-15,-128,0,-75,-26,-108,10,-112,14,-100,5,-73,-23,-37,-43,0,28,-37,49,0,1.05],
    cast:[16,-150,8,-129,0,-76,38,-127,66,-123,13,-100,-6,-73,-24,-36,-47,0,30,-37,52,0,1.10],
    fall:[-57,-102,-47,-83,-23,-44,-77,-66,-100,-74,-25,-58,-2,-49,-53,-21,-76,0,11,-22,43,0,-0.3],
    down:[-80,-21,-58,-17,-9,-14,-72,-36,-91,-1,-34,-3,-7,-1,24,-9,57,0,21,-23,61,-5,0.05],
    cheer:[-4,-158,-2,-136,0,-80,-30,-150,-38,-180,22,-150,30,-182,-16,-40,-24,0,18,-40,26,0,-1.5]
  };

  // Build a pose from a base pose (name or array) plus named overrides, e.g.
  //   ANIM.P('ready',{fh:[60,-120],ang:-0.2,hips:[4,-70]})
  // Keys: head neck hips be bh fe fh k1 f1 k2 f2 (each [x,y]) and ang (number).
  A.P=function(base,set){
    const src=typeof base==='string'?A.POSES[base]:base;
    if(!src) throw new Error('ANIM.P: unknown base pose '+base);
    const p=src.slice();
    if(set) for(const k in set){
      if(k==='ang') p[22]=set[k];
      else if(k in IDX){ p[IDX[k]]=set[k][0]; p[IDX[k]+1]=set[k][1]; }
      else throw new Error('ANIM.P: unknown joint '+k);
    }
    return p;
  };

  // Two-bone IK: place the middle joint so both bones keep their length. The hint picks the bend side.
  function ik(p,root,mid,end,l1,l2,defSide){
    const sx=p[root],sy=p[root+1]; let dx=p[end]-sx,dy=p[end+1]-sy,d=Math.hypot(dx,dy)||0.001;
    const max=l1+l2-0.5,min=Math.abs(l1-l2)+1;
    if(d>max||d<min){ const k=(d>max?max:min)/d; dx*=k; dy*=k; d*=k; p[end]=sx+dx; p[end+1]=sy+dy; }
    const ux=dx/d,uy=dy/d,a=(l1*l1-l2*l2+d*d)/(2*d),h=Math.sqrt(Math.max(0,l1*l1-a*a));
    const cross=ux*(p[mid+1]-sy)-uy*(p[mid]-sx);
    const side=Math.abs(cross)<0.5?defSide:(cross>0?1:-1);
    p[mid]=sx+ux*a-uy*h*side; p[mid+1]=sy+uy*a+ux*h*side;
  }
  function setLen(p,from,to,len){
    let dx=p[to]-p[from],dy=p[to+1]-p[from+1]; const d=Math.hypot(dx,dy)||0.001;
    p[to]=p[from]+dx/d*len; p[to+1]=p[from+1]+dy/d*len;
  }
  // Enforce bone lengths in place.
  A.solve=function(p){
    setLen(p,4,2,A.TORSO); setLen(p,2,0,A.NECK);
    ik(p,2,6,8,A.UPPER,A.FORE,1); ik(p,2,10,12,A.UPPER,A.FORE,1);
    ik(p,4,14,16,A.THIGH,A.SHIN,-1); ik(p,4,18,20,A.THIGH,A.SHIN,-1);
    return p;
  };

  const EASE={
    linear:u=>u, smooth:u=>u*u*(3-2*u), in:u=>u*u, out:u=>1-(1-u)*(1-u),
    snap:u=>1-Math.pow(1-u,4), slow:u=>u*u*u, hold:u=>u<1?0:1
  };
  A.EASE=EASE;

  // Register a clip.
  //   dur    seconds
  //   loop   true for cycles (run, idle)
  //   keys   [{t, p, ease, rot, turn, orbit, grip, pull}] sorted by t; first key at t=0, last at t=dur
  //          p      pose: base name, 23-array, or ANIM.P(...)
  //          ease   how to ARRIVE at this key from the previous one: linear | smooth (default) | in | out | snap | slow | hold
  //          rot    whole-body rotation about the hips in radians (somersaults; positive = clockwise on screen = forward roll when facing right)
  //          turn   horizontal scale of the body, 1 = facing forward, -1 = facing backward (pass through 0 for a spin)
  //          orbit  0..1: 1 pins the front arm straight along the weapon angle from the shoulder, so a swing is a true arc
  //          grip   0..1: 1 puts the back hand on the hilt too (two-handed)
  //          pull   0..1: bow string draw amount
  //   trail  [[t0,t1],...] time windows where the blade leaves a painted slash trail
  //   marks  [{t,type}] gameplay moments (hit, shot, step, land). Must match the move spec.
  //   weapon 'blade' | 'spear' | 'hammer' | 'fist' | 'bow' | 'gun' | 'staff' | 'star' | 'none'  (what the lab draws in the front hand)
  //   spline false to interpolate linearly instead of with a smooth curve through the keys
  A.add=function(name,c){
    if(!c||!c.keys||c.keys.length<2) throw new Error('ANIM.add('+name+'): need at least 2 keys');
    const keys=c.keys.map(k=>{
      const pose=typeof k.p==='string'?A.POSES[k.p]:k.p;
      if(!pose||pose.length!==23) throw new Error('ANIM.add('+name+'): bad pose at t='+k.t);
      return {t:k.t,p:pose.slice(),ease:k.ease||'smooth',rot:k.rot||0,turn:k.turn===undefined?1:k.turn,orbit:k.orbit||0,grip:k.grip||0,pull:k.pull||0};
    }).sort((a,b)=>a.t-b.t);
    for(const k of keys) if(!EASE[k.ease]) throw new Error('ANIM.add('+name+'): unknown ease '+k.ease);
    const dur=c.dur||keys[keys.length-1].t;
    A.clips[name]={name,dur,loop:!!c.loop,keys,trail:c.trail||[],marks:c.marks||[],weapon:c.weapon||'none',spline:c.spline!==false,notes:c.notes||''};
    return A.clips[name];
  };

  const CH=['rot','turn','orbit','grip','pull'];
  function cr(a,b,c,d,u){ const u2=u*u,u3=u2*u; return 0.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u2+(-a+3*b-3*c+d)*u3); }
  // Sample a clip at time t (seconds). Returns {p, rot, turn, orbit, grip, pull, t, clip}.
  A.sample=function(clip,t){
    if(typeof clip==='string') clip=A.clips[clip];
    const K=clip.keys,n=K.length,dur=clip.dur;
    if(clip.loop) t=((t%dur)+dur)%dur; else t=Math.max(0,Math.min(dur,t));
    let i=0; while(i<n-2&&t>K[i+1].t) i++;
    const a=K[i],b=K[i+1],span=b.t-a.t,raw=span>0?Math.max(0,Math.min(1,(t-a.t)/span)):1,u=EASE[b.ease](raw);
    const prev=i>0?K[i-1]:(clip.loop?K[n-2]:a), next=i<n-2?K[i+2]:(clip.loop?K[1]:b);
    const p=new Array(23), flat=!clip.spline||b.ease==='hold';
    for(let j=0;j<23;j++) p[j]=flat?a.p[j]+(b.p[j]-a.p[j])*u:cr(prev.p[j],a.p[j],b.p[j],next.p[j],u);
    const out={p,t,clip};
    for(const c of CH) out[c]=a[c]+(b[c]-a[c])*u;
    if(out.orbit>0.001){
      const hx=p[2]+Math.cos(p[22])*A.ARM,hy=p[3]+Math.sin(p[22])*A.ARM;
      p[12]+=(hx-p[12])*out.orbit; p[13]+=(hy-p[13])*out.orbit;
    }
    A.solve(p);
    if(out.grip>0.001){
      const gx=p[12]-Math.cos(p[22])*13,gy=p[13]-Math.sin(p[22])*13;
      p[8]+=(gx-p[8])*out.grip; p[9]+=(gy-p[9])*out.grip; ik(p,2,6,8,A.UPPER,A.FORE,1);
    }
    return out;
  };
  // Blend two solved poses (for cross-fades between clips).
  A.mix=function(a,b,u){ const p=new Array(23); for(let j=0;j<23;j++) p[j]=a[j]+(b[j]-a[j])*u; return p; };

  // Apply a sample's body rotation and turn to a local point (rotation is about the hips).
  A.xf=function(s,x,y){
    const hx=s.p[4],hy=s.p[5]; let dx=(x-hx)*(s.turn===undefined?1:s.turn),dy=y-hy;
    const r=s.rot||0; if(r){ const c=Math.cos(r),q=Math.sin(r),nx=dx*c-dy*q; dy=dx*q+dy*c; dx=nx; }
    return [hx+dx,hy+dy];
  };
  function bone(ctx,pts,w){ ctx.lineWidth=w; ctx.beginPath(); for(let i=0;i<pts.length;i+=2) i?ctx.lineTo(pts[i],pts[i+1]):ctx.moveTo(pts[i],pts[i+1]); ctx.stroke(); }
  // Draw the skeleton for a sample in local units. Caller has translated to the feet and scaled (flip x for facing left).
  // opts: col, halo (white outline), weapon(ctx,sample) callback drawn at the front hand with the weapon angle applied, back(ctx,sample) drawn behind the body.
  A.draw=function(ctx,s,opts){
    const p=s.p,col=(opts&&opts.col)||'#111';
    ctx.save();
    ctx.translate(p[4],p[5]); if(s.rot) ctx.rotate(s.rot); if(s.turn!==undefined&&s.turn!==1) ctx.scale(Math.abs(s.turn)<0.08?0.08*(s.turn<0?-1:1):s.turn,1); ctx.translate(-p[4],-p[5]);
    if(opts&&opts.back) opts.back(ctx,s);
    ctx.lineCap='round'; ctx.lineJoin='round';
    if(opts&&opts.halo){   // a white outline so the figure reads against any background
      ctx.strokeStyle='#fff';
      bone(ctx,[p[4],p[5],p[14],p[15],p[16],p[17]],16); bone(ctx,[p[2],p[3],p[6],p[7],p[8],p[9]],16); bone(ctx,[p[4],p[5],p[18],p[19],p[20],p[21]],16);
      bone(ctx,[p[2],p[3],p[4],p[5]],17); bone(ctx,[p[2],p[3],p[10],p[11],p[12],p[13]],16);
      ctx.lineWidth=14; ctx.beginPath(); ctx.ellipse(p[0],p[1],17,19,-0.1,0,7); ctx.stroke();
    }
    ctx.strokeStyle=col;
    bone(ctx,[p[4],p[5],p[14],p[15],p[16],p[17]],9.5);
    bone(ctx,[p[2],p[3],p[6],p[7],p[8],p[9]],9.5);
    bone(ctx,[p[4],p[5],p[18],p[19],p[20],p[21]],9.5);
    bone(ctx,[p[2],p[3],p[4],p[5]],11);
    ctx.fillStyle='#fff'; ctx.lineWidth=8; ctx.beginPath(); ctx.ellipse(p[0],p[1],17,19,-0.1,0,7); ctx.fill(); ctx.stroke();
    if(opts&&opts.weapon){ ctx.save(); ctx.translate(p[12],p[13]); ctx.rotate(p[22]); opts.weapon(ctx,s); ctx.restore(); ctx.strokeStyle=col; ctx.lineCap='round'; ctx.lineJoin='round'; }
    bone(ctx,[p[2],p[3],p[10],p[11],p[12],p[13]],9.5);
    ctx.restore();
  };

  A.TRAIL={none:['#2b3a7a','#7f9be0','#ffffff'],fire:['#c2330f','#ff9a3d','#fff6d8'],water:['#1457b8','#5cc0ff','#f2fcff'],plant:['#177a35','#7edb6c','#f6ffe9']};
  // Slash arc, in the manner of stick-fight animation and action-game effects:
  //  - a crescent that hugs the path of the weapon TIP, not a fan from hand to tip
  //  - a hard, saturated outer edge with a bright streak just inside it, feathering away toward the inside
  //  - needle-sharp at the tail, widest past the middle, meeting the weapon at the head
  //  - it hangs in the air after the cut and dissolves from the tail while thinning, instead of just fading
  // len = weapon length in local units. cols = [edge, body, highlight]. Draw before the body.
  A.trail=function(ctx,clip,t,len,cols){
    if(typeof clip==='string') clip=A.clips[clip];
    cols=cols||A.TRAIL.none;
    const LINGER=0.12, SPAN=0.14;
    for(const w of clip.trail){
      if(t<=w[0]||t>=w[1]+LINGER) continue;
      const head=Math.min(t,w[1]), after=t>w[1]?(t-w[1])/LINGER:0;
      let tail=Math.max(w[0],head-SPAN); tail+=(head-tail)*0.8*after*(2-after);
      const span=head-tail; if(span<0.004) continue;
      const n=Math.max(8,Math.min(56,Math.ceil(span/0.0025))), tips=[],dirs=[];
      let path=0;
      for(let j=0;j<=n;j++){
        const s=A.sample(clip,tail+span*j/n),p=s.p,c=Math.cos(p[22]),q=Math.sin(p[22]);
        const tip=A.xf(s,p[12]+c*len*1.04,p[13]+q*len*1.04), base=A.xf(s,p[12]+c*len*0.2,p[13]+q*len*0.2);
        const dx=base[0]-tip[0],dy=base[1]-tip[1],d=Math.hypot(dx,dy)||1;
        tips.push(tip); dirs.push([dx/d,dy/d,d]);
        if(j) path+=Math.hypot(tip[0]-tips[j-1][0],tip[1]-tips[j-1][1]);
      }
      // A slow or short sweep gets a thin arc; only a real cut earns the full crescent.
      const W=len*0.46*Math.min(1,path/(len*0.9))*(1-0.55*after);
      if(W<1.5) continue;
      const wid=u=>Math.min(1,Math.pow(Math.sin(Math.PI*Math.pow(u,0.8)),0.75)*0.9+0.55*Math.pow(u,6))*W;
      const pt=(j,v)=>{ const k=Math.min(wid(j/n)*v,dirs[j][2]); return [tips[j][0]+dirs[j][0]*k,tips[j][1]+dirs[j][1]*k]; };
      const band=(v0,v1,col,alpha)=>{
        ctx.globalAlpha=alpha; ctx.fillStyle=col; ctx.beginPath();
        for(let j=0;j<=n;j++){ const a=pt(j,v0); j?ctx.lineTo(a[0],a[1]):ctx.moveTo(a[0],a[1]); }
        for(let j=n;j>=0;j--){ const a=pt(j,v1); ctx.lineTo(a[0],a[1]); }
        ctx.closePath(); ctx.fill();
      };
      const streak=(u0,u1,v,width,alpha)=>{
        const j0=Math.round(u0*n),j1=Math.round(u1*n); if(j1-j0<2) return;
        ctx.globalAlpha=alpha; ctx.strokeStyle=cols[2]; ctx.lineWidth=width; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath();
        for(let j=j0;j<=j1;j++){ const a=pt(j,v); j===j0?ctx.moveTo(a[0],a[1]):ctx.lineTo(a[0],a[1]); } ctx.stroke();
      };
      const a=Math.pow(1-after,1.3)*Math.min(1,(t-w[0])/0.012);
      ctx.save();
      band(0,1,cols[1],0.16*a);                       // soft feather reaching inward
      band(0,0.82,cols[1],0.22*a);
      band(0,0.64,cols[1],0.34*a);
      band(0,0.5,cols[1],0.5*a);
      ctx.shadowColor=cols[1]; ctx.shadowBlur=10;
      band(0,0.4,cols[0],0.96*a);                    // hard outer edge
      ctx.shadowBlur=0;
      band(0.08,0.27,cols[2],a);                      // bright streak just inside the edge
      streak(0.30,0.72,0.52,Math.max(1.5,W*0.035),0.75*a);   // broken brush streaks in the body
      streak(0.50,0.93,0.80,Math.max(1.2,W*0.025),0.55*a);
      ctx.restore();
    }
  };

  // Stand-in weapons for the lab. In the game the player's own drawing is used instead.
  A.placeholder={
    blade(ctx,s,len){ len=len||110; ctx.strokeStyle='#111'; ctx.lineCap='round'; ctx.lineJoin='round';
      bone(ctx,[-16,0,10,0],6); bone(ctx,[10,-12,10,12],4);
      ctx.lineWidth=3; ctx.fillStyle='#d9ddff'; ctx.beginPath(); ctx.moveTo(13,-8); ctx.lineTo(len-16,-7); ctx.lineTo(len,0); ctx.lineTo(len-16,7); ctx.lineTo(13,8); ctx.closePath(); ctx.fill(); ctx.stroke(); },
    // Bow held upright at angle 0: the grip is at the hand and the limbs curve back toward the archer.
    bow(ctx,s){ const pull=(s&&s.pull)||0, sx=-14-pull*46; ctx.strokeStyle='#111'; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.lineWidth=5;
      ctx.beginPath(); ctx.moveTo(-14,-58); ctx.quadraticCurveTo(22,0,-14,58); ctx.stroke();
      ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-14,-58); ctx.lineTo(sx,0); ctx.lineTo(-14,58); ctx.stroke();
      if(pull>0.05){ ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx+78,0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx+78,0); ctx.lineTo(sx+68,-5); ctx.moveTo(sx+78,0); ctx.lineTo(sx+68,5); ctx.stroke(); } },
    gun(ctx){ ctx.strokeStyle='#111'; ctx.fillStyle='#d9ddff'; ctx.lineJoin='round'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(-6,-9); ctx.lineTo(46,-9); ctx.lineTo(46,1); ctx.lineTo(8,1); ctx.lineTo(4,18); ctx.lineTo(-8,18); ctx.closePath(); ctx.fill(); ctx.stroke(); },
    spear(ctx){ ctx.strokeStyle='#111'; ctx.lineCap='round'; ctx.lineJoin='round'; bone(ctx,[-46,0,138,0],5);
      ctx.lineWidth=3; ctx.fillStyle='#d9ddff'; ctx.beginPath(); ctx.moveTo(136,-9); ctx.lineTo(172,0); ctx.lineTo(136,9); ctx.closePath(); ctx.fill(); ctx.stroke(); },
    hammer(ctx){ ctx.strokeStyle='#111'; ctx.lineCap='round'; ctx.lineJoin='round'; bone(ctx,[-18,0,96,0],6);
      ctx.lineWidth=3; ctx.fillStyle='#d9ddff'; ctx.beginPath(); ctx.rect(88,-30,40,60); ctx.fill(); ctx.stroke(); },
    staff(ctx){ ctx.strokeStyle='#111'; ctx.lineCap='round'; bone(ctx,[-56,0,74,0],5);
      ctx.lineWidth=3; ctx.fillStyle='#d9ddff'; ctx.beginPath(); ctx.arc(88,0,14,0,7); ctx.fill(); ctx.stroke(); },
    star(ctx){ ctx.strokeStyle='#111'; ctx.lineJoin='round'; ctx.lineWidth=3; ctx.fillStyle='#d9ddff'; ctx.beginPath();
      for(let i=0;i<8;i++){ const r=i%2?7:19,a=i*Math.PI/4; i?ctx.lineTo(8+Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(8+Math.cos(a)*r,Math.sin(a)*r); } ctx.closePath(); ctx.fill(); ctx.stroke(); },
    fist(ctx){ ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.fillStyle='#d9ddff'; ctx.beginPath(); ctx.arc(4,0,12,0,7); ctx.fill(); ctx.stroke(); },
    none(){}
  };
  // Length from the hand to the weapon tip, for the slash trail in the lab.
  A.placeholderLen={blade:110,spear:172,hammer:128};
})(typeof window!=='undefined'?window:globalThis);
