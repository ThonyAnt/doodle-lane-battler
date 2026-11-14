// The three scripted "people" from tools/balance.js (copied, so the bench stays as it is): a masher, a jumper and a
// keep-away player. Each is a guess at one habit people have. They are fixed members of the trained CPU's league.
// person(kind) returns (S, side, dt)=>void, called every frame; it presses buttons through S.setInput like a controller.
// The kiter reads S.snapW (the arena width), which the caller sets.
'use strict';
function person(kind){
  let t=0, n={j:0,a:0,b:0}, flip=0, hop=220+Math.random()*90, every=7+Math.floor(Math.random()*5);     // no two people time things the same
  return (S,side,dt)=>{
    if(S.phase!=='fight') return; t-=dt; if(t>0) return; t=0.10+Math.random()*0.07;
    const f=S.f[side], e=S.f[1-side], dir=Math.sign(e.x-f.x)||1, dist=Math.abs(e.x-f.x), c=S.cnt[side], it=S.items[side][0];
    let l=0,r=0,d=0;
    if(kind==='masher'){ if(dir>0) r=1; else l=1; n.a++; if(++flip%every===0) n.j++; }                       // run at them and mash
    else if(kind==='jumper'){ if(dir>0) r=1; else l=1; if(f.ground&&dist<hop){ n.j++; hop=220+Math.random()*90; } if(dist<95+Math.random()*30) n.a++; }   // jump in, attack on the way down
    else if(kind==='kiter'){ const want=it&&it.kind==='ranged'?Math.min(420,it.st.dist*0.8):90;            // keep away and shoot (or poke)
      if(dist<want-60&&f.x>60&&f.x<S.snapW-60){ if(dir>0) l=1; else r=1; } else if(dist>want+40){ if(dir>0) r=1; else l=1; }
      if(f.face===dir&&Math.abs(e.y-f.y)<50&&dist<(it&&it.kind==='ranged'?it.st.dist:110)) n.a++; else if(f.face!==dir){ if(dir>0) r=1; else l=1; }
      if(e.y>f.y+70&&f.ground) n.j++; }
    S.setInput(side,{l,r,d,j:c.j+(n.j>0?1:0),a:c.a+(n.a>0?1:0),b:c.b,m:c.m,q:c.q,h:0,u:c.u}); n.j=n.a=0;
  };
}
module.exports=person;
