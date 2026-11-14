// Forges the match rules for every pair of the ready-made items ahead of time and keeps them in forge-cache.json, so
// that a demo played with ready-made items needs no network for its rules. It asks the real model: it needs the key.
//   node tools/forge-warm.js [--jobs=4] [--els=none]
//     --jobs  how many pairs are forged at once
//     --els   the ink colours to cover, e.g. --els=none,fire (every colour of one item against every colour of the other)
// Each pair is one item per side, as it comes: first trait, no tuning. Pairs already in the file are skipped, and a pair
// for which only built-in rules came out is not kept, so running it again tries those once more.
const {D,Forge,ForgeScript,KEY,MODEL,BASE,file}=require('./forge-env.js')('tools/forge-warm.js');
const arg=k=>{ const a=process.argv.find(x=>x.startsWith('--'+k+'=')); return a?a.split('=')[1]:undefined; };
const jobs=Math.max(1,Math.min(16,+arg('jobs')||4)), els=(arg('els')||'none').split(',').filter(e=>D.ELS.includes(e));
if(!file){ console.error('FORGE_CACHE is empty: there is no file to keep the rules in.'); process.exit(1); }
let save=null;
const F=Forge({D,ForgeScript,ask:Forge.openai({key:KEY,base:BASE,model:MODEL,log:m=>console.error('   '+m)}),onNew:()=>{ if(save&&!save()) console.error('   could not write '+file); }});
save=Forge.keep(F,file);
// The items of a room in which Blue took one ready-made item and Red another, exactly as the server describes them.
function pair(a,ea,b,eb){ const S=D.createDuel(); S.setItem(0,0,D.stockItem(a,ea).spec,45); S.setItem(1,0,D.stockItem(b,eb).spec,45); return F.itemsOf(S); }
const todo=[], keys=Object.keys(D.STOCK), count={ai:0,repaired:0,'built-in':0}; let skipped=0, done=0, onlyBuiltIn=0;
for(const a of keys) for(const ea of els) for(const b of keys) for(const eb of els){ const items=pair(a,ea,b,eb); if(F.known(items)) skipped++; else todo.push({name:items[0][0].name+' vs '+items[1][0].name,items}); }
console.log('Model '+MODEL+'. '+todo.length+' pairs to forge, '+skipped+' already in '+file+'.');
async function worker(){
  for(let job=todo.shift();job;job=todo.shift()){
    const out=await F.forgeRules(job.items); done++;
    for(const r of out.rules) count[r.source]++;
    if(out.rules.every(r=>r.source==='built-in')) onlyBuiltIn++;
    console.log(String(done).padStart(4)+'  '+job.name+': '+out.rules.map(r=>r.name+' ('+r.source+')').join(', ')+'  '+(out.ms/1000).toFixed(1)+' s');
  }
}
Promise.all(Array.from({length:jobs},worker)).then(()=>{
  console.log('Done. Rules written by the model: '+count.ai+', repaired: '+count.repaired+', built-in: '+count['built-in']+'.');
  if(onlyBuiltIn) console.log(onlyBuiltIn+' pair(s) got only built-in rules and were not kept: run this again to try them once more.');
});
