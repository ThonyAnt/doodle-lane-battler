// InkShop interface and effects, from Alex's prototype (prototype/inkshop-duel.html in al371160/hackprinceton-brainstorming-alex).
// The three blocks between BEGIN/END verbatim markers are copied unchanged from his file. The code around them supplies
// the few names his functions expect (ctx, S, P, $, MENUS, stamp, netMsg) and exposes them to duel.html.
function makeInkShop(INK,ctx){
  'use strict';
  const {PI,TAU,clamp,lerp,rand,sgn,D,pick,densify,T,GLYPH_ICON,HACKS}=INK;
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const S={parts:[],floats:[],time:0,flash:null};
  const P={jelly:.45,stretch:.35,flab:.4,exag:1.15,speed:1,diff:.55,onion:false,rig:false};
  let hackSel=0,tool='fight',inkColor='#111111',MENUS={},hooks={};
  const stamp=n=>{ if(hooks.stamp) hooks.stamp(n); }, netMsg=()=>{ if(hooks.net) hooks.net(); };

/* --- BEGIN verbatim: effects, log, timeline keyframes, toast --- */
function burst(x,y,col,n){for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(80,420);S.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-100,life:rand(.3,.7),max:.7,col,r:rand(1.5,3.5)})}}
function puff(x,y,col,n){for(let i=0;i<n;i++)S.parts.push({x:x+rand(-10,10),y,vx:rand(-120,120),vy:rand(-90,-10),life:.35,max:.35,col,r:rand(2,4),noG:1})}
function spark(x,y,col){for(let i=0;i<6;i++){const a=rand(0,TAU);S.parts.push({x,y,vx:Math.cos(a)*260,vy:Math.sin(a)*260,life:.2,max:.2,col,r:2})}}
function ring(x,y,col){S.parts.push({kind:'ring',x,y,life:.4,max:.4,col})}
function floatT(x,y,text,col,size=12){S.floats.push({x,y,text,col,size,life:1,max:1})}
function log(f,msg){const el=document.createElement('div');el.className=f?f.cls:'sys';el.textContent=(f?f.id+' ':'· ')+msg;const L=$('#log');L.prepend(el);while(L.children.length>40)L.lastChild.remove()}
function keyframe(row){const fr=$('#frames'),k=document.createElement('i');k.className='kf';k.style.left=(Math.floor(S.time*12)%200*9)+'px';k.style.top=(16+row*16)+'px';fr.appendChild(k);
 const ks=fr.querySelectorAll('.kf');if(ks.length>40)ks[0].remove()}
let toastT=0;function toast(m){const t=$('#toast');t.textContent=m;t.style.display='block';toastT=3.2}
/* --- END verbatim --- */

/* --- BEGIN verbatim: drawing helpers --- */
function strokePath(pts){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke()}
function drawLocal(local,color,lw=3){ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineCap='round';ctx.lineJoin='round';for(const s of local)strokePath(s)}
function drawObj(o){ctx.save();if(o.life!==Infinity&&o.life<1.5)ctx.globalAlpha=Math.max(.15,o.life/1.5);
 if(o.kind==='popup'){ctx.fillStyle='#c3c3c3';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.strokeRect(o.x+.5,o.y+.5,o.w-1,o.h-1);
  const gr=ctx.createLinearGradient(o.x,0,o.x+o.w,0);gr.addColorStop(0,'#0a246a');gr.addColorStop(1,'#a6caf0');ctx.fillStyle=gr;ctx.fillRect(o.x+2,o.y+2,o.w-4,13);
  ctx.fillStyle='#fff';ctx.font='bold 9px Tahoma';ctx.fillText('Error',o.x+5,o.y+12);ctx.fillStyle='#d00';ctx.beginPath();ctx.arc(o.x+16,o.y+36,9,0,TAU);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='bold 11px Tahoma';ctx.fillText('✕',o.x+12,o.y+40);ctx.fillStyle='#000';ctx.font='10px Tahoma';ctx.fillText(o.msg,o.x+30,o.y+40);ctx.restore();return}
 ctx.strokeStyle=o.color;ctx.lineWidth=o.life===Infinity?2.4:3;ctx.lineCap='round';ctx.lineJoin='round';
 if(o.dyn){ctx.translate(o.x,o.y);if(o.life===Infinity){ctx.fillStyle='rgba(138,143,153,.12)';ctx.fillRect(0,0,o.w,o.h)}for(const s of o.local)strokePath(s)}else for(const s of o.strokes)strokePath(s);
 if(o.kind==='platform'&&o.life===Infinity){ctx.setLineDash([2,4]);ctx.globalAlpha=.4;ctx.beginPath();ctx.moveTo(o.x,o.y+5);ctx.lineTo(o.x+o.w,o.y+5);ctx.stroke()}ctx.restore()}
function drawGlyphIcon(name,x,y,size,col){const tm=T[name];const all=tm.flat();let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const[a,b]of all){x0=Math.min(x0,a);x1=Math.max(x1,a);y0=Math.min(y0,b);y1=Math.max(y1,b)}
 const sc=size/Math.max(x1-x0,y1-y0,1);ctx.save();ctx.strokeStyle=col;ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';
 for(const s of tm){ctx.beginPath();s.forEach(([a,b],i)=>{const px=x+(a-(x0+x1)/2)*sc,py=y+(b-(y0+y1)/2)*sc;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.stroke()}ctx.restore()}
function drawCursor(x,y,col,label){ctx.save();ctx.translate(x,y);ctx.fillStyle='#fff';ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,17);ctx.lineTo(4.5,13);ctx.lineTo(8,20);ctx.lineTo(10.5,19);ctx.lineTo(7,12);ctx.lineTo(12.5,12);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.font='bold 9px Tahoma';ctx.fillStyle=col;ctx.fillText(label,13,26);ctx.restore()}
function dialog(x,y,w,h,title,col){ctx.fillStyle='#c3c3c3';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+1,y+h);ctx.lineTo(x+1,y+1);ctx.lineTo(x+w,y+1);ctx.stroke();
 ctx.strokeStyle='#404040';ctx.beginPath();ctx.moveTo(x+w-1,y);ctx.lineTo(x+w-1,y+h-1);ctx.lineTo(x,y+h-1);ctx.stroke();
 const gr=ctx.createLinearGradient(x,0,x+w,0);gr.addColorStop(0,col||'#0a246a');gr.addColorStop(1,'#a6caf0');ctx.fillStyle=gr;ctx.fillRect(x+3,y+3,w-6,18);ctx.fillStyle='#fff';ctx.font='bold 11px Tahoma';ctx.textAlign='left';ctx.fillText(title,x+8,y+16)}
function drawGlyphMini(g,name,x,y,size){const tm=T[name];const all=tm.flat();let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const[a,b]of all){x0=Math.min(x0,a);x1=Math.max(x1,a);y0=Math.min(y0,b);y1=Math.max(y1,b)}
 const sc=size/Math.max(x1-x0,y1-y0,1);g.strokeStyle='#111';g.lineWidth=1.6;g.lineCap='round';g.lineJoin='round';
 for(const s of tm){g.beginPath();s.forEach(([a,b],i)=>{const px=x+(a-(x0+x1)/2)*sc,py=y+(b-(y0+y1)/2)*sc;i?g.lineTo(px,py):g.moveTo(px,py)});g.stroke()}}
function shapePts(tool,a,b){if(tool==='line')return densify([a,b],5);
 if(tool==='rect')return densify([{x:a.x,y:a.y},{x:b.x,y:a.y},{x:b.x,y:b.y},{x:a.x,y:b.y},{x:a.x,y:a.y+1}],5);
 const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,rx=Math.abs(b.x-a.x)/2,ry=Math.abs(b.y-a.y)/2,o=[];for(let i=0;i<=40;i++){const t=i/40*TAU;o.push({x:cx+Math.cos(t)*rx,y:cy+Math.sin(t)*ry})}return o}
/* --- END verbatim --- */

/* --- BEGIN verbatim: tools, menus, interface builder --- */
const TOOLS=[['fight','Fight / Hand (F)','F','<path d="M4 2l0 13 3-3 2.5 5 2-1-2.5-5 4.5 0z" fill="#fff" stroke="#000"/>'],
 ['pencil','Pencil (B)','B','<path d="M3 15l2-5 8-8 3 3-8 8z" fill="#fc6" stroke="#000"/><path d="M3 15l2-5 3 3z" fill="#333"/>'],
 ['line','Line (L)','L','<path d="M3 15L15 3" stroke="#000" stroke-width="2"/>'],['rect','Rectangle (R)','R','<rect x="3" y="4" width="12" height="10" fill="none" stroke="#000" stroke-width="1.5"/>'],
 ['ellipse','Ellipse (O)','O','<ellipse cx="9" cy="9" rx="6.5" ry="5" fill="none" stroke="#000" stroke-width="1.5"/>'],
 ['eraser','Eraser — draw ✕ instead','','<path d="M3 12l6-7 6 5-4 5H6z" fill="#f9c" stroke="#000"/>'],['bucket','Paint Bucket — hack-locked','','<path d="M4 8l5-5 5 5-5 6z" fill="#ccc" stroke="#000"/><path d="M14 9c1 2 2 3 1 4" stroke="#36f" stroke-width="2" fill="none"/>'],
 ['transform','Free Transform — via TRANSFORM.exe','','<rect x="4" y="4" width="10" height="10" fill="none" stroke="#000" stroke-dasharray="2 2"/><rect x="2" y="2" width="4" height="4" fill="#000"/><rect x="12" y="12" width="4" height="4" fill="#000"/>']];
function setTool(t){tool=t;$$('.tool').forEach(b=>b.classList.toggle('on',b.dataset.t===t));$('#st-tool').textContent='Tool: '+TOOLS.find(x=>x[0]===t)[1].split(' (')[0]}
function openMenu(el){closeMenu();const m=$('#menu'),items=MENUS[el.dataset.m]();m.innerHTML='';
 for(const it of items){if(it==='-'){m.appendChild(document.createElement('hr'));continue}const[label,sc,fn,dis,chk]=it;const d=document.createElement('div');d.innerHTML=label+(sc?`<small>${sc}</small>`:'');
  if(dis)d.className='dis';if(chk)d.classList.add('chk');d.onmousedown=e=>{e.stopPropagation();if(!dis&&fn)fn();closeMenu()};m.appendChild(d)}
 const r=el.getBoundingClientRect();m.style.left=r.left+'px';m.style.top=r.bottom+'px';m.hidden=false;el.classList.add('open')}
function closeMenu(){$('#menu').hidden=true;$$('.menubar span').forEach(s=>s.classList.remove('open'))}
$$('.menubar span').forEach(s=>{s.addEventListener('mousedown',e=>{e.stopPropagation();s.classList.contains('open')?closeMenu():openMenu(s)});s.addEventListener('mouseenter',()=>{if(!$('#menu').hidden)openMenu(s)})});
function buildUI(){const tb=$('#tools');for(const[t,title,k,svg]of TOOLS){const b=document.createElement('div');b.className='tool'+(['eraser','bucket','transform'].includes(t)?' locked':'');b.dataset.t=t;b.title=title;
  b.innerHTML=`<svg width="18" height="18" viewBox="0 0 18 18">${svg}</svg>`+(k?`<span class="k">${k}</span>`:'');b.onmousedown=e=>{e.stopPropagation();if(b.classList.contains('locked'))toast(title);else setTool(t)};tb.appendChild(b)}
 const cols=['#111111','#7f7f7f','#8a0f19','#b0121f','#e86a10','#e8c210','#2a8a2a','#1aa37a','#1d3fbf','#3a6ee8','#6b2fb3','#c23aa8','#6b4a2a','#2bb3d6',
  '#ffffff','#c3c3c3','#ff7a7a','#ffb36b','#ffe36b','#b6f06b','#7af0b0','#9ad8ff','#a8b8ff','#d6a8ff','#ffa8e0','#e0c8a8','#a0f0f0','#404040'];
 const ce=$('#colors');cols.forEach(c=>{const b=document.createElement('b');b.style.background=c;b.title=c;b.onmousedown=e=>{e.stopPropagation();inkColor=c==='#ffffff'?'#111111':c;$('#cursw').style.background=inkColor;$('#fgsw').style.background=inkColor};ce.appendChild(b)});
 const hk=$('#hacks');HACKS.forEach((h,i)=>{const d=document.createElement('div');d.title=h.desc;d.innerHTML=`<span class="key">${i+1}</span><span>${h.name}</span>`;const c=document.createElement('canvas');c.width=40;c.height=18;c.title='counter glyph';d.appendChild(c);
  d.onmousedown=e=>{e.stopPropagation();hackSel=i};hk.appendChild(d);const g=c.getContext('2d'),k=h.counter==='weapon'?null:GLYPH_ICON[h.counter];
  if(k){drawGlyphMini(g,k,20,9,14)}else{g.font='9px Tahoma';g.fillText('weapon',3,12)}});
 const gl=$('#glyphs');[['platform','platform'],['wall','wall'],['crate','crate·vault'],['pot','pot / shield'],['arrow','dash·fling·link'],['x','erase·disarm'],['null','null any hack'],['lightning','lightning'],
  ['sword','sword'],['spear','spear'],['hammer','hammer'],['mace','mace'],['axe','axe'],['bow','bow'],['shield','○ self = shield']].forEach(([n,l])=>{const d=document.createElement('div');const c=document.createElement('canvas');c.width=50;c.height=34;
  drawGlyphMini(c.getContext('2d'),n,25,17,26);d.appendChild(c);d.appendChild(document.createTextNode(l));d.title='click to stamp';d.onmousedown=e=>{e.stopPropagation();stamp(n)};gl.appendChild(d)});
 for(const k of['jelly','stretch','flab','exag','speed','diff']){const s=$('#s-'+k),v=$('#v-'+k);s.value=P[k];v.textContent=(+P[k]).toFixed(2);s.oninput=()=>{P[k]=+s.value;v.textContent=(+s.value).toFixed(2)}}
 $('#c-onion').onchange=e=>P.onion=e.target.checked;$('#c-rig').onchange=e=>P.rig=e.target.checked;
 $('#net-go').onmousedown=e=>{e.stopPropagation();netMsg()};
 const fr=$('#frames');for(let i=0;i<40;i++){const n=document.createElement('span');n.className='fnum';n.style.left=(i*45+2)+'px';n.textContent=i*5+1;fr.appendChild(n)}
 setTool('fight')}
/* --- END verbatim --- */

  /* The rest is adapted from his step() and render(): the same statements, taking their data from this game. */
  function step(dt){ S.time+=dt;
    for(const p of S.parts){p.life-=dt;if(p.kind)continue;if(!p.noG)p.vy+=900*dt;p.x+=p.vx*dt;p.y+=p.vy*dt}S.parts=S.parts.filter(p=>p.life>0);
    for(const f of S.floats){f.life-=dt;f.y-=28*dt}S.floats=S.floats.filter(f=>f.life>0);
    if(S.flash){S.flash.t-=dt;if(S.flash.t<=0)S.flash=null}
    if(toastT>0){toastT-=dt;if(toastT<=0)$('#toast').style.display='none'} }
  function drawGhosts(){ for(const p of S.parts){if(p.kind==='ghost'){ctx.save();ctx.globalAlpha=p.life/p.max*.6;ctx.strokeStyle=p.col;ctx.lineWidth=3;ctx.setLineDash([4,4]);for(const s of p.strokes)strokePath(s);ctx.restore()}} }
  function drawParts(){ for(const p of S.parts){if(p.kind==='ghost')continue;ctx.save();ctx.globalAlpha=Math.max(0,p.life/p.max);if(p.kind==='ring'){ctx.strokeStyle=p.col;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,(1-p.life/p.max)*70+10,0,TAU);ctx.stroke()}
    else{ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill()}ctx.restore()} }
  function drawFloats(){ for(const f of S.floats){ctx.save();ctx.globalAlpha=Math.min(1,f.life/f.max*1.6);ctx.font=`bold ${f.size}px Tahoma`;ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#fff';ctx.strokeText(f.text,f.x,f.y);ctx.fillStyle=f.col;ctx.fillText(f.text,f.x,f.y);ctx.restore()} }
  function drawFields(fields){ for(const fd of fields){ctx.save();ctx.globalAlpha=fd.life/fd.max*.6;ctx.strokeStyle=fd.col;ctx.lineWidth=2;ctx.setLineDash([10,8]);ctx.lineDashOffset=-S.time*120;
    for(const o of[-22,0,22]){ctx.beginPath();ctx.moveTo(fd.a.x-fd.u.y*o,fd.a.y+fd.u.x*o);ctx.lineTo(fd.b.x-fd.u.y*o,fd.b.y+fd.u.x*o);ctx.stroke()}ctx.restore()} }
  function drawHole(h){ ctx.save();ctx.fillStyle='#1a0d05';ctx.strokeStyle='#f80';ctx.lineWidth=3;ctx.shadowColor='#f60';ctx.shadowBlur=14;ctx.beginPath();
    for(let i=0;i<=14;i++){const a=i/14*TAU,r=48+((i*37)%11)*2.2;const px=h.x+Math.cos(a)*r*.55,py=h.y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    if(Math.random()<.5)S.parts.push({x:h.x+rand(-6,6),y:h.y+rand(-50,50),vx:rand(-40,40),vy:rand(-160,-60),life:.6,max:.6,col:pick(['#f90','#f50','#fc3']),r:rand(2,4),noG:1}) }
  // h = {by,target,name,desc,t,max,counter}; names and cols are per side.
  function drawHack(h,cx,top,names,cols){ const w=330,x=cx-w/2,y=top;dialog(x,y,w,112,'\u26a0 System Alert \u2014 '+names[h.by],h.by===0?'#1d3fbf':'#8a0f19');
    ctx.fillStyle='#000';ctx.font='11px Tahoma';ctx.fillText(`${names[h.by]} is executing ${h.name}`,x+12,y+40);ctx.fillStyle='#555';ctx.font='10px Tahoma';ctx.fillText(h.desc,x+12,y+55);
    ctx.fillStyle='#fff';ctx.fillRect(x+12,y+64,w-24,13);ctx.fillStyle='#0a246a';const prog=1-h.t/h.max;for(let i=0;i<Math.floor(prog*26);i++)ctx.fillRect(x+14+i*11.5,y+66,9,9);
    ctx.fillStyle='#000';ctx.font='bold 11px Tahoma';ctx.fillText(`${names[h.target]}: draw to COUNTER \u2192`,x+12,y+98);ctx.fillStyle='#fff';ctx.fillRect(x+w-92,y+82,36,24);drawGlyphIcon(GLYPH_ICON[h.counter]||'null',x+w-74,y+94,18,cols[h.target]);
    ctx.fillStyle='#000';ctx.font='10px Tahoma';ctx.fillText('or \u2298',x+w-50,y+98) }
  function drawFlash(cx,y){ if(!S.flash) return; const fl=S.flash,a=Math.min(1,fl.t*2.5);ctx.save();ctx.globalAlpha=a;ctx.textAlign='center';ctx.font='bold 46px Impact, "Arial Black", sans-serif';ctx.lineWidth=7;ctx.strokeStyle='#fff';
    ctx.strokeText(fl.text,cx,y);ctx.fillStyle=fl.col;ctx.fillText(fl.text,cx,y);ctx.font='bold 13px Tahoma';ctx.lineWidth=4;ctx.strokeText(fl.sub,cx,y+24);ctx.fillStyle='#000';ctx.fillText(fl.sub,cx,y+24);ctx.restore() }
  function drawCounter(x,y,counter,col){ ctx.save();ctx.globalAlpha=.85;ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(x-16,y-92,32,28);ctx.strokeStyle=col;ctx.strokeRect(x-16,y-92,32,28);
    drawGlyphIcon(GLYPH_ICON[counter]||'null',x,y-78,20,col);ctx.restore() }
  return {S,P,TOOLS,burst,puff,spark,ring,floatT,log,keyframe,toast,step,strokePath,drawLocal,drawObj,drawGlyphIcon,drawCursor,dialog,drawGlyphMini,shapePts,
    setTool,openMenu,closeMenu,buildUI,drawGhosts,drawParts,drawFloats,drawFields,drawHole,drawHack,drawFlash,drawCounter,
    get tool(){return tool}, get color(){return inkColor}, get hackSel(){return hackSel}, set hackSel(v){hackSel=v},
    setMenus(m){MENUS=m}, setHooks(h){hooks=h}};
}
