// Rules test for the InkShop world: the art board, drawn shapes, hacks, counters, slam damage and the mining tool.
// Run: node tools/test-world.js
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,INK,boardCells,MOVES,replayDuel,CUSTOMS,CUSTOM_BUDGET,fitCustoms,customPoints,customsTotal,validItem};')();
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
/* ---------- wielder customizations (CUSTOMS in the rules): the table, the validator, and each block ---------- */
{
  const SW={kind:'melee',style:'blade',element:'none',name:'Sword',traits:['swift'],trait:'swift'};
  // a practice match on the plain stage, a sword each, Blue's with the blocks asked for
  const mk=(customs,o)=>{ const S=D.createDuel(Object.assign({practice:true,seed:7},o)); S.step(1/60); S.setItem(0,0,SW,50); S.setItem(1,0,SW,50); if(customs) S.setCustoms(0,0,customs); S.snapshot(); return S; };
  const go=(S,sec,each)=>{ for(let i=0;i<Math.round(sec*120);i++){ S.step(1/120); if(each) each(i); } };
  const cus=S=>S.snapshot().ev.filter(e=>e.e==='cu'), swing=S=>{ S._a=(S._a||0)+1; inp(S,0,{a:S._a}); };
  const F=(l,k,s)=>D.fitCustoms(l,k||'melee',s===undefined?'blade':s);
  { // the table and the validator
    ok('wielder: seven blocks, each with a label, a cost, kinds, a line for the player and a tell',['lifesteal','glide','airjump','dashhit','armour','grow','rage'].every(id=>{ const d=D.CUSTOMS[id]; return d&&d.axis==='wielder'&&d.label&&d.cost>0&&Array.isArray(d.kinds)&&d.text&&d.tell; }));
    ok('a bare id gets default parameters',JSON.stringify(F(['lifesteal']))==='[{"id":"lifesteal","params":{"share":0.3}}]',F(['lifesteal']));
    ok('parameters are clamped to their range, whole-number ones rounded',F([{id:'lifesteal',share:99}])[0].params.share===0.4&&F([{id:'lifesteal',params:{share:-5}}])[0].params.share===0.15&&F([{id:'lifesteal',share:'x'}])[0].params.share===0.3&&F([{id:'grow',max:4.4}])[0].params.max===4);
    let threw=''; for(const junk of [null,undefined,7,'x',{},[null],[undefined,1,{},[],'nope',{id:5},{id:'__proto__'},{id:'constructor'},{id:'toString'},{id:'LIFESTEAL ',params:'zz'},{id:'glide',params:{fall:NaN}},{id:'rage',when:{id:'x'},cost:'y'}]]) try{ D.fitCustoms(junk,'melee','blade'); D.fitCustoms(junk); }catch(e){ threw+=e.message; }
    ok('nonsense never throws; unknown ids are dropped',threw===''&&JSON.stringify(F(['nope',{id:'__proto__'},{id:'LIFESTEAL '}]).map(e=>e.id))==='["lifesteal"]',threw);
    ok('a block that does not suit the kind is dropped',F(['dashhit'],'ranged','gun').length===0&&F(['armour'],'ranged','gun').length===1&&F(['lifesteal'],'shield','').length===0);
    ok('two big blocks never fit the budget; a big and a small one do',F(['lifesteal','rage']).length===1&&F(['armour','grow','dashhit']).length===1&&F(['lifesteal','glide']).length===2&&D.customsTotal(F(['lifesteal','glide']))<=D.CUSTOM_BUDGET,D.customsTotal(F(['lifesteal','glide'])));
    const tight=F([{id:'armour',soak:1,cd:2},{id:'airjump',jumps:2}]);
    ok('a second block that is too dear is weakened to fit',tight.length===2&&tight[1].params.jumps===1&&D.customsTotal(tight)<=D.CUSTOM_BUDGET,[tight,D.customsTotal(tight)]);
    ok('never more than two, never the same twice',F(['glide','airjump','glide','lifesteal']).length===2&&F(['glide','glide']).length===1);
  }
  { // giving an item its blocks
    const S=mk(), v0=S.items[0][0].ver, it=S.setCustoms(0,0,['lifesteal','bogus']);
    ok('setCustoms gives the item its blocks and a new version, and the snapshot carries them',it&&it.customs.length===1&&it.ver>v0&&JSON.stringify(S.snapshot().items[0][0].cu)==='[{"id":"lifesteal","params":{"share":0.3}}]'&&S.snapshot().items[1][0].cu===undefined);
    ok('a tweak of something else keeps them; a change of kind drops what no longer suits; [] clears',S.tweak(0,0,{tune:1}).customs.length===1&&S.tweak(0,0,{kind:'shield',style:''}).customs.length===0&&mk(['glide']).setCustoms(0,0,[]).customs.length===0);
    const R=D.createDuel({seed:3}); R.setItem(0,0,SW,50); const drawn=R.setCustoms(0,0,['rage']); R.setReady(0);
    ok('allowed in the draw phase, but not once ready',drawn.customs.length===1&&R.setCustoms(0,0,['glide'])===null&&R.items[0][0].customs[0].id==='rage');
    ok('a reader\'s answer may name blocks',D.validItem({kind:'melee',style:'blade',name:'x',customs:['grow',{id:'bad'}]}).customs.length===1);
  }
  { // lifesteal: orbs, and the heal lands when they arrive
    const S=mk(['lifesteal']), a=S.f[0], b=S.f[1]; b.x=a.x+60; a.hp=100; let motes=0, ins=[], lost=0, hpAtHit=null;
    swing(S); go(S,1.5,()=>{ a.rest=0; b.rest=0; motes=Math.max(motes,S.motes.length); if(b.hp<HP0&&hpAtHit===null){ hpAtHit=a.hp; lost=HP0-b.hp; } ins.push(...cus(S).filter(e=>e.c==='lifesteal')); });
    ok('lifesteal: a hit releases three to six orbs and heals nothing yet',motes>=3&&motes<=6&&hpAtHit===100,{motes,hpAtHit});
    ok('lifesteal: every orb arrives, the heal is 30% of the damage, and the last arrival carries the total',S.motes.length===0&&ins.length===motes&&Math.abs((a.hp-100)-lost*0.3)<0.01&&ins.filter(e=>e.total).length===1&&Math.abs(ins[ins.length-1].total-lost*0.3)<0.06,{healed:+(a.hp-100).toFixed(2),lost:+lost.toFixed(2)});
    const S2=mk(), a2=S2.f[0], b2=S2.f[1]; S2.setItem(0,0,Object.assign({},SW,{element:'plant'}),50); b2.x=a2.x+60; a2.hp=100; let m2=0, l2=0;
    swing(S2); go(S2,1.5,()=>{ a2.rest=0; b2.rest=0; m2=Math.max(m2,S2.motes.length); l2=Math.max(l2,HP0-b2.hp); });
    ok('plant ink heals by orbs too, 30% of the damage as before',m2>=3&&Math.abs((a2.hp-100)-l2*0.3)<0.01,{orbs:m2,healed:+(a2.hp-100).toFixed(2),lost:+l2.toFixed(2)});
    const S3=mk(['lifesteal']), a3=S3.f[0], b3=S3.f[1]; b3.x=a3.x+60; b3.face=-1; a3.hp=100; b3.shield=5; b3.shieldTr=''; swing(S3); let m3=0; go(S3,0.8,()=>{ m3=Math.max(m3,S3.motes.length); });
    ok('lifesteal: a blocked hit gives no orbs',m3===0&&a3.hp===100&&!S.cuFault&&!S2.cuFault&&!S3.cuFault,m3);
  }
  { // glide
    const fall=(c,down)=>{ const S=mk(c), a=S.f[0]; a.y=300; a.ground=false; a.vy=0; if(down) inp(S,0,{d:1}); let t=0, on=0; while(!a.ground&&t<2000){ S.step(1/120); t++; const v=S.snapshot().f[0]; if(v.cv&&v.cv.glide) on++; } return {t:t/120,on,after:S.snapshot().f[0].cv}; };
    const plain=fall(), g=fall(['glide']), d=fall(['glide'],1);
    ok('glide: a fall takes more than twice as long, the snapshot says so meanwhile, and holding down drops as usual',g.t>plain.t*2.2&&g.on>50&&!g.after&&Math.abs(d.t-plain.t)<0.03,{plain:plain.t.toFixed(2),glide:g.t.toFixed(2),down:d.t.toFixed(2)});
  }
  { // extra jump
    const jumps=c=>{ const S=mk(c), a=S.f[0]; let top=0, ev=[]; for(let k=1;k<=5;k++){ inp(S,0,{j:k}); go(S,0.25,()=>{ top=Math.max(top,a.y); }); ev.push(...cus(S)); } go(S,0.3,()=>{ top=Math.max(top,a.y); }); return {top:Math.round(top),ev}; };
    const p=jumps(), x=jumps(['airjump']), x2=jumps([{id:'airjump',jumps:2}]);
    ok('extra jump: a third jump in the air, announced once; two with jumps:2',x.top>p.top+40&&x.ev.length===1&&x.ev[0].k==='jump'&&p.ev.length===0&&x2.ev.length===2&&x2.top>x.top+40,{plain:p.top,one:x.top,two:x2.top});
  }
  { // dash on hit
    const S=mk(['dashhit']), a=S.f[0], b=S.f[1]; b.x=a.x+60; const bx=b.x; swing(S); let ev=[]; go(S,0.5,()=>{ ev.push(...cus(S)); });
    ok('dash on hit: the holder comes out behind the foe, facing them, and the foe is knocked the other way',ev.length===1&&ev[0].k==='zip'&&ev[0].x<bx&&ev[0].x2>bx&&a.x>b.x&&a.face===-1&&b.x<bx,{ax:Math.round(a.x),bx:Math.round(b.x)});
    b.x=a.x-60; b.vx=0; swing(S); go(S,0.5,()=>{ ev.push(...cus(S)); }); ok('dash on hit: not again within its cooldown',ev.length===1);
    const W=mk(['dashhit']), wa=W.f[0], wb=W.f[1]; wb.x=940; wa.x=900; swing(W); let wev=0; go(W,0.5,()=>{ wev+=cus(W).length; });
    ok('dash on hit: no room behind a foe at the wall, no dash',wev===0&&wa.x<wb.x,Math.round(wa.x));
  }
  { // armour while swinging
    const trade=c=>{ const S=mk(c), a=S.f[0], b=S.f[1]; b.x=a.x+60; b.face=-1; inp(S,1,{a:1}); go(S,0.02); swing(S); let ev=[], shell=0, low=HP0, cut=false;
      go(S,0.6,()=>{ a.rest=0; low=Math.min(low,a.hp); if(a.hurt>0) cut=true; const v=S.snapshot(); if(v.f[0].cv&&v.f[0].cv.armour) shell++; ev.push(...v.ev.filter(e=>e.e==='cu')); }); return {lost:HP0-low,cut,ev,shell}; };
    const p=trade(), g=trade(['armour']);
    ok('armour: the first blow taken mid-swing is mostly soaked and does not stagger; the shell shows before it',p.cut&&!g.cut&&g.ev.some(e=>e.k==='crack')&&g.lost>0&&g.lost<p.lost*0.5&&g.shell>0,{plain:+p.lost.toFixed(2),armoured:+g.lost.toFixed(2)});
    const S=mk(['armour']), a=S.f[0], b=S.f[1]; b.x=a.x+60; b.face=-1; inp(S,1,{a:1}); let n=0; go(S,0.5,()=>{ n+=cus(S).length; });
    ok('armour: nothing when not attacking',n===0&&a.hp<HP0);
  }
  { // combo growth
    const S=mk(['grow']), a=S.f[0], b=S.f[1], seen=[], dm=[]; let ev=[];
    for(let k=0;k<5;k++){ b.x=a.x+a.face*60; b.vx=0; b.y=a.y; b.vy=0; b.hurt=0; a.act=null; a.cd[0]=0; S.stop=0; b.hp=HP0; S.play(0,'blade1'); go(S,0.45,()=>{ a.rest=0; ev.push(...cus(S)); }); dm.push(+(HP0-b.hp).toFixed(2)); seen.push((S.snapshot().f[0].cv||{}).grow||0); }
    ok('combo growth: the count goes 1,2,3,4 and stops, each step hits 6% harder, with an event a step',seen.join()==='1,2,3,4,4'&&dm[1]>dm[0]&&Math.abs(dm[4]/dm[0]-1.24)<0.02&&ev.filter(e=>e.k==='up').length===4,{seen,dm});
    go(S,2,()=>{ ev.push(...cus(S)); }); ok('combo growth: it drops after 1.8 s without a hit',!S.snapshot().f[0].cv&&ev.filter(e=>e.k==='drop').length===1);
  }
  { // rage
    const S=mk(['rage']), a=S.f[0]; let ev=[]; const speed=()=>{ a.vx=0; inp(S,0,{r:1}); let top=0; go(S,0.5,()=>{ a.rest=0; top=Math.max(top,a.vx); ev.push(...cus(S)); }); inp(S,0,{r:0}); go(S,0.3); return top; };
    const v0=speed(); a.hp=HP0*0.3; const v1=speed(), on=S.snapshot().f[0].cv;
    a.hp=HP0*0.3; a.rest=0; S.play(0,'blade1'); const r1=a.act.rate; a.hp=HP0; a.act=null; go(S,0.05); S.play(0,'blade1'); const r0=a.act.rate;
    ok('rage: under a third of health the holder runs and attacks 20% faster, with one event when it starts',Math.abs(v1/v0-1.2)<0.01&&Math.abs(r1/r0-1.2)<0.01&&ev.filter(e=>e.k==='on').length===1&&on&&on.rage===1,[v0,v1,r0,r1]);
  }
  { // an ultimate is left alone
    const S=mk(['armour']), a=S.f[0], b=S.f[1]; S.setCustoms(1,0,['lifesteal']); b.x=a.x+300; a.od=100; S.startUlt(0); const m=a.act.m; let n=0, motes=0, whole=true, last=0, low=HP0;
    for(let i=0;i<700;i++){ S.step(1/120); if(a.act&&a.act.m===m){ if(a.act.t<last) whole=false; last=a.act.t; } const v=S.snapshot(); n+=v.ev.filter(e=>e.e==='cu').length; motes=Math.max(motes,v.mo.length); low=Math.min(low,b.hp); }
    ok('an ultimate plays out and triggers no block',whole&&n===0&&motes===0&&low<HP0-20,{n,motes});
  }
  { // a recorded match with blocks replays exactly
    const play=()=>{ const S=D.createDuel({seed:42,record:true}), sp=(kind,style,element)=>({kind,style,element,name:kind+style,traits:['swift'],trait:'swift'});
      S.setItem(0,0,sp('melee','blade','plant'),50); S.setItem(0,1,sp('ranged','gun','none'),40); S.setItem(1,0,sp('melee','hammer','fire'),60); S.setItem(1,1,sp('dash','','none'),30);
      S.setCustoms(0,0,['lifesteal','airjump']); S.setCustoms(0,1,[{id:'armour',soak:0.9},'glide']); S.setCustoms(1,0,['grow','glide']); S.tweak(1,1,{customs:[{id:'rage',at:0.4}]});
      S.setReady(0); S.setReady(1); let seed=99; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }, I=[{l:0,r:0,d:0,j:0,a:0,b:0},{l:0,r:0,d:0,j:0,a:0,b:0}], seen={};
      for(let i=0;i<120*40&&S.phase!=='end'&&S.phase!=='over';i++){ if(i%9===0) for(const s of [0,1]){ const q=I[s], foe=S.f[1-s], me=S.f[s]; q.r=foe.x>me.x+50?1:0; q.l=foe.x<me.x-50?1:0; if(rnd()<0.5) q.a++; if(rnd()<0.15) q.b++; if(rnd()<0.2) q.j++; q.d=rnd()<0.1?1:0; S.setInput(s,q); }
        S.ticks(1); if(i%4===0) for(const e of S.snapshot().ev) if(e.e==='cu') seen[e.c]=1; }
      return {S,seen}; };
    const A=play(), B=play(), R=D.replayDuel(JSON.parse(JSON.stringify(A.S.log()))), v=A.S.snapshot();
    ok('a match with blocks: the same seed and presses give the same match, and its log replays to the same hash',A.S.hash()===B.S.hash()&&R.hash()===A.S.hash()&&R.tickN===A.S.tickN,[A.S.hash(),B.S.hash(),R.hash()]);
    ok('blocks fired in it, none threw, and the snapshot is plain JSON',Object.keys(A.seen).length>=3&&!A.S.cuFault&&JSON.stringify(JSON.parse(JSON.stringify(v)))===JSON.stringify(v),Object.keys(A.seen));
  }
}
/* ---------- end of the wielder customizations ---------- */
console.log(bad?bad+' failed':'all world rules pass'); process.exit(bad?1:0);
