// Secondary motion for the fighters: a spring layer over the authored clips, plus onion-skin afterimages.
//
// The clips (anim/*.js) stay exactly as authored and stay in charge of timing. Each frame the sampled clip pose becomes a
// set of TARGETS; every joint is a small weight on a spring chasing its target, so the body lags, overshoots and settles,
// and a hit knocks the joints about. This is display only: hits, reach and timing live in the rules and never see it.
//
// The spring maths is Alex's InkShop rig (prototype/inkshop-duel.html: Rig.update, Rig.kick, Rig.constrain), moved onto
// this skeleton. What is different here, on purpose:
//   - with Jelly at 0 the pose is the clip pose, untouched
//   - planted feet are pinned to their targets, so they never slide
//   - both arms and the weapon angle are pinned while an attack plays, so the weapon is where the rules say it is
//   - Exaggerate only applies to moving about (not attacks, not being hit), because it would misstate a weapon's reach
//
// ANIM.rig.P holds the settings (the Rig Properties sliders on the InkShop desktop); they are remembered per browser.
(function(g){
  'use strict';
  const A=g.ANIM;
  const P={jelly:0.25,stretch:0.36,flab:0.4,exag:1,onion:false,show:false};
  try{ const saved=JSON.parse(g.localStorage.getItem('dd-rig')||'{}'); for(const k in P) if(typeof saved[k]===typeof P[k]) P[k]=saved[k]; }catch(e){}
  const lerp=(a,b,t)=>a+(b-a)*t, rnd=()=>Math.random()*2-1;
  const wrap=a=>{ a=(a+Math.PI)%(2*Math.PI); return (a<0?a+2*Math.PI:a)-Math.PI; };
  // joints (index of x in the 23-number pose), spring stiffness per joint, and how hard a hit throws each one
  const J=[0,2,4,6,8,10,12,14,16,18,20];
  const KM={0:0.75,2:1.1,4:1.7,6:0.8,8:0.65,10:0.9,12:0.75,14:1.1,16:1.5,18:1.1,20:1.5};
  const KICK={0:1.6,8:1.2,12:1.2};
  const BONES=[[4,2,'TORSO'],[2,0,'NECK'],[2,6,'UPPER'],[6,8,'FORE'],[2,10,'UPPER'],[10,12,'FORE'],[4,14,'THIGH'],[14,16,'SHIN'],[4,18,'THIGH'],[18,20,'SHIN']];
  const ARMS=[6,8,10,12], FEET=[16,20], REF=A.POSES.idle;
  const LIFE=0.28, EVERY=0.05;             // afterimages: how long one lasts, how often one is left behind

  // Pull each bone toward its length. str 1 = rigid, lower lets limbs stretch (his Rig.constrain).
  function constrain(q,str,it){
    for(let n=0;n<it;n++) for(const [a,b,len] of BONES){
      const dx=q[b]-q[a], dy=q[b+1]-q[a+1], d=Math.hypot(dx,dy)||1e-3; let diff=(d-A[len])/d; diff*=diff>0?str:str*0.5;
      const wa=a===4?0.2:0.5, wb=1-wa; q[a]+=dx*diff*wa; q[a+1]+=dy*diff*wa; q[b]-=dx*diff*wb; q[b+1]-=dy*diff*wb;
    }
  }
  const make=()=>({q:null,v:new Array(22).fill(0),ang:0,va:0,bx:0,by:0,bvx:0,bvy:0,x:0,base:0,d:1,pin:0,ex:0,ghost:[],gt:0});

  // s: the sampled clip pose (s.p is replaced). o: {x, base, d, KS, dt, grounded, act, oc, loose}
  //   x, base: where the feet are drawn; d: facing; KS: drawn pixels per pose unit; act: an attack is playing;
  //   oc: overclocked; loose: free to exaggerate (moving about, not attacking or hurt).
  function apply(R,s,o){
    const dt=o.dt, T0=s.p, belly0=9*(0.5+P.flab*1.25);
    s.bow=0.5+0.5*P.stretch;
    R.ex+=((o.loose?1:0)-R.ex)*Math.min(1,dt/0.12);
    const ex=1+(P.exag-1)*0.5*R.ex; let T=T0;
    if(Math.abs(ex-1)>0.004){
      T=T0.slice();
      for(const j of J){ T[j]=REF[j]+(T0[j]-REF[j])*ex; T[j+1]=Math.min(j===16||j===20?0:-2,REF[j+1]+(T0[j+1]-REF[j+1])*ex); }
      A.solve(T);
    }
    // how far the feet moved since the last frame, in pose space: the joints are partly left behind by it
    const r=s.rot||0, cs=Math.cos(r), sn=Math.sin(r);
    let mx=o.d*(o.x-R.x)/o.KS, my=(o.base-R.base)/o.KS; const turned=R.d!==o.d;
    R.x=o.x; R.base=o.base; R.d=o.d;
    if(P.jelly<0.004){ R.q=null; s.p=T; s.tgt=T; s.belly=[belly0,0]; return; }
    if(!R.q||dt>0.12||Math.hypot(mx,my)>140){ R.q=T.slice(0,22); R.v.fill(0); R.ang=T[22]; R.va=0; R.bx=R.by=R.bvx=R.bvy=0; mx=my=0; }
    if(turned) mx=my=0;
    const lx=mx*cs+my*sn, ly=-mx*sn+my*cs;
    R.pin+=((o.act?1:0)-R.pin)*Math.min(1,dt/(o.act?0.035:0.16));
    const k0=lerp(1000,110,P.jelly)*(o.oc?1.7:1)*(o.act?1.8:1), left=P.jelly*0.55, damp=lerp(1,0.3,P.jelly), str=1-P.stretch*0.85;
    const n=dt>0?Math.max(1,Math.min(8,Math.ceil(dt*120))):0, h=n?dt/n:0, q=R.q, v=R.v, kb=k0*lerp(1,0.12,P.flab), cb=2*Math.sqrt(kb)*damp, bmax=(3+P.flab*12)*2;
    for(let step=0;step<n;step++){
      for(const j of J){
        const k=k0*KM[j], c=2*Math.sqrt(k)*damp;
        q[j]-=lx/n*left; q[j+1]-=ly/n*left;
        v[j]+=(k*(T[j]-q[j])-c*v[j])*h; v[j+1]+=(k*(T[j+1]-q[j+1])-c*v[j+1])*h; q[j]+=v[j]*h; q[j+1]+=v[j+1]*h;
      }
      constrain(q,str,2);
      if(o.grounded) for(const j of FEET){
        if(T[j+1]>-1.5){ q[j]=T[j]; q[j+1]=T[j+1]; v[j]=v[j+1]=0; }
        else if(q[j+1]>0){ q[j+1]=0; v[j+1]=Math.min(0,v[j+1]); }
      }
      if(R.pin>0.001) for(const j of ARMS){ q[j]+=(T[j]-q[j])*R.pin; q[j+1]+=(T[j+1]-q[j+1])*R.pin; v[j]*=1-R.pin; v[j+1]*=1-R.pin; }
      const ka=k0*0.9; R.va+=(ka*wrap(T[22]-R.ang)-2*Math.sqrt(ka)*damp*R.va)*h; R.ang+=R.va*h;
      if(R.pin>0.001){ R.ang+=wrap(T[22]-R.ang)*R.pin; R.va*=1-R.pin; }
      // the belly: one loose weight hanging off the middle of the torso
      R.bx-=lx/n*left; R.by-=ly/n*left; R.bvx+=(-kb*R.bx-cb*R.bvx)*h; R.bvy+=(-kb*R.by-cb*R.bvy)*h; R.bx+=R.bvx*h; R.by+=R.bvy*h;
      const bd=Math.hypot(R.bx,R.by); if(bd>bmax){ R.bx*=bmax/bd; R.by*=bmax/bd; }
    }
    // A body turned edge-on (mid-spin) is drawn squashed sideways; the layer fades out there rather than fight it.
    const tu=Math.abs(s.turn===undefined?1:s.turn), w=Math.min(1,P.jelly*5)*Math.max(0,Math.min(1,(tu-0.3)/0.3));
    const out=T.slice(); for(let i=0;i<22;i++) out[i]=T[i]+(q[i]-T[i])*w;
    const rigid=A.solve(out.slice()), loose=P.stretch*0.85*w;
    for(let i=0;i<22;i++) out[i]=rigid[i]+(out[i]-rigid[i])*loose;
    out[22]=T[22]+wrap(R.ang-T[22])*w;
    s.p=out; s.tgt=T; s.belly=[belly0+R.bx*w,R.by*w];
  }
  // A hit throws the joints. dir: +1 if the blow pushes the fighter the way they face, -1 the other way. n: damage.
  function kick(R,dir,n){
    if(!R||!R.q) return;
    const m=0.9+P.jelly*1.6, kx=dir*Math.min(1500,520+n*45), ky=-(200+n*16), jit=n*14;
    for(const j of J){ const w=(KICK[j]||0.7)*m*0.6; R.v[j]+=kx*w+rnd()*jit; R.v[j+1]+=ky*w+rnd()*jit; }
    R.bvx+=kx*0.9*m; R.bvy+=ky*0.5*m; R.va+=rnd()*Math.min(9,n*0.5);
  }
  // Afterimages. Call once a frame with the final pose; `on` says whether to leave new ones behind.
  function ghost(R,s,o,on){
    for(const gh of R.ghost) gh.t+=o.dt; while(R.ghost.length&&R.ghost[0].t>=LIFE) R.ghost.shift();
    R.gt-=o.dt; if(on&&R.gt<=0){ R.gt=EVERY; R.ghost.push({p:s.p.slice(),rot:s.rot,turn:s.turn,bow:s.bow,belly:s.belly,x:o.x,base:o.base,d:o.d,KS:o.KS,t:0}); }
  }
  function drawGhosts(ctx,R,col){
    for(const gh of R.ghost){
      ctx.save(); ctx.translate(gh.x,gh.base); ctx.scale(gh.d*gh.KS,gh.KS); ctx.globalAlpha*=0.3*(1-gh.t/LIFE);
      A.draw(ctx,gh,{col,noodle:true}); ctx.restore();
    }
  }
  // "Show rig": targets as rings, joints as dots, the springs as lines. Call inside the fighter's own transform.
  function debug(ctx,s){
    const p=s.p, T=s.tgt; if(!T) return;
    ctx.save(); ctx.translate(p[4],p[5]); if(s.rot) ctx.rotate(s.rot); if(s.turn!==undefined&&s.turn!==1) ctx.scale(Math.abs(s.turn)<0.08?0.08*(s.turn<0?-1:1):s.turn,1); ctx.translate(-p[4],-p[5]);
    ctx.lineWidth=1.6; ctx.strokeStyle='rgba(255,120,0,.9)'; ctx.fillStyle='#f60';
    for(const j of J){
      ctx.beginPath(); ctx.moveTo(p[j],p[j+1]); ctx.lineTo(T[j],T[j+1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(T[j],T[j+1],5,0,7); ctx.stroke();
      ctx.beginPath(); ctx.arc(p[j],p[j+1],3,0,7); ctx.fill();
    }
    ctx.restore();
  }
  function set(k,val){ if(!(k in P)) return; P[k]=val; try{ g.localStorage.setItem('dd-rig',JSON.stringify(P)); }catch(e){} }
  A.rig={P,make,apply,kick,ghost,drawGhosts,debug,set};
})(typeof window!=='undefined'?window:globalThis);
