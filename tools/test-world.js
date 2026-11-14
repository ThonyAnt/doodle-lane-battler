// Rules test for the InkShop world: the art board, drawn shapes, hacks, counters, slam damage and the mining tool.
// Run: node tools/test-world.js
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,INK,boardCells,MOVES};')();
const T=D.INK.T, toPts=D.INK.toPts;
const HP0=D.createDuel({practice:true}).f[0].hp;   // full health, whatever the rules set it to
let bad=0; const ok=(name,cond,info)=>{ if(!cond) bad++; console.log((cond?'ok   ':'FAIL ')+name+(info!==undefined?'  '+JSON.stringify(info):'')); };
const BOARD={x0:200,x1:1000,floor:60,top:560};
function fresh(){ const S=D.createDuel({practice:true,width:1400,plats:[]}); S.setLayout({w:1400,board:BOARD,plats:[]}); S.step(1/60); S.snapshot(); return S; }
const run=(S,sec)=>{ for(let i=0;i<Math.round(sec*60);i++) S.step(1/60); };
const inp=(S,side,o)=>{ S._i=S._i||[{l:0,r:0,d:0,j:0,a:0,b:0,m:0,q:0,h:0},{l:0,r:0,d:0,j:0,a:0,b:0,m:0,q:0,h:0}]; Object.assign(S._i[side],o); S.setInput(side,S._i[side]); };
const draw=(S,side,name,x,yUp,sc,fx)=>{ for(const st of toPts(T[name],x,-yUp,sc||1,fx||1,0)) S.stroke(side,D.INK.densify(st,4),'#111111'); run(S,0.75); };
const evs=S=>S.snapshot().ev.map(e=>e.e);

{ // 1. the art board holds the fighters in
  const S=fresh(), f=S.f[0];
  ok('fighters start inside the board, on its floor',f.x>BOARD.x0&&f.x<BOARD.x1&&f.y===BOARD.floor&&S.f[1].x<BOARD.x1,[f.x,f.y]);
  ok('the stage has his three ledges and starts with no crate',S.objs.filter(o=>o.kind==='platform').length===3&&!S.objs.some(o=>o.kind==='crate'));
  inp(S,0,{l:1}); run(S,3); ok('a wall of the board stops a fighter',f.x>=BOARD.x0+10&&f.x<BOARD.x0+14,f.x);
}
{ // 2. mining through the wall
  const S=fresh(), f=S.f[0]; inp(S,0,{l:1}); run(S,3); inp(S,0,{l:0});
  inp(S,0,{m:1}); run(S,0.6); const one=S.cells.filter(c=>c.hp<2).length;
  inp(S,0,{m:2}); run(S,0.6); inp(S,0,{m:3}); run(S,0.6); inp(S,0,{m:4}); run(S,0.6);
  const dead=S.cells.filter(c=>c.hp<=0).length;
  ok('one swing chips a cell, two break it',one===1&&dead>=1,{one,dead,breached:S.breached});
  inp(S,0,{m:5}); run(S,0.6); inp(S,0,{m:6}); run(S,0.6); inp(S,0,{m:7}); run(S,0.6); inp(S,0,{m:8}); run(S,0.6);
  inp(S,0,{l:1}); run(S,2.5);
  ok('the fighter walks out through the hole and drops to the desktop',f.x<BOARD.x0-10&&f.y<BOARD.floor,[Math.round(f.x),f.y,S.cells.filter(c=>c.hp<=0).map(c=>c.side+c.y0)]);
}
{ // 3. drawn shapes
  const S=fresh(), f=S.f[0], e=S.f[1];
  draw(S,0,'platform',f.x+150,BOARD.floor+100); const p=S.objs.find(o=>o.kind==='platform'&&o.owner===0);
  ok('a flat line becomes a platform',!!p,p&&[p.x,p.y,p.w,p.life]);
  draw(S,0,'wall',f.x+60,BOARD.floor+45); const w=S.objs.find(o=>o.kind==='wall');
  inp(S,0,{r:1}); run(S,1.2); inp(S,0,{r:0});
  ok('a steep line becomes a wall that blocks movement',!!w&&f.x<w.x,[Math.round(f.x),w&&w.x]);
  draw(S,0,'shield',f.x,f.y+55,0.95); ok('a circle around yourself is a shield',!!f.bubble,f.bubble);
  f.bubble=null; for(const st of toPts(T.lightning,f.x+80,-(f.y+110),0.8,1,0)) S.stroke(0,D.INK.densify(st,4),'#111111'); run(S,0.65);
  ok('a zig-zag throws a lightning bolt',S.pr.some(p=>p.k==='bolt')||evs(S).includes('spark'),S.pr.map(p=>p.k));
  const S2=fresh(), g=S2.f[0]; draw(S2,0,'arrow',g.x+60,g.y+55,0.95,1);
  ok('an arrow from yourself is a dash',g.x>BOARD.x0+(BOARD.x1-BOARD.x0)*0.2+60,Math.round(g.x));
  const S3=fresh(), h=S3.f[0]; draw(S3,0,'sword',h.x+60,h.y+170,0.85);
  ok('a sword drawn mid-fight is forged into the hand',S3.items[0][h.held]&&S3.items[0][h.held].style==='blade',S3.items[0][h.held]&&S3.items[0][h.held].name);
  const S4=fresh(), k=S4.f[0]; draw(S4,0,'hammer',k.x+60,k.y+170,0.85);
  ok('a hammer is recognised as a hammer',S4.items[0][k.held]&&S4.items[0][k.held].style==='hammer');
  const S5=fresh(); S5.f[0].ink2=3; const before=S5.objs.length; draw(S5,0,'platform',400,200);
  ok('no ink, no shape',S5.objs.length===before);
}
{ // 4. hacks and counters
  const S=fresh(), f=S.f[0], e=S.f[1];
  ok('a hack needs a full overdrive bar',S.startHack(0,3)===false);
  f.od=100; ok('POPUPSTORM starts with a telegraph',S.startHack(0,3)===true&&S.hack&&S.hack.counter==='x',S.hack&&S.hack.counter);
  run(S,1.4); ok('after the telegraph, pop-ups rain down',S.objs.filter(o=>o.kind==='popup').length===4);
  const S2=fresh(); S2.f[0].od=100; S2.startHack(0,3); draw(S2,1,'x',S2.f[1].x-80,S2.f[1].y+150);
  ok('drawing the counter glyph cancels the hack and stuns the hacker',!S2.hack&&S2.f[0].stun>0&&S2.objs.every(o=>o.kind!=='popup'),{stun:S2.f[0].stun});
  const S3=fresh(); S3.f[0].od=100; S3.startHack(0,0); run(S3,1.6);
  ok('BREAKOUT opens the board',!!S3.broken&&S3.broken.t>12,S3.broken&&S3.broken.t);
  inp(S3,0,{l:1}); run(S3,3); ok('and fighters can leave it',S3.f[0].x<BOARD.x0,Math.round(S3.f[0].x));
  run(S3,12); ok('the canvas is patched after 15 seconds and pulls them back in',!S3.broken&&S3.f[0].x>BOARD.x0,Math.round(S3.f[0].x));
  const S4=fresh(); S4.setItem(1,0,{kind:'melee',style:'blade',element:'none',name:'Sword'},30); S4.f[0].od=100; S4.startHack(0,1); run(S4,1.4);
  ok('RECYCLE deletes the foe\'s weapon',S4.items[1][0]===null);
  const S5=fresh(); S5.f[0].od=100; S5.startHack(0,2); run(S5,1.6); ok('TRANSFORM shrinks the foe',S5.f[1].scale<0.7,S5.f[1].scale);
}
{ // 5. slam damage
  const S=fresh(), f=S.f[0], e=S.f[1], hp=e.hp; e.vx=1400; e.vy=200; e.ground=false; e.flung=0.8; e.flungBy=0; run(S,1.5);
  ok('a fighter flung into a wall at speed takes slam damage',e.hp<hp,{hp:Math.round(e.hp),x:Math.round(e.x)});
  const S2=fresh(), a=S2.f[0], b=S2.f[1]; b.x=a.x+300; for(const st of toPts(T.arrow,b.x+58,-(b.y+55),0.95,1,0)) S2.stroke(0,D.INK.densify(st,4),'#111111'); run(S2,1.3);
  ok('an arrow drawn from the foe flings them',b.x>a.x+450,Math.round(b.x-a.x));
}
{ // 6. hit-stop
  const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'Sword'},50);
  b.x=a.x+60; inp(S,0,{a:1}); let frozen=0, seen=0, hit=0, was=0, moved=0, at=0;
  for(let i=0;i<80;i++){ const x=b.x, y=b.y, t=a.act?a.act.t:-1; S.step(1/120); const v=S.snapshot(); if(v.ev.some(e=>e.e==='hit'&&e.w>0)) hit=1;
    if(was){ seen++; if(b.x===x&&b.y===y&&(a.act?a.act.t:-1)===t) frozen++; } else if(hit&&!v.hs&&(b.x!==x||b.y!==y)) moved=1; was=v.hs; }
  ok('a sword hit freezes the fight for a few frames, then it carries on',hit&&seen>=4&&seen<=16&&frozen===seen&&moved,{seen,frozen,moved});
}
{ // 7. the ultimate
  const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'Sword'},60);
  ok('the ultimate needs a full overdrive bar',S.startUlt(0)===false);
  ok('and a drawing to copy',(S.f[1].od=100,S.startUlt(1))===false);
  S.f[1].od=0; a.od=100; const hp=b.hp; inp(S,0,{u:1});
  ok('a full bar starts the fleet and empties it',a.act&&a.act.m==='fleet'&&a.od===0&&a.act.n===7,a.act&&a.act.n);
  run(S,1.4); const hov=S.pr.filter(p=>p.st==='fleet'&&p.hover).length;
  ok('the copies gather above the fighter during the wind-up',hov>=5&&b.hp===hp&&a.y>BOARD.floor,{hov,y:Math.round(a.y)});
  let low7=hp; for(let i=0;i<270;i++){ S.step(1/60); low7=Math.min(low7,b.hp); }      // practice mode heals a rested fighter, so take the lowest health seen
  ok('then fly at the foe; the whole volley is worth its fixed damage',Math.abs((hp-low7)-30)<0.5&&!S.pr.length&&!a.act,{lost:+(hp-low7).toFixed(1)});
  const S2=fresh(), c=S2.f[0], d=S2.f[1]; S2.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'Sword'},20); S2.setItem(1,0,{kind:'melee',style:'fist',element:'none',name:'Gloves'},30);
  c.od=100; d.x=c.x+40; d.face=-1; const dx=d.x; inp(S2,0,{u:1}); run(S2,0.95); inp(S2,1,{a:1,j:1,r:1}); run(S2,0.3);
  ok('while an ultimate plays the fighter next to the caster cannot hit them, jump or walk',!!c.act&&c.act.m==='fleet'&&c.hp===HP0&&!d.act&&d.x===dx&&d.ground,{hp:Math.round(c.hp),act:d.act&&d.act.m,dx:d.x-dx});
}
{ // 8. every weapon style has its own ultimate, and each is worth the same
  const cast=(kind,style,gap,prep)=>{ const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind,style,element:'none',name:style||kind},60);
    b.x=a.x+gap; a.od=100; if(prep) prep(S,a,b); const hp=b.hp, ok0=S.startUlt(0), m=a.act&&a.act.m, u=a.act&&a.act.u; let low=hp; for(let i=0;i<420;i++){ S.step(1/60); low=Math.min(low,b.hp); }   // practice mode heals a rested fighter, so take the lowest health seen
    return {ok:ok0,m,u,lost:+(hp-low).toFixed(1),clear:!a.act&&!S.pr.length,S}; };
  const full=[['melee','blade',300,'fan'],['melee','spear',300,'rain'],['ranged','hurl',300,'ring'],['ranged','staff',300,'meteor'],['melee','hammer',150,'quake'],
    ['melee','fist',180,'rush'],['melee','dual',260,'cross'],['ranged','bow',320,'pierce'],['ranged','gun',300,'storm'],['ranged','akimbo',260,'fire']];
  for(const [kind,style,gap,u] of full){ const r=cast(kind,style,gap);
    ok(style+': its ultimate is "'+u+'" and a foe who stands still takes the full 30',r.ok&&r.u===u&&Math.abs(r.lost-30)<0.6&&r.clear,{u:r.u,m:r.m,lost:r.lost,clear:r.clear}); }
  ok('a drawing that is not a weapon uses the fan of copies',cast('shield','',300).u==='fan');
  // the ways out
  { const held=[]; for(const [kind,style,gap] of [['melee','hammer',150],['ranged','bow',320],['ranged','staff',300],['melee','blade',300]]){ const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind,style,element:'none',name:style},60); S.setItem(1,0,{kind:'dash',element:'none',name:'Wings'},20); S.setItem(1,1,{kind:'melee',style:'blade',element:'none',name:'Sword'},20);
      b.x=a.x+gap; a.od=100; b.od=100; const hp=b.hp, x=b.x, y=b.y; S.startUlt(0); const t0=S.time; let n=0, moved='', low=hp, after=false;
      // the other fighter mashes every button, holds directions and tries to draw, for as long as the ultimate plays
      while(S.ult>=0&&n<900){ n++; inp(S,1,{l:n%7<3?1:0,r:n%5<2?1:0,d:n%3?1:0,j:n,a:n,b:n,m:n,q:n,u:n}); if(n%40===0) for(const st of toPts(T.wall,b.x-60,-(b.y+45),1,1,0)) S.stroke(1,D.INK.densify(st,4),'#111111');
        S.step(1/60); low=Math.min(low,b.hp); if(S.ult>=0){ if(Math.abs(b.x-x)>0.01||Math.abs(b.y-y)>0.01) moved='MOVED'; if(b.act) moved='ACTED'; if(S.objs.some(o=>o.owner===1)) moved='DREW'; if(b.od<100) moved='SPENT OVERDRIVE'; } }
      held.push(style+' '+moved+(Math.abs(hp-low-30)<0.6?'':' lost '+(hp-low).toFixed(1))+(S.ult<0?'':' NEVER ENDED')); }
    ok('while an ultimate plays the other fighter cannot move, attack, draw, hack or get out of the way',held.every(s=>!/[A-Z]{4}|lost/.test(s)),held); }
  { const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'hammer',element:'none',name:'Hammer'},60); b.x=a.x+150; b.y=a.y+170; b.ground=false; b.vy=0; a.od=100; const hp=b.hp, y=b.y; S.startUlt(0);
    let hung=true, low=hp; while(S.ult>=0){ S.step(1/60); low=Math.min(low,b.hp); if(S.ult>=0&&b.y!==y) hung=false; }
    ok('a fighter caught in mid-air hangs there, and the hammer\'s ground wave passes underneath',hung&&low===hp,{hung,lost:+(hp-low).toFixed(1)}); run(S,1); ok('and falls again once it is over',b.y<y,Math.round(b.y)); }
  { const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'Sword'},60); S.setItem(1,0,{kind:'ranged',style:'gun',element:'none',name:'Gun'},40);
    b.x=a.x+500; b.face=-1; inp(S,1,{a:1}); run(S,0.14); const p=S.pr.find(q=>q.side===1); a.od=100; const ok0=S.startUlt(0), px=p&&p.x, t0=S.time; run(S,0.6);
    ok('a shot already in the air hangs there while an ultimate plays, and the stage clock waits',!!p&&ok0&&p.x===px&&S.time===t0&&S.ult===0,{p:!!p,moved:p&&p.x-px,dt:S.time-t0});
    let n=0; while(S.ult>=0&&n++<900) S.step(1/60); run(S,0.1); ok('and flies on when it is over',p.x!==px||p.ttl<=0,p.x-px); }
  { const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'Sword'},60); S.setItem(1,0,{kind:'melee',style:'blade',element:'none',name:'Sword'},60); b.x=a.x+300; a.od=100; b.od=100; S.startUlt(0); run(S,0.3);
    ok('a second ultimate cannot start while one is playing',S.startUlt(1)===false&&b.od===100); const ev=[]; let n=0; while(S.ult>=0&&n++<900){ S.step(1/60); ev.push(...S.snapshot().ev); } S.step(1/60); ev.push(...S.snapshot().ev);
    const end=ev.find(e=>e.e==='ultend'); ok('when it is over the total damage is reported once',!!end&&end.n===30&&ev.filter(e=>e.e==='ultend').length===1,end); }
  ok('the fist rush whiffs on a foe who is too far away',cast('melee','fist',520).lost===0);
  ok('the dual blink does not reach a foe across the stage',cast('melee','dual',560).lost===0);
  { const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'dual',element:'none',name:'Twins'},60); S.setItem(1,0,{kind:'melee',style:'fist',element:'none',name:'Gloves'},30);
    b.x=a.x+40; b.face=-1; a.od=100; inp(S,1,{a:1}); run(S,0.05); S.startUlt(0); run(S,0.5);
    ok('a swing already under way when the ultimate starts stops where it is and does not land',!!a.act&&a.act.m==='ult_dash'&&a.hp===HP0,{hp:Math.round(a.hp)}); }
  // 9. an ultimate always plays out
  const styles=[['melee','blade',300],['melee','spear',300],['ranged','hurl',300],['ranged','staff',300],['melee','hammer',150],['melee','fist',180],['melee','dual',260],['ranged','bow',320],['ranged','gun',300],['ranged','akimbo',260]];
  { const lasted=[]; for(const [kind,style,gap] of styles){ const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind,style,element:'none',name:style},60); S.setItem(0,1,{kind:'dash',element:'none',name:'Wings'},20);
      b.x=a.x+gap; a.od=100; S.startUlt(0); const m=a.act.m, dur=a.act.dur; let n=0, whole=true, low=b.hp;
      // the caster mashes every button and holds directions for the whole cast
      let last=0; while(a.act&&a.act.m===m&&n<400){ n++; inp(S,0,{l:n%7<3?1:0,r:n%5<2?1:0,d:n%3?1:0,j:n,a:n,b:n,m:n,q:n,u:n}); last=a.act.t; S.step(1/60); if(a.act&&a.act.m===m&&a.act.t<last) whole=false; }
      lasted.push(style+(whole&&last>=dur-0.03?"":" CUT SHORT at "+last.toFixed(2)+" of "+dur)); }
    ok('mashing every button during a cast never cuts an ultimate short',lasted.every(s=>!/CUT/.test(s)),lasted.filter(s=>/CUT/.test(s))); }
  { const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'Sword'},60); b.x=a.x+300; a.od=100; S.startUlt(0); run(S,0.5);
    for(const st of toPts(T.hammer,a.x+60,-(a.y+170),0.85,1,0)) S.stroke(0,D.INK.densify(st,4),'#111111'); run(S,0.75);
    ok('the caster cannot swap weapons by drawing one mid-cast',!!a.act&&a.act.m==='fleet'&&S.items[0][0].style==='blade',S.items[0][0].style);
    const x=a.x; for(const st of toPts(T.arrow,a.x+60,-(a.y+55),0.95,1,0)) S.stroke(0,D.INK.densify(st,4),'#111111'); run(S,0.7);
    ok('nor dash out of it with an arrow',Math.abs(a.x-x)<30,Math.round(a.x-x)); }
  { const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'ranged',style:'gun',element:'none',name:'Gun'},60); b.x=a.x+300; a.od=100; S.startUlt(0); run(S,0.4); const x=a.x;
    for(const st of toPts(T.arrow,a.x+58,-(a.y+55),0.95,1,0)) S.stroke(1,D.INK.densify(st,4),'#111111'); run(S,0.7);
    ok('the foe cannot fling a caster',!!a.act&&a.act.m==='ult_shoot'&&Math.abs(a.x-x)<40,Math.round(a.x-x));
    for(const st of toPts(T.x,a.x,-(a.y+55),0.8,1,0)) S.stroke(1,D.INK.densify(st,4),'#111111'); run(S,0.3);
    ok('or disarm them',!!S.items[0][0]); }
  { const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'Sword'},60); b.x=a.x+300; b.od=100; S.startHack(1,1); run(S,1.0); a.od=100; S.startUlt(0); run(S,0.6);
    ok('the RECYCLE hack misses a fighter who is casting',!!S.items[0][0]&&!!a.act&&a.act.m==='fleet',{item:!!S.items[0][0],act:a.act&&a.act.m}); }
  { const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'hammer',element:'none',name:'Hammer'},60); S.setItem(1,0,{kind:'melee',style:'hammer',element:'none',name:'Hammer'},60);
    b.x=a.x+70; b.face=-1; a.od=100; S.startUlt(0); const x=a.x; for(let i=0;i<60;i++){ inp(S,1,{a:i}); S.step(1/60); }
    ok('a caster cannot be attacked at all while their ultimate plays',a.hp===HP0&&!!a.act&&a.act.m==='ult_slam'&&Math.abs(a.x-x)<30,{hp:Math.round(a.hp),dx:Math.round(a.x-x)}); }
}
{ // aiming: a fighter can turn while firing, and the shots still to come follow
  const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'ranged',style:'akimbo',element:'none',name:'Guns'},50); b.x=a.x+500;
  inp(S,0,{a:1}); let dirs=[], seen=new Set(), turned=0;
  for(let i=0;i<240;i++){ S.step(1/120); for(const p of S.pr) if(p.side===0&&!seen.has(p.id)){ seen.add(p.id); dirs.push(Math.sign(p.vx)); if(!turned){ turned=1; inp(S,0,{l:1}); } } if(i%20===19) inp(S,0,{a:S._i[0].a+1}); }
  ok('turning mid-volley turns the fighter and the later shots',dirs[0]===1&&dirs.includes(-1)&&a.face===-1,{dirs,face:a.face});
}
{ // elements: match-ups, steam, burning halves healing
  const hit=(el,held,pre)=>{ const S=fresh(), a=S.f[0], b=S.f[1]; S.setItem(0,0,{kind:'melee',style:'blade',element:el,name:'S'},50);
    if(held) S.setItem(1,0,{kind:'melee',style:'blade',element:held,name:'T'},50); if(pre) pre(b); b.x=a.x+60; const hp=b.hp; let tag;
    inp(S,0,{a:1}); for(let i=0;i<60&&b.hp===hp;i++){ S.step(1/120); for(const e of S.snapshot().ev) if(e.e==='hit') tag=e.tag; } return {d:hp-b.hp,tag,b,a,S}; };
  const base=hit('fire','fire').d, sup=hit('fire','plant'), weak=hit('fire','water'), steam=hit('fire','fire',b=>{ b.slow=2; });
  ok('fire hits a plant holder 30% harder and a water holder 20% softer',Math.abs(sup.d/base-1.3)<0.03&&Math.abs(weak.d/base-0.8)<0.03&&sup.tag==='sup'&&weak.tag==='weak',[base,sup.d,weak.d].map(v=>+v.toFixed(1)));
  ok('fire on a soaked fighter bursts into steam and dries them',Math.abs(steam.d/base-1.25)<0.03&&steam.tag==='steam'&&steam.b.slow===0,+steam.d.toFixed(1));
  const g=hit('plant','plant',b=>{ b.slow=2; }); ok('a plant hit on a soaked fighter is tagged overgrown',g.tag==='grow');
}
{ // costs: what a weapon's power spends (COSTS, S.setCustom, f.cs); 'heavy' is the power they are tried with
  const C=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {COSTS,COST_UP,cleanCost,cleanCustoms,costPoints,replayDuel,makeBot};')();
  const SW={kind:'melee',style:'blade',element:'none',name:'Sword',traits:['swift'],trait:'swift'};
  const mk=cost=>{ const S=D.createDuel({practice:true,seed:5}); S.step(1/60); S.setItem(0,0,SW,50); if(cost!==undefined) S.setCustom(0,0,cost?[{id:'heavy',cost}]:[{id:'heavy'}]);
    S.f[0].x=300; S.f[1].x=370; S.f[0].face=1; S.kept=[]; return S; };
  const look=S=>{ const v=S.snapshot(); for(const e of v.ev) if(e.e==='cost') S.kept.push(e.k); return v.f[0].cs[0]; };
  const swing=(S,m)=>{ const b=S.f[1]; b.hp=HP0; b.x=S.f[0].x+70; b.vx=0; b.hurt=0; S.f[0].act=null; S.f[0].cd[0]=0; S.play(0,m||'blade1'); };
  const dmg=S=>{ const hp=S.f[1].hp; for(let i=0;i<90&&S.f[1].hp===hp;i++) S.ticks(1); return +(hp-S.f[1].hp).toFixed(2); };
  const S0=mk(); swing(S0); const plain=dmg(S0), S1=mk(null); swing(S1); const heavy=dmg(S1);
  ok('cost: a heavy weapon with nothing to pay hits 35% harder',plain>0&&Math.abs(heavy/plain-C.COST_UP)<0.01,{plain,heavy});
  ok('cost: an item without customizations has no cost view',look(S0)===null&&look(S1).c==='');
  { const S=mk({cost:'ammo',size:3,reload:1}); const left=[]; for(let i=0;i<3;i++){ swing(S); S.ticks(2); left.push(look(S).n); } S.f[0].act=null; S.ticks(4);
    const v=look(S); ok('ammo: each attack takes a round; empty, it is held by its cooldown while it reloads',left.join()==='2,1,0'&&v.lk===1&&v.ok===0&&S.f[0].cd[0]>0.8&&S.kept.includes('reload'),{left,v});
    inp(S,0,{a:1}); run(S,0.5); ok('ammo: it cannot be used while reloading',!S.f[0].act); run(S,0.7); const w=look(S);
    ok('ammo: reloaded and usable again',w.n===3&&w.lk===0&&w.ok===1&&S.f[0].cd[0]<=0&&S.kept.includes('loaded'),w);
    const S2=mk({cost:'ammo',size:4,reload:1.2,pause:0.5}); swing(S2); S2.ticks(2); S2.f[0].act=null; const one=look(S2).n; run(S2,0.9); ok('ammo: a pause tops it up',one===3&&look(S2).n===4); }
  { const S=mk({cost:'heat'}); const heat=[]; for(let i=0;i<4;i++){ swing(S); S.ticks(2); heat.push(look(S).v); }
    ok('heat: four quick attacks take it to the top',heat.join()==='0.28,0.56,0.84,1'&&S.kept.includes('overheat'),heat);
    ok('heat: the attack that overheats it still hits hard',dmg(S)===heavy); run(S,0.6); const v=look(S);
    ok('heat: overheated, it is held by its cooldown',v.lk===1&&v.ok===-1&&S.f[0].cd[0]>0.8,v); run(S,1.6); const w=look(S);
    ok('heat: cooled, it works again',w.lk===0&&w.v===0&&w.ok===1&&S.f[0].cd[0]<=0&&S.kept.includes('cool'),w);
    const S2=mk({cost:'heat'}); swing(S2); S2.ticks(2); S2.f[0].act=null; run(S2,0.95); ok('heat: it cools when left alone',Math.abs(look(S2).v-0.13)<0.03,look(S2).v);
    const S3=mk({cost:'heat',per:0.6}); swing(S3); S3.ticks(2); swing(S3); S3.ticks(2); swing(S3,'blade2'); const pw=S3.f[0].act.pw, d=dmg(S3); ok('heat: an attack chained from an overheated weapon is weak',pw===-1&&d<plain,{pw,d}); }
  { const S=mk({cost:'ink',per:20}); S.f[0].ink2=50; swing(S); S.ticks(2); const took=50-S.f[0].ink2; ok('ink: a paid attack drinks ink and hits hard',Math.abs(took-20)<0.5&&dmg(S)===heavy,took);
    S.f[0].ink2=5; const v=look(S); swing(S); const pw=S.f[0].act.pw; ok('ink: with too little it comes out plain and takes none',v.ok===0&&pw===0&&S.f[0].ink2<6&&dmg(S)===plain&&(look(S),S.kept.includes('dry')),{v,pw}); }
  { const S=mk({cost:'blood',per:5}); const hp=S.f[0].hp; swing(S); const lost=hp-S.f[0].hp; ok('blood: an attack costs its holder health',lost===5&&S.f[0].act.pw===1&&(look(S),S.kept.includes('blood')),lost);
    S.f[0].hp=5.5; swing(S); ok('blood: it never takes the last of it',S.f[0].hp===5.5&&S.f[0].act.pw===0); }
  { const S=mk({cost:'windup',hold:0.4}); const P=mk(); swing(P); let t0=0; while(P.f[1].hp===HP0&&t0<240){ P.ticks(1); t0++; }
    swing(S); run(S,0.2); const mid=look(S), still=S.f[0].act&&S.f[0].act.t===0; let t1=24; while(S.f[1].hp===HP0&&t1<240){ S.ticks(1); t1++; }
    ok('wind-up: the move waits at its start while the ring fills, then lands late and hard',still&&Math.abs(mid.r-0.5)<0.05&&Math.abs((t1-t0)/120-0.4)<0.03&&Math.abs(HP0-S.f[1].hp-heavy)<0.01,{mid,t0,t1}); }
  { const S=mk({cost:'fragile',hits:3,mend:1}), a=S.f[0], b=S.f[1]; S.setItem(1,0,SW,40);
    const hitMe=()=>{ a.hurt=0; a.act=null; b.act=null; b.hurt=0; b.x=a.x+60; b.face=-1; S.play(1,'blade1'); run(S,0.5); };
    hitMe(); const one=look(S).n; hitMe(); hitMe(); const v=look(S); ok('fragile: it cracks with each hit its holder takes, and breaks',one===1&&v.n===3&&v.ok===-1&&S.kept.includes('crack')&&S.kept.includes('break'),v);
    b.act=null; a.hurt=0; swing(S); const pw=a.act.pw, d=dmg(S); ok('fragile: broken, it is weak',pw===-1&&d<plain,{pw,d});
    b.x=a.x+400; a.act=null; inp(S,0,{r:1}); run(S,1.3); const moved=look(S).n; inp(S,0,{r:0}); run(S,1.4); const w=look(S);
    ok('fragile: walking does not mend it, standing still does',moved===3&&w.n===0&&w.ok===1&&S.kept.includes('mend'),w); }
  { const S=mk({cost:'ammo'}); S.setItem(0,0,{kind:'ranged',style:'gun',element:'none',name:'Gun',traits:['bounce'],trait:'bounce'},50); S.f[1].x=S.f[0].x+400; S.play(0,'gun_shot'); run(S,0.25); const p0=S.pr[0]&&S.pr[0].dmg; S.pr.length=0;
    S.setCustom(0,0,[{id:'heavy',cost:{cost:'ammo'}}]); S.f[0].act=null; S.play(0,'gun_shot'); run(S,0.25); const p=S.pr[0];
    ok('cost: a paid shot is marked and does 35% more',!!p&&p.pw===1&&Math.abs(p.dmg/p0-C.COST_UP)<1e-6&&S.snapshot().pr[0].pw===1,p&&[p0,p.dmg]); }
  { const S=mk(); let threw=0; const junk=[undefined,null,7,'x',{},[null],[7],[{id:'nope'}],[{id:'heavy',cost:'x'}],[{id:'heavy',cost:{cost:'nope'}}],[{id:'heavy',cost:{cost:'ammo',size:'abc',reload:-9}}],[{id:'heavy',cost:{cost:'heat',per:1e9,cool:NaN}}],[{id:'__proto__'}],[{id:'heavy',cost:{cost:'constructor'}}]];
    for(const j of junk){ try{ S.setCustom(0,0,j); run(S,0.05); S.snapshot(); }catch(e){ threw++; } }
    for(const a of [[9,0,[]],[0,5,[]],['a','b',[]],[0,1,[{id:'heavy'}]],[]]){ try{ S.setCustom(...a); }catch(e){ threw++; } }
    ok('cost: junk customizations, sides and slots never throw',threw===0,threw);
    ok('cost: unknown ids are dropped; numbers are clamped or fall back',C.cleanCustoms([{id:'nope'},{id:'heavy',cost:{cost:'nope'}}]).length===1&&JSON.stringify(C.cleanCost({cost:'ammo',size:'abc',reload:-9}))==='{"cost":"ammo","size":4,"reload":0.6,"pause":0.7}',C.cleanCost({cost:'ammo',size:'abc',reload:-9}));
    S.setItem(0,1,{kind:'shield',element:'none',name:'Shield'},30); ok('cost: only weapons take a customization',S.setCustom(0,1,[{id:'heavy'}])===null);
    S.setCustom(0,0,[{id:'heavy',cost:{cost:'ammo'}}]); const it=S.tweak(0,0,{tune:1}); ok('cost: a tweaked item keeps it, and it uses +3 -1 points',!!it&&!!it.customs&&it.customs[0].cost.cost==='ammo'&&C.costPoints(it)===2&&S.snapshot().items[0][0].cu[0].id==='heavy');
    const M=D.createDuel({seed:3}); M.setItem(0,0,SW,40); const yes=!!M.setCustom(0,0,[{id:'heavy',cost:{cost:'heat'}}]); M.setReady(0); ok('cost: in a match it can be set while drawing, not after "ready"',yes&&M.setCustom(0,0,[])===null); }
  { const S=mk({cost:'heat',per:0.6}); swing(S); S.ticks(2); swing(S); S.ticks(2); S.f[0].act=null; run(S,0.1); const held=S.f[0].cd[0]>1; S.f[0].od=100; S.f[1].x=S.f[0].x+200;
    ok('cost: an ultimate is not held back by an overheated weapon',held&&S.startUlt(0)===true&&S.f[0].act.pw===undefined);
    const B=mk({cost:'blood',per:5}); B.f[0].od=100; const hp=B.f[0].hp; B.startUlt(0); run(B,1); ok('cost: an ultimate pays nothing',B.f[0].hp===hp); }
  { // two bots, each with a cost on its weapon: the match ends and its recording replays to the same fingerprint
    const S=D.createDuel({seed:41,record:true}), sp=(style,kind)=>({kind:kind||'melee',style,element:'none',name:'W',traits:['swift'],trait:'swift'});
    S.setItem(0,0,sp('blade'),46); S.setItem(0,1,{kind:'shield',element:'none',name:'Shield'},30); S.setItem(1,0,sp('gun','ranged'),46); S.setItem(1,1,sp('hammer'),30);
    S.setCustom(0,0,[{id:'heavy',cost:{cost:'heat'}}]); S.setCustom(1,0,[{id:'heavy',cost:{cost:'ammo',size:3}}]); S.setCustom(1,1,[{id:'heavy',cost:{cost:'fragile'}}]);
    const b0=C.makeBot(0,()=>0.6,51), b1=C.makeBot(1,()=>0.6,52), seen={}; let n=0, stuck=[0,0], worst=0;
    while(S.phase!=='over'&&n++<120*400){ b0(S,1/120); b1(S,1/120); if(S.phase==='draw'){ S.setReady(0); S.setReady(1); } S.ticks(1); for(const e of S.snapshot().ev) if(e.e==='cost') seen[e.k]=1;
      if(S.phase==='fight'&&S.ult<0&&S.stop<=0) for(const i of [0,1]){ const f=S.f[i]; stuck[i]=f.cd[0]<=0||f.cd[1]<=0||f.act?0:stuck[i]+1/120; worst=Math.max(worst,stuck[i]); } }
    const R=C.replayDuel(S.log()); R.seek(R.total);
    ok('cost: bots with costs finish a match, and nobody is without an attack for over 2 s',S.phase==='over'&&worst<=2.05&&!!seen.overheat&&!!seen.reload,{worst:+worst.toFixed(2),seen:Object.keys(seen)});
    ok('cost: the recording replays to the same fingerprint',R.hash()===S.hash(),[S.hash(),R.hash()]); }
}
console.log(bad?bad+' failed':'all world rules pass'); process.exit(bad?1:0);
