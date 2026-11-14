// Judges a set of trained weights against the shipping bar: N rounds against the classic bot at skill 0.55 and against each
// of the three scripted players, the same random loadout on both sides, sides swapped every round.
//   node bot/eval.js <checkpoint.json | folder of checkpoints> [--n=400] [--skill=0.55] [--save=bot-weights.json]
// Given a folder it takes the checkpoint with the best logged win rate against the classic bot (the newest of equals).
// --save writes the weights as the game loads them: {theta, rules, gen, vsClassic}, vsClassic being the rate measured here.
// It also prints how the CPU wins, since a win by hiding in a corner is no use: how many rounds ended in a knockout, how
// many ran out the clock, and how often it presses a button.
'use strict';
const fs=require('fs'), path=require('path');
const A=require('./arena.js');

const die=msg=>{ console.error(msg); process.exit(1); };
const flags=process.argv.slice(2).filter(a=>a.startsWith('--')), target=process.argv.slice(2).find(a=>!a.startsWith('--'));
for(const a of flags) if(!/^--(n|skill|save)=./.test(a)) die('unknown option '+a+'\nusage: node bot/eval.js <checkpoint.json | folder> [--n=400] [--skill=0.55] [--save=<file>]');
const arg=k=>{ const a=flags.find(x=>x.startsWith('--'+k+'=')); return a?a.slice(k.length+3):undefined; };
const ROUNDS=Math.max(2,Math.round(+(arg('n')||400))), SKILL=arg('skill')===undefined?0.55:+arg('skill'), SAVE=arg('save');
if(!target) die('usage: node bot/eval.js <checkpoint.json | folder of checkpoints> [--n=400] [--skill=0.55] [--save=<file>]');
if(!Number.isFinite(ROUNDS)||!Number.isFinite(SKILL)) die('--n and --skill need numbers');

const read=file=>{ try{ const o=JSON.parse(fs.readFileSync(file,'utf8')); return o&&Array.isArray(o.theta)&&o.theta.length===A.SIZE&&o.theta.every(Number.isFinite)?o:null; }catch(e){ return null; } };
let file=path.resolve(target);
if(!fs.existsSync(file)) die('there is no '+file);
if(fs.statSync(file).isDirectory()){
  let best=null;
  for(const f of fs.readdirSync(file)){ const m=/^gen-(\d+)\.json$/.exec(f); if(!m) continue; const o=read(path.join(file,f)); if(!o||typeof o.vsClassic!=='number') continue;
    if(!best||o.vsClassic>best.o.vsClassic||(o.vsClassic===best.o.vsClassic&&+m[1]>best.g)) best={o,g:+m[1],f}; }
  if(!best) die('no checkpoint in '+file+' has a measured win rate against the classic bot yet (the trainer measures one every tenth generation)');
  console.log('best logged win rate against the classic bot in '+path.relative(process.cwd(),file)+': '+best.f+' ('+Math.round(best.o.vsClassic*100)+'% of the trainer\'s rounds; a best-of-many figure flatters, hence the fresh rounds below)');
  file=path.join(file,best.f);
}
const ck=read(file); if(!ck) die(file+' does not hold '+A.SIZE+' weights');

const BAR={'classic0.55':0.55,masher:0.60,jumper:0.60,kiter:0.60}, pct=v=>Math.round(v*100)+'%', COLS=[13,7,7,7,6,19,19,15,0], row=cells=>cells.map((c,i)=>String(c).padEnd(COLS[i])).join('').trimEnd(), player=A.netPlayer(Float32Array.from(ck.theta),SKILL);
console.log('Trained CPU check: '+path.relative(process.cwd(),file)+(ck.gen?' (generation '+ck.gen+')':''));
if(ck.rules&&ck.rules!==A.RULES) console.log('warning: these weights were trained under different rules ('+ck.rules+'; duel.html is now '+A.RULES+'). They are judged under the rules as they are now.');
console.log(ROUNDS+' rounds against each opponent: the same random loadout on both sides, sides swapped every round, the trained CPU at skill '+SKILL+'.');
console.log(row(['opponent','wins','loses','draws','bar','ended by knockout','ran out the clock','a round lasts','its presses a second (all buttons)']));
const missed=[]; let vsClassic=null, t0=Date.now();
for(const k of Object.keys(BAR)){
  const r=A.evaluate(player,[A.opponent(k)],ROUNDS), win=r.wins/r.rounds, fight=Math.max(1,r.secs-3*r.rounds);       // each round starts with a 3 second countdown
  if(k==='classic0.55') vsClassic=win;
  if(win<BAR[k]) missed.push(k+' by '+((BAR[k]-win)*100).toFixed(1)+' points ('+(win*100).toFixed(1)+'% of '+Math.round(BAR[k]*100)+'%)');
  console.log(row([k,pct(win),pct(r.losses/r.rounds),pct((r.rounds-r.wins-r.losses)/r.rounds),pct(BAR[k]),pct(1-r.timeouts/r.rounds),pct(r.timeouts/r.rounds),(r.secs/r.rounds).toFixed(0)+' s',(r.presses/fight).toFixed(1)]));
}
console.log('shipping bar: '+(missed.length?'MISSED against '+missed.join(', '):'CLEARED (at least 55% against classic0.55 and 60% against each scripted player)')+'   ['+((Date.now()-t0)/1000).toFixed(0)+' s]');
if(SAVE){
  fs.writeFileSync(path.resolve(SAVE),JSON.stringify({theta:ck.theta,rules:ck.rules||A.RULES,gen:ck.gen||0,vsClassic:+vsClassic.toFixed(3)}));
  console.log('saved as '+SAVE+' ({theta, rules, gen, vsClassic}): the game offers "CPU: trained" when this is bot-weights.json next to server.js');
}
