// Rules test for the InkShop world: the art board, drawn shapes, hacks, counters, slam damage and the mining tool.
// Run: node tools/test-world.js
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,INK,boardCells,MOVES,replayDuel};')();
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
{ // transform: weapons that change during the fight (TRANSFORMS; it.customs set through setItem or tweak)
  const mk=(spec,customs)=>{ const S=fresh(); S.setItem(0,0,Object.assign({element:'none',name:'W',customs},spec),50); S.f[0].held=0; return S; };
  const it0=S=>S.items[0][0], near=(S,d)=>{ const a=S.f[0], b=S.f[1]; a.x=500; b.x=500+d; a.y=b.y=BOARD.floor; a.vx=b.vx=0; a.face=1; b.face=-1; b.hurt=0; };
  const dtap=S=>{ inp(S,0,{d:1}); run(S,0.05); inp(S,0,{d:0}); run(S,0.05); inp(S,0,{d:1}); run(S,0.05); inp(S,0,{d:0}); };
  { const S=mk({kind:'melee',style:'blade'},[{id:'nope'},{id:'evolve',hits:99},{id:'giant'}]); let threw=false;
    ok('transform: one known customization is kept, its numbers in range',JSON.stringify(it0(S).customs)==='[{"id":"evolve","hits":6}]',it0(S).customs);
    try{ for(const c of [null,7,'x',[1],[{}],[{id:'split',secs:NaN}],{id:'giant'}]){ S.tweak(0,0,{customs:c}); run(S,0.1); S.snapshot(); } }catch(e){ threw=e.message; }
    ok('transform: bad customizations never throw',threw===false,threw);
    S.tweak(0,0,{customs:[{id:'giant'}]}); S.tweak(0,0,{trait:'heavy'}); ok('transform: tweaking something else keeps it',it0(S).customs[0].id==='giant');
    S.tweak(0,0,{kind:'bomb'}); ok('transform: only weapons carry one',it0(S).customs.length===0);
    const N=D.createDuel({plats:[]}); N.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'W'},50); N.tweak(0,0,{customs:[{id:'split'}]});
    ok('transform: set by tweak while drawing; forcing one is practice only',N.items[0][0].customs[0].id==='split'&&N.morph(0,0)===false); }
  { const S=mk({kind:'melee',style:'blade'},[{id:'twoform',alt:'bow'}]), f=S.f[0], p0=it0(S).st.p; near(S,300); dtap(S); run(S,0.1);
    ok('two forms: a double tap of down turns the blade into a bow of the same ink',it0(S).style==='bow'&&it0(S).kind==='ranged'&&it0(S).st.p===p0,[it0(S).kind,it0(S).style]);
    const v=S.snapshot().items[0][0]; ok('two forms: the snapshot shows the form and the moment of change',v.style==='bow'&&v.tf.f===1&&v.tf.m<0.5,v.tf);
    run(S,0.6); inp(S,0,{a:1}); run(S,0.05); const m=f.act&&f.act.m; dtap(S);
    ok('two forms: a move in progress is finished in the form it began in',/^bow_/.test(m)&&!!f.act&&it0(S).style==='bow',m);
    run(S,1.2); inp(S,0,{a:2}); run(S,0.05); ok('two forms: then it changes, and the next move is the blade\'s',it0(S).style==='blade'&&!!f.act&&/^blade/.test(f.act.m),f.act&&f.act.m); }
  { const S=mk({kind:'melee',style:'blade'},[{id:'split',secs:3}]), f=S.f[0], e=S.f[1]; near(S,60); const hp=e.hp;
    S.play(0,'blade3'); run(S,0.4); ok('split: the finisher lands and the move goes on as a blade',e.hp<hp&&it0(S).style==='blade'&&!!f.act,it0(S).style);
    run(S,0.6); ok('split: after it the weapon is a pair',it0(S).style==='dual'); run(S,3.2); ok('split: and rejoins in time',it0(S).style==='blade'); }
  { const S=mk({kind:'melee',style:'hammer'},[{id:'giant',every:3}]), f=S.f[0], r0=it0(S).st.reach; near(S,400);
    S.play(0,'hammer1'); run(S,0.1); const early=it0(S).st.reach; run(S,3.2); S.play(0,'hammer1'); run(S,0.05);
    ok('giant: once charged the next move has twice the reach',early===r0&&it0(S).st.reach===r0*2&&S.snapshot().items[0][0].tf.on===1,[r0,it0(S).st.reach]);
    run(S,1.2); ok('giant: and the weapon shrinks back after it',it0(S).st.reach===r0&&!f.act); }
  { const S=mk({kind:'melee',style:'blade'},[{id:'evolve',hits:2}]), z0=it0(S).st.size, d0=it0(S).st.dmg, hit=()=>{ near(S,50); S.play(0,'blade1'); run(S,0.5); };
    hit(); const one=S.f[0].tf[0].s; hit(); ok('evolve: a stage every two hits, bigger and stronger',one===0&&S.f[0].tf[0].s===1&&it0(S).st.size>z0&&it0(S).st.dmg>d0);
    hit(); hit(); hit(); hit(); ok('evolve: three stages at most',S.f[0].tf[0].s===2); }
  { const S=mk({kind:'melee',style:'blade'},[{id:'thrown'}]); near(S,80); run(S,0.7); const a=it0(S).style; near(S,420); run(S,0.7); const b=it0(S).style;
    inp(S,0,{a:1}); run(S,0.2); ok('thrown: a blade up close, thrown at a far foe, and the throw comes back',a==='blade'&&b==='hurl'&&S.pr.length>0&&S.pr[0].tr==='boomerang',[a,b,S.pr.map(p=>p.tr)]); }
  { const S=mk({kind:'melee',style:'spear'},[{id:'overgrown',secs:10}]); near(S,400); const r0=it0(S).st.reach; run(S,5); const r1=it0(S).st.reach;
    near(S,50); S.play(1,'fist1'); run(S,0.3); ok('overgrown: it grows, and a blow taken cuts it back',r1>r0*1.4&&it0(S).st.reach<r1,[r0,r1,it0(S).st.reach]); }
  { const S=mk({kind:'melee',style:'blade'},[{id:'twoform',alt:'spear'}]), f=S.f[0]; near(S,300); run(S,0.2); f.od=100; S.startUlt(0); run(S,0.1); dtap(S); run(S,0.5);
    const mid=it0(S).style, cast=f.act&&f.act.m; let n=0; while(S.ult>=0&&n++<600) run(S,1/60);
    ok('transform: nothing changes while an ultimate plays',mid==='blade'&&cast==='fleet'&&n<600,[mid,cast,n]); }
  { const S=D.createDuel({plats:[],seed:5}); S.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'W',customs:[{id:'evolve',hits:2}]},50); S.setItem(1,0,{kind:'melee',style:'blade',element:'none',name:'V',customs:[{id:'twoform'}]},50);
    S.setReady(0); S.setReady(1); run(S,3.5); const f=S.f[0], e=S.f[1];
    for(let i=0;i<6;i++){ e.x=f.x+50; e.y=0; f.face=1; e.hurt=0; inp(S,0,{a:i+1}); run(S,0.5); }
    inp(S,1,{d:1}); run(S,0.05); inp(S,1,{d:0}); run(S,0.05); inp(S,1,{d:1}); run(S,0.05); inp(S,1,{d:0}); run(S,0.5);
    const st=S.f[0].tf[0].s, alt=S.items[1][0].style; e.hp=-1; run(S,6);
    ok('transform: stage and form start afresh each round',st>0&&alt==='spear'&&S.phase==='draw'&&S.items[1][0].style==='blade'&&!S.f[0].tf,[st,alt,S.phase,S.items[1][0].style]); }
  { const S=D.createDuel({seed:77,record:true}); S.setItem(0,0,{kind:'melee',style:'blade',element:'none',name:'A',customs:[{id:'twoform',alt:'bow'}]},50); S.setItem(1,0,{kind:'ranged',style:'gun',element:'none',name:'B',customs:[{id:'split'}]},50);
    S.setReady(0); S.setReady(1); let n=0;
    for(let i=0;i<60*20&&S.phase!=='over';i++){ inp(S,0,{r:i%90<40?1:0,d:i%45<3||(i%45>5&&i%45<9)?1:0,a:Math.floor(i/25)}); inp(S,1,{l:i%120<30?1:0,d:i%70<20?1:0,a:Math.floor(i/40)}); S.ticks(2); for(const e of S.snapshot().ev) if(e.e==='tf') n++; }
    const R=D.replayDuel?D.replayDuel(S.log()):null;
    ok('transform: a match with transforming weapons replays to the same state',n>0&&S.sane()&&(!R||R.hash()===S.hash()),{changes:n,replayed:!!R}); }
}
console.log(bad?bad+' failed':'all world rules pass'); process.exit(bad?1:0);
