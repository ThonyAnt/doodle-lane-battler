// Balance bench for Doodle Duel. Runs many rounds of the real rules with no screen and prints win rates.
//   node tools/balance.js bot      the bot against scripted "people" (a masher, a keep-away shooter, a jumper)
//   node tools/balance.js styles   round-robin of the ten weapon styles, bot against bot, equal stats and ink
//   node tools/balance.js items    a sword plus each kind of second item, against a sword alone
//   node tools/balance.js ults     how much of each ultimate's damage actually lands
//   node tools/balance.js flow     round length, comebacks, how much the first hit decides
// Options: --n=200 rounds per pairing, --skill=0.55 bot skill, --file=duel.html, --old=<git ref> to play that version's bot.
// The scripted people are guesses at how people play, and bots are not people: use the numbers to compare, not as truth.
const fs=require('fs'), path=require('path'), cp=require('child_process');
const arg=k=>{ const a=process.argv.find(x=>x.startsWith('--'+k+'=')); return a?a.split('=')[1]:undefined; };
const FILE=arg('file')||path.join(__dirname,'..','duel.html'), N=+(arg('n')||200), SKILL=+(arg('skill')||0.55);
const load=src=>new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,makeBot,stockItem,STOCK,STYLE,MOVES,ULTS,INK,BOT:typeof BOT!=="undefined"?BOT:{}};')();
const D=load(fs.readFileSync(FILE,'utf8'));
const OLD=arg('old')?load(cp.execSync('git show '+arg('old')+':duel.html',{cwd:path.join(__dirname,'..'),maxBuffer:1<<26}).toString()):null;
const KEY={blade:'sword',spear:'spear',hammer:'hammer',fist:'gloves',dual:'twins',bow:'bow',gun:'gun',akimbo:'pistols',staff:'staff',hurl:'star'}, STYLES=Object.keys(KEY);
const spec=(key,o)=>Object.assign(D.stockItem(key,'none').spec,{power:5,range:5,speed:5,traits:['swift'],trait:'swift'},o||{});
const bot=(side,skill,old)=>(old?OLD:D).makeBot(side,()=>skill===undefined?SKILL:skill);

// Scripted "people". Each gets (S, side, dt) every tick and presses buttons through S.setInput like a controller would.
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
// One round. a and b are {items:[spec,spec?], play:(S,side,dt)=>void}. Returns {w:0|1|-1, t, hp:[..], firstHit, lead10}.
function round(a,b,flip,opts){
  const S=D.createDuel(opts&&opts.stage?{stage:opts.stage}:undefined), P=flip?[b,a]:[a,b];
  S.snapW=960;
  P.forEach((p,s)=>p.items.forEach((it,k)=>it&&S.setItem(s,k,it,p.cost||45)));
  S.setReady(0); S.setReady(1);
  let t=0, first=-1, dmgU=[0,0], casts=[0,0], hp=[100,100];
  while(S.wins[0]+S.wins[1]===0&&S.phase!=='over'&&t<95){
    const dt=1/30; t+=dt; P[0].play(S,0,dt); P[1].play(S,1,dt); S.step(dt);
    for(const e of S.events.splice(0)){ if(e.e==='hit'){ if(first<0) first=1-e.side; if(e.ult) dmgU[1-e.side]+=e.d||e.n; } if(e.e==='ult') casts[e.side]++; }
    if(S.phase==='fight') hp=[S.f[0].hp,S.f[1].hp];
  }
  const w=S.wins[0]?0:S.wins[1]?1:-1, un=x=>flip?[x[1],x[0]]:x;
  return {w:w<0?-1:(flip?1-w:w), t, hp:un(hp), first:first<0?-1:(flip?1-first:first), dmgU:un(dmgU), casts:un(casts)};
}
function duel(a,b,n,opts){ let wa=0,wb=0,t=0; const rs=[]; for(let i=0;i<(n||N);i++){ const r=round(a,b,i%2,opts); if(r.w===0) wa++; else if(r.w===1) wb++; t+=r.t; rs.push(r); } return {a:Math.round(100*wa/(n||N)),b:Math.round(100*wb/(n||N)),secs:+(t/(n||N)).toFixed(1),rs}; }
const botP=(items,skill,old)=>{ const bots=[bot(0,skill,old),bot(1,skill,old)]; return {items,play:(S,side,dt)=>bots[side](S,dt)}; };
const personP=(items,kind)=>{ const ps=[person(kind),person(kind)]; return {items,play:(S,side,dt)=>ps[side](S,side,dt)}; };

if(arg('bot')) Object.assign(D.BOT,JSON.parse(arg('bot')));        // e.g. --bot='{"cdBack":0}' to switch one of the bot's habits off
const cmd=process.argv[2]||'bot';
if(cmd==='habits'){           // do simple habits beat each other? scripted people against each other, same weapon
  const out={}; for(const st of STYLES){ const m=spec(KEY[st]); out[st]={'jumper beats masher':duel(personP([m],'jumper'),personP([m],'masher')).a,'kiter beats masher':duel(personP([m],'kiter'),personP([m],'masher')).a,'kiter beats jumper':duel(personP([m],'kiter'),personP([m],'jumper')).a}; }
  console.log('Scripted people against each other with the same weapon: a habit that wins nearly always is a dominant way to play'); console.table(out);
}
if(cmd==='melee'){            // quick look at the melee styles only, against the three scripted people
  const out={}, tot={masher:0,jumper:0,kiter:0}, MS=['blade','spear','hammer','fist','dual'];
  for(const st of MS){ out[st]={}; for(const k of ['masher','jumper','kiter']){ const r=duel(botP([spec(KEY[st])]),personP([spec(KEY[st])],k)); out[st][k]=r.a; tot[k]+=r.a; } }
  console.log(JSON.stringify(D.BOT),'avg',Object.keys(tot).map(k=>k+' '+Math.round(tot[k]/MS.length)).join('  '),' | ',MS.map(st=>st+':'+Object.values(out[st]).join('/')).join(' '));
}
if(cmd==='bot'){
  console.log('Bot win % against scripted people holding the same weapon (rounds per cell: '+N+', bot skill '+SKILL+(OLD?', OLD bot from '+arg('old'):'')+')');
  const out={}; const tot={masher:0,jumper:0,kiter:0};
  for(const st of STYLES){ out[st]={}; for(const k of ['masher','jumper','kiter']){ const r=duel(botP([spec(KEY[st])],SKILL,!!OLD),personP([spec(KEY[st])],k)); out[st][k]=r.a; tot[k]+=r.a; } }
  out.AVERAGE={}; for(const k in tot) out.AVERAGE[k]=Math.round(tot[k]/STYLES.length); console.table(out);
  if(!OLD){ const sk={}; for(const s of [0,0.25,0.55,0.8,1]){ let a=0; for(const st of ['blade','gun','hammer']) a+=duel(botP([spec(KEY[st])],s),personP([spec(KEY[st])],'masher'),Math.round(N/2)).a; sk['skill '+s]={'vs masher':Math.round(a/3)}; } console.log('How the skill setting changes it (sword, gun, hammer averaged)'); console.table(sk); }
}
if(cmd==='versus'){ if(!OLD) throw new Error('needs --old=<git ref>'); const out={}; let tot=0;
  for(const st of STYLES){ const newP=botP([spec(KEY[st])],SKILL), oldBots=[OLD.makeBot(0,()=>SKILL),OLD.makeBot(1,()=>SKILL)], oldP={items:[spec(KEY[st])],play:(S,side,dt)=>oldBots[side](S,dt)}; const r=duel(newP,oldP); out[st]={'new bot wins':r.a,'old bot wins':r.b,secs:r.secs}; tot+=r.a; }
  console.table(out); console.log('new bot average',Math.round(tot/STYLES.length)+'%'); }
if(cmd==='styles'){
  const win={}, games={}, table={}; for(const s of STYLES){ win[s]=0; games[s]=0; }
  for(let i=0;i<STYLES.length;i++) for(let j=i+1;j<STYLES.length;j++){ const a=STYLES[i], b=STYLES[j], r=duel(botP([spec(KEY[a])]),botP([spec(KEY[b])])); win[a]+=r.a; win[b]+=r.b; games[a]+=100; games[b]+=100; (table[a]=table[a]||{})[b]=r.a; }
  console.log('Share of rounds won by each style, bot against bot, equal stats, trait and ink ('+N+' rounds per pairing, skill '+SKILL+')');
  console.log(STYLES.map(s=>s+' '+Math.round(100*win[s]/games[s])+'%').join('   ')); console.table(table);
}
if(cmd==='items'){
  const out={}; for(const k of ['bomb','shield','wings','snack','bow','hammer']){ const r=duel(botP([spec('sword'),spec(k)]),botP([spec('sword')])); out['sword + '+k]={'wins vs sword alone':r.a,secs:r.secs}; }
  console.log('Is a second item worth having? (same ink on the sword both sides)'); console.table(out);
}
if(cmd==='ults'){
  const out={}; for(const st of STYLES){ let cast=0,dmg=0,w=0; const r=duel(botP([spec(KEY[st])]),botP([spec('sword')])); for(const x of r.rs){ cast+=x.casts[0]; dmg+=x.dmgU[0]; } out[st+' ('+((D.ULTS[st]||D.ULTS.blade).name)+')']={casts:cast,'damage per cast':cast?+(dmg/cast).toFixed(1):0,'of 30':cast?Math.round(100*dmg/cast/30)+'%':'-'}; }
  console.log('How much of each ultimate lands when the bot casts it at a bot with a sword'); console.table(out);
}
if(cmd==='flow'){
  let n=0,t=0,firstWin=0,firstN=0,close=0,blow=0; const margins=[];
  for(const a of ['blade','gun','hammer','spear','hurl']) for(const b of ['blade','bow','fist','staff','dual']){ const r=duel(botP([spec(KEY[a])]),botP([spec(KEY[b])]),Math.round(N/4)); for(const x of r.rs){ if(x.w<0) continue; n++; t+=x.t; if(x.first>=0){ firstN++; if(x.first===x.w) firstWin++; } const m=Math.abs(x.hp[0]-x.hp[1]); margins.push(m); if(m<25) close++; if(m>60) blow++; } }
  console.log({rounds:n,'average seconds':+(t/n).toFixed(1),'first hitter wins %':Math.round(100*firstWin/firstN),'close finishes (winner under 25 hp left) %':Math.round(100*close/n),'blowouts (winner over 60 hp left) %':Math.round(100*blow/n)});
}
