// Tries RuleForge against the real model, for five sets of items, and prints what came back: how long it took, how
// many times the model was asked, every rule with its code and where it came from, and what the verifier objected to.
// Nothing is kept: each run asks afresh. It needs the key (OPENAI_API_KEY in .env or the environment).
//   node tools/forge-live.js [--raw]        --raw also prints the model's replies as they came
const {D,Forge,ForgeScript,KEY,MODEL,BASE}=require('./forge-env.js')('tools/forge-live.js');
const raw=process.argv.includes('--raw'), it=(name,kind,style,el,trait)=>({name,kind,style:style||'',el:el||'none',trait:trait||''});
const SETS=[
  [[it('Tennis Racket','melee','blade','none','swift'),null],[it('Ball','ranged','hurl','none','bounce'),null]],
  [[it('Umbrella','shield','','none','bubble'),null],[it('Water Gun','ranged','gun','water','flurry'),null]],
  [[it('Magnet','ranged','staff','none','pull'),null],[it('Sword','melee','blade','none','guard'),null]],
  [[it('Frying Pan','melee','hammer','fire','heavy'),null],[it('Egg','bomb','','none','bounce'),null]],
  [[it('Mirror Shield','shield','','none','thorns'),it('Pocket Knife','melee','dual','none','flurry')],[it('Laser','ranged','gun','fire','pierce'),it('Rocket Boots','dash','','none','swift')]]];
(async()=>{
  console.log('RuleForge against '+MODEL+' at '+BASE+'\n');
  let written=0, total=0;
  for(const items of SETS){
    const replies=[], model=Forge.openai({key:KEY,base:BASE,model:MODEL,log:m=>replies.push('(failed) '+m)});
    const F=Forge({D,ForgeScript,ask:(messages,o)=>model(messages,o).then(text=>{ replies.push(text); return text; })});      // a forge of its own: nothing remembered from the last set
    const names=items.map((row,s)=>row.filter(Boolean).map(x=>x.name).join(' + ')).join('  vs  ');
    const t=Date.now(), out=await F.forgeRules(items);
    console.log('=== '+names+' ===');
    console.log('time '+((Date.now()-t)/1000).toFixed(1)+' s, model calls '+out.calls+', rules '+out.rules.length);
    for(const r of out.rules){
      total++; if(r.source!=='built-in') written++;
      console.log('\n  '+r.name+'   ['+r.source+']   '+r.a+' -> '+r.b+', on '+r.on+', every '+r.cooldown+' s');
      console.log('  '+r.blurb);
      console.log('  code: '+r.code);
      const failed=Object.keys(r.checks).filter(k=>!r.checks[k]); if(failed.length) console.log('  checks not passed: '+failed.join(', '));
    }
    if(out.log.length){ console.log('\n  what the verifier (or the pipeline) objected to:'); for(const line of out.log) console.log('   - '+line); }
    else console.log('\n  no errors');
    if(raw) replies.forEach((text,i)=>console.log('\n  reply '+(i+1)+': '+text));
    console.log('');
  }
  console.log(written+' of '+total+' rules were written by the model; the rest are built-in.');
})().catch(e=>{ console.error('forge-live broke: '+(e&&e.stack||e)); process.exit(1); });
