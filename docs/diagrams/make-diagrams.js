// Draws the README's figures as SVG, so they stay in step with the text:   node docs/diagrams/make-diagrams.js
// No dependencies. One palette and a few shapes (box, arrow, chip, lane) shared by every figure.
'use strict';
const fs=require('fs'), path=require('path');
const C={ink:'#e8ebf2',sub:'#9aa5bd',dim:'#5d6a86',box:'#1b2130',well:'#141926',board0:'#1a2030',board1:'#11151d',flow:'#8b96ad',
  player:'#6ea0ff',model:'#bc8cff',game:'#e3b341',agent:'#56d364',red:'#ff7b72'};
const FONT="-apple-system, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif", MONO="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const mk=c=>'m'+c.slice(1);
function T(x,y,s,o={}){ return `<text x="${x}" y="${y}"${o.anchor?` text-anchor="${o.anchor}"`:''} font-size="${o.size||11}"${o.weight?` font-weight="${o.weight}"`:''}${o.mono?` font-family="${MONO}"`:''}${o.italic?' font-style="italic"':''} fill="${o.fill||C.sub}"${o.op?` opacity="${o.op}"`:''}>${esc(s)}</text>`; }
// A box with a bold title and a few lines under it, centred as a block.
function box(x,y,w,h,title,lines,o={}){
  const cx=x+w/2, n=(lines||[]).length, th=(title?17:0)+n*14, top=y+(h-th)/2;
  let s=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${o.fill||C.box}" stroke="${o.stroke||C.dim}" stroke-width="${o.sw||1.6}"${o.dash?` stroke-dasharray="${o.dash}"`:''}/>`;
  if(title) s+=T(cx,top+12,title,{anchor:'middle',size:13,weight:700,fill:C.ink,mono:o.monoTitle});
  (lines||[]).forEach((l,i)=>{ s+=T(cx,top+(title?17:0)+11+i*14,l,{anchor:'middle',mono:o.mono,fill:o.lineFill,italic:o.italic}); });
  return s;
}
function arrow(pts,o={}){
  const c=o.color||C.flow, d=pts.map((p,i)=>(i?'L':'M')+' '+p[0]+' '+p[1]).join(' ');
  return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${o.sw||1.8}" stroke-linecap="round" stroke-linejoin="round"${o.dash?` stroke-dasharray="${o.dash}"`:''} marker-end="url(#${mk(c)})"${o.both?` marker-start="url(#${mk(c)})"`:''}/>`;
}
function chip(x,y,w,s,o={}){ return `<rect x="${x}" y="${y}" width="${w}" height="26" rx="13" fill="${C.well}" stroke="${o.stroke||C.agent}" stroke-width="1.3"/>`+T(x+w/2,y+17,s,{anchor:'middle',mono:true,size:10.5,fill:C.ink}); }
function lane(x,y,w,h,o={}){ return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="13" fill="${o.fill||'none'}" stroke="${o.stroke||C.dim}" stroke-width="1.2" stroke-dasharray="5 5" opacity="${o.op||0.9}"/>`; }
function doc(name,w,h,title,desc,body,legend){
  const cols=[C.flow,C.player,C.model,C.game,C.agent,C.red,C.dim];
  const defs=cols.map(c=>`<marker id="${mk(c)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${c}"/></marker>`).join('')
    +`<linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.board0}"/><stop offset="1" stop-color="${C.board1}"/></linearGradient>`;
  let leg='';
  if(legend){ let x=w-24; for(const [c,l] of legend.slice().reverse()){ x-=l.length*5.7; leg+=T(x,h-17,l,{size:10.5}); x-=14; leg+=`<rect x="${x}" y="${h-26}" width="9" height="9" rx="2" fill="${c}"/>`; x-=18; } }
  const out=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(desc)}" font-family="${FONT}"><title>${esc(title)}</title><defs>${defs}</defs><rect x="0" y="0" width="${w}" height="${h}" rx="18" fill="url(#board)"/>${T(24,36,title,{size:16,weight:700,fill:C.ink})}${body}${leg}</svg>\n`;
  fs.writeFileSync(path.join(__dirname,name),out); console.log(name,out.length+' bytes');
}

/* ---------- 1. a drawing becomes a weapon ---------- */
{
  let b='';
  const r1=78, r2=232, H=80;
  b+=T(309,r1-8,'about 2 seconds',{anchor:'middle',size:10.5,fill:C.model});
  b+=box(24,r1,150,H,'Your phone',['strokes + a PNG','ink spent = strength'],{stroke:C.player});
  b+=box(204,r1,210,H,'Reader',['a vision model names it:','kind, element, and how it leans','(power / range / speed)'],{stroke:C.model});
  b+=box(444,r1,206,H,'The rules build it',['same stat total for every item','ink sets the overall strength','you pick one of two traits'],{stroke:C.game});
  b+=box(680,r1,156,H,'Weapon in hand',['playable at once'],{stroke:C.player,sw:2.2});
  b+=box(866,r1,210,H,'The fight',['the server steps the rules 120×/s','screens get the state 60×/s'],{stroke:C.game});
  b+=arrow([[174,r1+40],[202,r1+40]])+arrow([[414,r1+40],[442,r1+40]])+arrow([[650,r1+40],[678,r1+40]])+arrow([[836,r1+40],[864,r1+40]]);
  b+=T(309,r1+H+22,'it also returns its 2nd and 3rd guess:',{anchor:'middle',size:10.5})+T(309,r1+H+36,'one-tap corrections under the drawing',{anchor:'middle',size:10.5});
  b+=arrow([[99,r1+H],[99,r2+40],[202,r2+40]],{color:C.model});
  b+=T(109,r2-24,'same drawing,',{size:10.5,fill:C.model})+T(109,r2-10,'a second request',{size:10.5,fill:C.model});
  b+=box(204,r2,210,H,'Score + abilities',['creativity 1–10, and abilities:','ready-made blocks, or a','script the model writes'],{stroke:C.model});
  b+=box(444,r2,206,H,'InkScript check',['parsed · every name on a list','no loops, no functions','600 characters at most'],{stroke:C.game});
  b+=box(680,r2,156,H,'Abilities attached',['0, 1, 2 or 3,','by the score'],{stroke:C.player});
  b+=box(866,r2,210,H,'During the fight',['the match clamps every effect','three faults switch a script off','(“ability fizzled”)'],{stroke:C.game});
  b+=arrow([[414,r2+40],[442,r2+40]])+arrow([[650,r2+40],[678,r2+40]])+arrow([[836,r2+40],[864,r2+40]]);
  b+=arrow([[806,r2],[806,r1+H+2]],{color:C.player});
  b+=T(797,r1+H+41,'added when they arrive',{anchor:'end',size:10.5,fill:C.player});
  b+=T(547,r2+H+18,'fails the check → dropped; a built-in ability stands in',{anchor:'middle',size:10.5,fill:C.red});
  const y=358, cells=[['1–3','no abilities','a plain sword, a stick'],['4–6','one ability','a cooler ordinary weapon'],['7–8','two abilities','a fish on a stick, a cat'],['9–10','three abilities','rare: truly out of pocket']];
  b+=T(24,y+22,'Creativity score',{size:12.5,weight:700,fill:C.ink})+T(24,y+38,'how unexpected the idea is,',{size:10.5})+T(24,y+52,'never how well it is drawn',{size:10.5});
  cells.forEach((c,i)=>{ const x=204+i*220.7, w=210;
    b+=`<rect x="${x}" y="${y}" width="${w}" height="60" rx="9" fill="${C.well}" stroke="${C.dim}" stroke-width="1.2"/>`+T(x+16,y+38,c[0],{size:21,weight:700,fill:C.model})+T(x+78,y+27,c[1],{size:12,weight:700,fill:C.ink})+T(x+78,y+44,c[2],{size:10.5}); });
  doc('drawing-to-weapon.svg',1100,468,'One drawing, from the phone to the fight','A drawing is read by a vision model in about two seconds and built into a weapon by the rules. A second request scores how unexpected it is and writes abilities, which pass the InkScript check before they are attached.',b,[[C.player,'player'],[C.model,'model call'],[C.game,"the game's own code"]]);
}

/* ---------- 2. INK-OS: a typed request becomes a tested update ---------- */
{
  let b='';
  const r1=116, H=78, r3=352;
  b+=lane(416,96,668,190);
  b+=box(24,r1,176,H,'INK-OS prompt',['C:\\> make the floor lava'],{stroke:C.player,mono:true,lineFill:C.ink});
  b+=box(232,r1,160,H,'Planner',['plans with write_todos','hands out the work'],{stroke:C.agent});
  b+=box(432,r1,188,H,'designer',['what it should feel like','the numbers to try'],{stroke:C.agent});
  b+=box(648,r1,200,H,'engineer',['settings, rules and a look','save_update checks the file'],{stroke:C.agent});
  b+=box(876,r1,192,H,'tester',['40 bot rounds with the update,','the same 40 without'],{stroke:C.agent});
  b+=arrow([[200,r1+39],[230,r1+39]])+arrow([[392,r1+39],[430,r1+39]],{color:C.agent});
  b+=chip(466,226,120,'/design.md')+chip(688,226,120,'/update.json')+chip(907,226,130,'/qa-report.md');
  b+=arrow([[526,r1+H],[526,224]],{color:C.agent})+arrow([[748,r1+H],[748,224]],{color:C.agent})+arrow([[972,r1+H],[972,224]],{color:C.agent});
  b+=arrow([[586,239],[668,239],[668,r1+H+2]],{color:C.agent})+arrow([[808,239],[896,239],[896,r1+H+2]],{color:C.agent});
  b+=T(533,213,'writes',{size:10})+T(627,233,'reads',{anchor:'middle',size:10})+T(852,233,'reads',{anchor:'middle',size:10});
  b+=T(432,276,'three sub-agents · each has its own prompt, tools and model · work is handed over as files',{size:10.5});
  b+=arrow([[990,r1],[990,84],[770,84],[770,r1-2]],{color:C.red,dash:'5 4'})+T(880,77,'FAIL → one repair round',{anchor:'middle',size:10.5,fill:C.red});
  b+=arrow([[972,252],[972,312],[312,312],[312,r1+H+2]])+T(642,306,'PASS or FAIL, with the numbers',{anchor:'middle',size:10.5});
  b+=arrow([[272,r1+H],[272,r3-2]],{color:C.agent})+T(264,334,'on PASS',{anchor:'end',size:10.5,fill:C.agent});
  b+=box(232,r3,222,H,'install_update',['refuses any file that has not','passed a clean play-test (hash)'],{stroke:C.game});
  b+=box(486,r3,206,H,'Game server gate',['checks the update again,','its own 10-round play-test'],{stroke:C.game});
  b+=box(724,r3,168,H,'The match',['live at once, in any phase','floor, weather and tint'],{stroke:C.player,sw:2.2});
  b+=box(924,r3,152,H,'Every screen',['phones and the','big screen are told'],{stroke:C.player});
  b+=arrow([[454,r3+39],[484,r3+39]])+arrow([[692,r3+39],[722,r3+39]])+arrow([[892,r3+39],[922,r3+39]]);
  b+=`<rect x="24" y="458" width="1052" height="60" rx="9" fill="${C.well}" stroke="${C.dim}" stroke-width="1.2"/>`;
  b+=T(40,481,'Shipped for “make the floor lava”',{size:11.5,weight:700,fill:C.ink})+T(1060,481,'play-test: rounds 40 s → 32 s',{anchor:'end'});
  b+=T(40,502,"jump ×1.5 · rule: if (!me.air) { hurt(me, 5); burst(me.x, 4, 6); say('HOT!'); } · look: lava, embers",{mono:true,size:10.5,fill:C.agent})+T(1060,502,'rule fired 28× a round, evenly for both sides',{anchor:'end'});
  doc('ink-os.svg',1100,554,'“Make the floor lava”: from the prompt to the arena, in about 20 seconds','A typed request goes to a planner that hands work to a designer, an engineer and a tester. They pass files to each other. The update is play-tested, refused by the install tool unless the test was clean, checked again by the game server, and then installed into the running match.',b,[[C.player,'player side'],[C.agent,'deep agent'],[C.game,"the game's own checks"],[C.red,'refusal']]);
}

/* ---------- 3. Nemesis: from a knockout to the next round ---------- */
{
  let b='';
  b+=T(24,58,'About 6 seconds from the knockout to a decision. The first version ran three sub-agents in a row and took about 25.',{size:11.5});
  b+=box(24,150,150,78,'Knockout',["the round's numbers",'are in; work starts'],{stroke:C.red});
  b+=box(204,150,196,78,'What it saw',['far / mid / close · in the air','jumps a minute · near a wall','what each weapon did'],{stroke:C.game});
  b+=box(430,150,150,78,'Planner',['two tasks,','one turn'],{stroke:C.agent});
  b+=arrow([[174,189],[202,189]])+arrow([[400,189],[428,189]]);
  b+=box(630,96,196,72,'scout',['writes your file, /dossier.md','files one line for next time'],{stroke:C.agent});
  b+=box(870,96,206,72,'/memories/<name>.md',['outlives the match','read before round 1 next time'],{stroke:C.agent,dash:'5 4',monoTitle:true});
  b+=box(630,210,196,72,'armorer',['2 of 14 ready-made weapons,','80 ink, 1 ability it writes'],{stroke:C.agent});
  b+=box(870,204,206,84,'forge_build',['legal? does the ability fire?','40 rounds against a copy of you','→ a win rate'],{stroke:C.game});
  b+=arrow([[580,176],[605,176],[605,132],[628,132]],{color:C.agent})+arrow([[580,202],[605,202],[605,246],[628,246]],{color:C.agent});
  b+=arrow([[828,132],[868,132]],{color:C.agent,both:true})+arrow([[828,246],[868,246]],{color:C.game,both:true});
  b+=arrow([[940,288],[940,310],[728,310],[728,284]],{color:C.red,dash:'5 4'})+T(834,326,'loses → forged once more',{anchor:'middle',size:10.5,fill:C.red});
  b+=arrow([[1040,288],[1040,370]],{color:C.agent})+T(1048,338,'wins',{size:10.5,fill:C.agent});
  b+=box(870,372,206,78,'Red is re-armed',['the first build that wins,','checked again by the server'],{stroke:C.red,sw:2.2});
  b+=box(580,372,260,78,'The round opens',['“Ben, 76% still — at least your','aim stays perfectly predictable.”'],{stroke:C.red,italic:true});
  b+=box(310,372,240,78,'Match over',['its notes on you open on the','desktop as a text file'],{stroke:C.player});
  b+=box(24,372,256,78,'Next match',['it reads its notes on you and','builds before round one'],{stroke:C.agent,dash:'5 4'});
  b+=arrow([[868,411],[842,411]])+arrow([[578,411],[552,411]])+arrow([[308,411],[282,411]]);
  b+=T(24,486,'A copy of you: the game’s own bot holding your weapons, as skilled as your damage says, with your habits laid over it.',{size:11});
  b+=T(24,504,'Fair play: the machine gets a player’s limits, and the same code checks both.',{size:11});
  doc('nemesis.svg',1100,542,'Nemesis: from a knockout to the next round','At the knockout a planner starts a scout and an armorer at the same time. The scout writes the player file and a note that outlives the match. The armorer forges a build and its tool spars it against a copy of the player. The first build that wins is given to Red, and the round opens with a taunt.',b,[[C.agent,'deep agent'],[C.game,"the game's own code"],[C.red,'Red, the machine']]);
}

/* ---------- 4. where the waiting hides ---------- */
{
  let b='';
  const seg=[['Draw · 45 s',24,230,'#1d2a4a',C.player],['3·2·1',230,268,'#252b3a',C.dim],['Fight · up to 90 s',268,560,'#3a2325',C.red],['Knockout',560,640,'#3a3220',C.game],['Draw · 25 s',640,800,'#1d2a4a',C.player],['3·2·1',800,838,'#252b3a',C.dim],['Fight',838,1076,'#3a2325',C.red]];
  for(const x of [230,268,560,640,800,838]) b+=`<line x1="${x}" y1="112" x2="${x}" y2="286" stroke="${C.dim}" stroke-width="1" stroke-dasharray="2 5" opacity="0.6"/>`;
  seg.forEach(([l,x0,x1,f,s])=>{ b+=`<rect x="${x0+1.5}" y="70" width="${x1-x0-3}" height="40" rx="7" fill="${f}" stroke="${s}" stroke-width="1.3"/>`+T((x0+x1)/2,95,l,{anchor:'middle',size:l==='3·2·1'?10:11.5,weight:700,fill:C.ink}); });
  const bar=(x,y,w,c,op)=>`<rect x="${x}" y="${y}" width="${w}" height="11" rx="5.5" fill="${c}" opacity="${op||1}"/>`;
  b+=T(24,146,'Reading a drawing',{size:12,weight:700,fill:C.ink})+T(150,146,'about 2 s to a usable weapon (solid); its abilities arrive a few seconds later (faint)',{size:10.5});
  for(const x of [52,112,172,662,722]) b+=bar(x,156,13,C.model)+bar(x+15,156,28,C.model,0.35);
  b+=T(24,206,'INK-OS update',{size:12,weight:700,fill:C.ink})+T(126,206,'typed whenever you like, here as the fight starts: designed, play-tested and live about 20 s later, mid-fight',{size:10.5});
  b+=bar(272,216,66,C.agent)+T(346,226,'live',{size:10.5,fill:C.agent,weight:700});
  b+=T(24,266,'Nemesis',{size:12,weight:700,fill:C.ink})+T(86,266,'starts at the knockout and decides in about 6 s, so there is nothing to wait for; Red is not ready until it has decided',{size:10.5});
  b+=bar(560,276,94,C.red)+bar(656,276,50,C.red,0.3)+T(714,286,'the agents finish their notes',{size:10.5});
  doc('timeline.svg',1100,314,'Where the waiting hides (one match, not to scale)','A match is a drawing phase, a countdown, a fight of up to ninety seconds and a knockout, repeated. Drawings are read in about two seconds. An update typed into the terminal lands about twenty seconds later. Nemesis starts at the knockout and has decided by the time drawing opens.',b);
}

/* ---------- 5. the headgear ---------- */
{
  let b='';
  const cx=176, cy=268, R=92, lev=[0.35,0,0,1,0,1];
  const pos=[[cx,cy-R,'front',0,-20,'middle'],[cx,cy+R,'back',0,30,'middle'],[cx-R,cy,'left',-18,4,'end'],[cx+R,cy,'right',18,4,'start'],[cx-65,cy-65,'left temple',-16,-6,'end'],[cx+65,cy-65,'right temple',16,-6,'start']];
  b+=T(24,72,'Six motors around the head',{size:12.5,weight:700,fill:C.ink})+T(24,88,'seen from above, nose at the top',{size:10.5});
  b+=`<path d="M ${cx-11} ${cy-R+3} L ${cx} ${cy-R-17} L ${cx+11} ${cy-R+3}" fill="${C.box}" stroke="${C.dim}" stroke-width="1.6" stroke-linejoin="round"/>`;
  b+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="${C.box}" stroke="${C.dim}" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="${R-16}" fill="none" stroke="${C.dim}" stroke-width="1" stroke-dasharray="3 5" opacity="0.6"/>`;
  pos.forEach(([x,y,name,dx,dy,an],i)=>{ const v=lev[i];
    b+=`<circle cx="${x}" cy="${y}" r="12" fill="${v?C.red:C.well}" fill-opacity="${v?0.25+0.75*v:1}" stroke="${v?C.red:C.dim}" stroke-width="1.6"/>`+T(x,y+4,String(i),{anchor:'middle',size:11,weight:700,fill:C.ink});
    b+=T(x+dx+(an==='middle'?0:(dx>0?4:-4)),y+dy+(i===0?-6:0),name,{anchor:an,size:10.5,fill:v?C.red:C.sub}); });
  b+=T(cx,cy-4,'knocked left',{anchor:'middle',size:11,weight:700,fill:C.ink})+T(cx,cy+12,'= struck on the right',{anchor:'middle',size:10.5});
  b+=T(cx,428,'right and right temple at full,',{anchor:'middle',size:10.5})+T(cx,443,'front at 35%',{anchor:'middle',size:10.5});
  const r1=84, H=78;
  b+=box(380,r1,150,H,'Game event',['hit · knocked left','weight 0.8'],{stroke:C.player});
  b+=box(560,r1,196,H,'Pattern, in the page',['strength as a function of time','overlaps take the maximum'],{stroke:C.game});
  b+=box(786,r1,150,H,'USB serial',['M 89 0 0 255 0 255'],{stroke:C.dim,mono:true,lineFill:C.agent});
  b+=T(861,r1+64,'about 30 lines a second',{anchor:'middle',size:10.5});
  b+=box(966,r1,110,H,'Arduino',['copies them to','6 PWM pins'],{stroke:C.game});
  b+=arrow([[530,r1+39],[558,r1+39]])+arrow([[756,r1+39],[784,r1+39]])+arrow([[936,r1+39],[964,r1+39]]);
  b+=T(1076,184,'a motor starting from rest gets 25 ms at full power · levels are rescaled onto the range where it turns',{anchor:'end',size:10.5});
  b+=T(1076,200,'400 ms of silence (cable pulled, tab closed) → every motor off',{anchor:'end',size:10.5,fill:C.red});
  b+=T(380,238,'Patterns are functions of time',{size:12.5,weight:700,fill:C.ink})+T(574,238,'strength 0 to 1 · every plot is 1.3 s wide',{size:10.5});
  const on=(t,a,z)=>t>=a&&t<z?1:0;
  const P=[['thud','a light hit',0.15,()=>0.9],['strong','a heavy hit',0.39,t=>on(t,0,0.08)+on(t,0.14,0.39)],['block','you blocked',0.14,t=>on(t,0,0.06)+0.55*on(t,0.1,0.14)],['crit',"an ultimate's last blow",0.98,t=>on(t,0,0.4)+on(t,0.5,0.58)+on(t,0.64,0.72)+on(t,0.78,0.98)],
    ['heal','health coming back',0.8,t=>0.2+0.5*Math.sin(Math.PI*t/0.8)],['heart','their ultimate is coming',0.9,t=>0.75*(on(t,0,0.07)+on(t,0.17,0.24)+on(t,0.66,0.73)+on(t,0.83,0.9))],['quake','the ground shakes',0.45,t=>(1-t/0.45)*(0.55+0.45*Math.sin(t*70))],['ko','you lost the round',1.3,t=>1-0.75*t/1.3]];
  P.forEach(([name,what,dur,fn],i)=>{ const x=380+(i%4)*177.3, y=254+Math.floor(i/4)*112, w=164, ph=50, base=y+78;
    b+=`<rect x="${x}" y="${y}" width="${w}" height="96" rx="9" fill="${C.well}" stroke="${C.dim}" stroke-width="1.1"/>`+T(x+10,y+18,name,{size:11.5,weight:700,fill:C.ink})+T(x+w-10,y+18,what,{anchor:'end',size:9.5});
    let d=`M ${(x+10).toFixed(1)} ${base}`; const pw=w-20;
    for(let k=0;k<=260;k++){ const t=k/260*1.3, v=t<dur?Math.max(0,Math.min(1,fn(t))):0; d+=` L ${(x+10+pw*k/260).toFixed(1)} ${(base-v*ph).toFixed(1)}`; }
    d+=` L ${(x+10+pw).toFixed(1)} ${base} Z`;
    b+=`<path d="${d}" fill="${C.red}" fill-opacity="0.75" stroke="${C.red}" stroke-width="1" stroke-linejoin="round"/><line x1="${x+10}" y1="${base}" x2="${x+10+pw}" y2="${base}" stroke="${C.dim}" stroke-width="1"/>`; });
  doc('headgear.svg',1100,500,'The headgear: from a hit on screen to a buzz on the head','Six vibration motors sit around the head: front, back, left, right and one at each temple. The page turns each game event into a pattern, a function of time, and streams six motor levels to an Arduino about thirty times a second. The board copies them to its pins and switches everything off after 400 milliseconds of silence.',b,[[C.player,'the game'],[C.game,'our code'],[C.red,'motor strength']]);
}
