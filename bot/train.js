// Trains the CPU's network by playing it in the headless arena, on several cores, for as long as it is given.
//   node bot/train.js --hours=6 --workers=8 --out=bot/checkpoints
// Every generation it writes <out>/gen-NNNN.json ({gen, theta, fitness, vsClassic, ...}) and adds a row to <out>/log.csv.
// Run the same command again and it carries on from the newest whole checkpoint. Ctrl-C (or a kill, or the lid closing)
// loses at most the generation in progress: a checkpoint is written under a temporary name and renamed when complete.
// Options (defaults): --hours=6  --gens=<no limit>  --workers=8  --out=bot/checkpoints  --pop=64  --rounds=24
//   --sigma=0.1  --lr=0.03  --decay=0.005  --skill=0.55 (the reaction time it trains at)  --seed=<random>
//   --league-every=25  a generation's weights join the league as an opponent this often
//   --league-max=12    at most this many earlier selves in the league (0 = no limit); see leagueGens below
//   --vs-every=10 --vs-rounds=100   how often and over how many rounds the win rate against the classic bot (skill 0.55) is measured
//   --keep=100         a checkpoint older than the newest 100 is deleted unless its win rate against the classic bot was
//                      measured or it is one of the league's generations (0 = keep every one; a night is tens of thousands)
'use strict';
const fs=require('fs'), path=require('path'), os=require('os'), cp=require('child_process');
const {Worker}=require('worker_threads');
const ES=require('./es.js'), A=require('./arena.js');

const KNOWN=['hours','gens','workers','out','pop','rounds','sigma','lr','decay','skill','seed','league-every','league-max','vs-every','vs-rounds','keep'];
const die=msg=>{ console.error(msg); process.exit(2); };
for(const a of process.argv.slice(2)){ const m=/^--([a-z-]+)=(.*)$/.exec(a); if(!m||!KNOWN.includes(m[1])) die('unknown option '+a+'\noptions: '+KNOWN.map(k=>'--'+k+'=').join(' ')); }
const arg=k=>{ const a=process.argv.find(x=>x.startsWith('--'+k+'=')); return a?a.slice(k.length+3):undefined; };
const num=(k,d,min)=>{ const v=arg(k); if(v===undefined) return d; const x=+v; if(v===''||!Number.isFinite(x)||x<(min||0)) die('--'+k+' needs a number'+(min?' of at least '+min:'')); return x; };
const GENS=num('gens',Infinity,1), HOURS=num('hours',arg('gens')===undefined?6:Infinity), WORKERS=Math.round(num('workers',Math.max(1,Math.min(8,os.cpus().length-2)),1));
const OUT=path.resolve(arg('out')||path.join(__dirname,'checkpoints'));
const POP=Math.max(2,2*Math.round(num('pop',64,2)/2)), ROUNDS=Math.round(num('rounds',24,1)), SIGMA=num('sigma',0.1), LR=num('lr',0.03), DECAY=num('decay',0.005), SKILL=num('skill',0.55);
const LEAGUE_EVERY=Math.round(num('league-every',25)), LEAGUE_MAX=Math.round(num('league-max',12)), VS_EVERY=Math.round(num('vs-every',10)), VS_ROUNDS=Math.round(num('vs-rounds',100,1));
const KEEP=Math.round(num('keep',100));
const SEED=num('seed',((Date.now()^(process.pid<<12))>>>0)||1);
const N=A.SIZE, HEADER='gen,secs,best,mean,vsClassic,roundsPerSec', LOG=path.join(OUT,'log.csv');
const CHUNK=Math.max(1,Math.ceil(ROUNDS/3));       // a candidate's rounds go out in three pieces, so no core waits long at the end of a generation
const now=()=>Number(process.hrtime.bigint())/1e9, name=g=>'gen-'+String(g).padStart(4,'0')+'.json';

/* ---------- checkpoints and the log ---------- */
function readCheckpoint(file){
  try{ const o=JSON.parse(fs.readFileSync(file,'utf8')); return o&&Array.isArray(o.theta)&&o.theta.length===N&&o.theta.every(Number.isFinite)&&Number.isInteger(o.gen)&&o.gen>=1?o:null; }
  catch(e){ return null; }
}
// The newest checkpoint that is whole. One cut short (the machine died or slept while it was being written) is passed over.
function newest(){
  const all=fs.readdirSync(OUT).map(f=>/^gen-(\d+)\.json$/.exec(f)).filter(Boolean).map(m=>({g:+m[1],f:m[0]})).sort((a,b)=>b.g-a.g);
  for(const {g,f} of all){ const ck=readCheckpoint(path.join(OUT,f)); if(ck&&ck.gen===g) return ck; console.log('skipping '+f+': it is not a whole checkpoint (the run was cut off while writing it)'); }
  return null;
}
function writeWhole(file,text){ fs.writeFileSync(file+'.tmp',text); fs.renameSync(file+'.tmp',file); }
// Generation g has dropped out of the newest KEEP: delete its checkpoint unless something still needs it (see --keep).
function thin(g){
  const file=path.join(OUT,name(g)), old=readCheckpoint(file);
  if(!old||typeof old.vsClassic==='number'||(LEAGUE_EVERY&&g%LEAGUE_EVERY===0)) return;
  try{ fs.unlinkSync(file); }catch(e){}
}
// Keep the log in step with where we resume: the header, then one row for each generation up to that one.
function mendLog(gen){
  let rows=[]; try{ rows=fs.readFileSync(LOG,'utf8').split('\n'); }catch(e){}
  const keep=new Map(); for(const r of rows){ const c=r.split(','); if(c.length===6&&/^\d+$/.test(c[0])&&+c[0]>=1&&+c[0]<=gen) keep.set(+c[0],r); }
  const text=[HEADER].concat([...keep.keys()].sort((a,b)=>a-b).map(g=>keep.get(g))).join('\n')+'\n';
  if(rows.join('\n')!==text) writeWhole(LOG,text);
}
// Which earlier generations fight in the league. One joins every LEAGUE_EVERY generations. With no limit that is all of
// them; with a limit it is the newest, then 1, 3, 7, 15, ... joiners back, so recent selves and a few old ones stay and
// the six fixed opponents are never crowded out however long the run.
function leagueGens(gen){
  if(!LEAGUE_EVERY) return [];
  const all=[]; for(let g=LEAGUE_EVERY;g<=gen;g+=LEAGUE_EVERY) all.push(g);
  if(!LEAGUE_MAX||all.length<=LEAGUE_MAX) return all;
  const pick=[]; for(let j=0;pick.length<LEAGUE_MAX;j++){ const back=Math.pow(2,j)-1; if(back>=all.length) break; pick.push(all[all.length-1-back]); }
  return pick.reverse();
}

/* ---------- the worker pool ---------- */
function makePool(count,workerData,onFail){
  const ws=[], free=[], queue=[]; let closed=false;
  const pump=()=>{ while(free.length&&queue.length){ const w=free.pop(), job=queue.shift(); w.job=job; w.postMessage(job.msg); } };
  const ready=Promise.all(Array.from({length:count},()=>new Promise(resolve=>{
    const w=new Worker(path.join(__dirname,'worker.js'),{workerData}); ws.push(w);
    w.on('message',m=>{ if(m.t==='ready'){ free.push(w); resolve(); pump(); return; } const job=w.job; w.job=null; free.push(w); job.resolve(m); pump(); });
    w.on('error',e=>{ if(!closed) onFail(e); });
    w.on('exit',code=>{ if(!closed) onFail(new Error('a worker stopped (code '+code+')')); });
  })));
  return {ready,
    run:msg=>new Promise(resolve=>{ queue.push({msg,resolve}); pump(); }),       // one task, on whichever worker is free next
    tell:msg=>{ for(const w of ws) w.postMessage(msg); },                          // to every worker, ahead of any task sent after it
    close:()=>{ closed=true; return Promise.all(ws.map(w=>w.terminate())); }};
}

async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  for(const f of fs.readdirSync(OUT)) if(/\.tmp$/.test(f)) try{ fs.unlinkSync(path.join(OUT,f)); }catch(e){}      // left by a run that was cut off mid-write
  console.log('Doodle Duel CPU trainer: '+N+' weights, population '+POP+' x '+ROUNDS+' rounds, noise '+SIGMA+', learning rate '+LR+', weight decay '+DECAY+', '+WORKERS+' workers, checkpoints in '+OUT);
  const ck=newest();
  let state=ck?{theta:Float32Array.from(ck.theta),gen:ck.gen,seed:Number.isFinite(ck.seed)?ck.seed:SEED}:ES.esInit(N,SEED);
  let secs=ck&&Number.isFinite(ck.secs)?ck.secs:0, played=ck&&Number.isFinite(ck.rounds)?ck.rounds:0;
  if(ck){ console.log('resumed from generation '+ck.gen+' ('+name(ck.gen)+', seed '+state.seed+')'); if(ck.rules&&ck.rules!==A.RULES) console.log('warning: that checkpoint was trained under different rules ('+ck.rules+', now '+A.RULES+'): duel.html has changed since'); }
  else console.log('a new run (seed '+state.seed+')');
  mendLog(state.gen);
  try{ if(process.platform==='darwin'&&/Battery Power/.test(cp.execFileSync('pmset',['-g','batt'],{encoding:'utf8',timeout:2000,stdio:['ignore','pipe','ignore']}))) console.log('warning: this machine is on battery power, so the CPU may be throttled and the run slow'); }catch(e){}

  let stopping=false;
  const bye=code=>process.stdout.write('',()=>process.exit(code));
  const sab=new SharedArrayBuffer(POP*N*4), shared=new Float32Array(sab);
  const pool=makePool(WORKERS,{sab,skill:SKILL},e=>{ if(stopping) return; stopping=true; console.error('training stopped: '+(e&&e.message||e)+'\nthe checkpoints are intact; run the same command to carry on'); process.exit(1); });
  const stop=why=>{ if(stopping) return; stopping=true;
    console.log('stopped ('+why+') during generation '+(state.gen+1)+(state.gen?'; the newest checkpoint is '+name(state.gen):'')+'. Run the same command to carry on.');
    pool.close().then(()=>bye(0),()=>bye(0)); };
  process.on('SIGINT',()=>stop('Ctrl-C')); process.on('SIGTERM',()=>stop('terminated'));
  await pool.ready;

  // the league: the six fixed opponents and some earlier selves, read back from their checkpoints
  const champs=new Map();
  const setLeague=gen=>{
    const want=leagueGens(gen); let changed=false;
    for(const g of [...champs.keys()]) if(!want.includes(g)){ champs.delete(g); changed=true; }
    for(const g of want) if(!champs.has(g)){ const c=g===state.gen?{theta:state.theta}:readCheckpoint(path.join(OUT,name(g)));
      if(c){ champs.set(g,Float32Array.from(c.theta)); changed=true; } else console.log('league: '+name(g)+' is missing or unreadable, so that earlier self sits out'); }
    if(changed) pool.tell({t:'league',thetas:[...champs.keys()].sort((a,b)=>a-b).map(g=>champs.get(g))});
    return changed;
  };
  setLeague(state.gen);
  const leagueSize=()=>A.FIXED.length+champs.size;
  console.log('league: '+A.FIXED.join(', ')+(champs.size?' and its earlier selves from generations '+[...champs.keys()].sort((a,b)=>a-b).join(', '):'')+' ('+leagueSize()+' opponents)');

  // One generation's fights for every candidate. Returns each candidate's mean score and the totals.
  async function score(cands,rounds){
    cands.forEach((c,i)=>shared.set(c,i*N));
    pool.tell({t:'sched',sched:A.schedule(leagueSize(),rounds)});
    const jobs=[]; for(let i=0;i<cands.length;i++) for(let a=0;a<rounds;a+=CHUNK) jobs.push(pool.run({t:'fit',i,a,b:Math.min(rounds,a+CHUNK)}));
    const fit=new Array(cands.length).fill(0), tot={rounds:0,wins:0,timeouts:0,secs:0};
    for(const r of await Promise.all(jobs)){ fit[r.i]+=r.sum/rounds; tot.rounds+=r.rounds; tot.wins+=r.wins; tot.timeouts+=r.timeouts; tot.secs+=r.secs; }
    return {fit,tot};
  }
  // The share of rounds these weights win against the classic bot at skill 0.55 (same loadout both sides, sides swapped every round).
  async function vsClassic(theta){
    const jobs=[]; for(let left=VS_ROUNDS;left>0;left-=10) jobs.push(pool.run({t:'vs',theta,opp:'classic0.55',rounds:Math.min(10,left)}));
    let wins=0, rounds=0; for(const r of await Promise.all(jobs)){ wins+=r.wins; rounds+=r.rounds; }
    return {rate:+(wins/rounds).toFixed(3),rounds};
  }

  // How fast is this machine tonight? The first pass only warms the workers up. Even so this reads low: the code keeps
  // getting faster for the first minute, and rounds get shorter once the network learns to fight. Each generation's own
  // figure is printed and logged.
  { const some=ES.esAsk(state,{pop:POP,sigma:SIGMA}).slice(0,Math.min(POP,2*WORKERS)), k=12;
    await score(some,k); const t0=now(), b=await score(some,k), rps=b.tot.rounds/(now()-t0), gen=POP*ROUNDS/rps;
    console.log('speed: at least '+Math.round(rps)+' rounds/s on '+WORKERS+' workers, measured cold; a generation ('+POP*ROUNDS+' rounds) takes at most '+(gen<10?gen.toFixed(1):Math.round(gen))+' s'+(Number.isFinite(HOURS)?', so '+HOURS+' h is '+Math.round(HOURS*3600/gen)+' generations or more':'')); }

  const started=now(), lastGen=state.gen+GENS; let why='';
  while(!stopping){
    if(state.gen>=lastGen){ why='done: '+GENS+' generation'+(GENS===1?'':'s')+' this run'; break; }
    if(now()-started>=HOURS*3600){ why='time is up ('+HOURS+' h)'; break; }
    const t0=now(), g=state.gen+1;
    const {fit,tot}=await score(ES.esAsk(state,{pop:POP,sigma:SIGMA}),ROUNDS);
    const next=ES.esTell(state,fit,{lr:LR,decay:DECAY,sigma:SIGMA});
    let rounds=tot.rounds, vs=null; if(VS_EVERY&&g%VS_EVERY===0){ const v=await vsClassic(next.theta); vs=v.rate; rounds+=v.rounds; }
    if(stopping) break;
    const dt=now()-t0, best=Math.max(...fit), mean=fit.reduce((a,b)=>a+b,0)/fit.length, rps=rounds/dt;
    secs+=dt; played+=rounds; state=next;
    // the checkpoint first, then the log row: cut off between the two, the row is simply missing
    writeWhole(path.join(OUT,name(g)),JSON.stringify({gen:g,theta:Array.from(state.theta,v=>+v.toPrecision(9)),fitness:+mean.toFixed(4),best:+best.toFixed(4),vsClassic:vs,seed:state.seed,rules:A.RULES,
      secs:+secs.toFixed(1),rounds:played,at:new Date().toISOString(),opts:{pop:POP,rounds:ROUNDS,sigma:SIGMA,lr:LR,decay:DECAY,skill:SKILL,leagueEvery:LEAGUE_EVERY,leagueMax:LEAGUE_MAX}}));
    fs.appendFileSync(LOG,[g,secs.toFixed(1),best.toFixed(4),mean.toFixed(4),vs===null?'':vs,Math.round(rps)].join(',')+'\n');
    if(KEEP&&g>KEEP) thin(g-KEEP);
    console.log('gen '+g+'  best '+best.toFixed(3)+'  mean '+mean.toFixed(3)+(vs===null?'':'  beats classic '+Math.round(vs*100)+'%')+'  '+Math.round(rps)+' rounds/s  rounds last '+(tot.secs/tot.rounds).toFixed(0)+' s, '+Math.round(100*tot.timeouts/tot.rounds)+'% run out the clock');
    if(LEAGUE_EVERY&&g%LEAGUE_EVERY===0&&setLeague(g)) console.log('league: generation '+g+' joins, now '+leagueSize()+' opponents (earlier selves: '+[...champs.keys()].sort((a,b)=>a-b).join(', ')+')');
  }
  if(stopping) return;
  stopping=true;
  console.log(why+'. '+(state.gen?'The newest checkpoint is '+path.join(OUT,name(state.gen))+' ('+(secs/3600).toFixed(2)+' h of training, '+played+' rounds in all).':'Nothing was trained.')+' Run the same command to carry on.');
  await pool.close(); bye(0);
}
main().catch(e=>{ console.error(e&&e.stack||e); process.exit(1); });
