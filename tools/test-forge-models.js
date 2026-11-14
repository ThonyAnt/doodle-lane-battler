// What real language models wrote from RuleForge's prompt, kept as fixtures: two models (a small and a mid-sized one,
// stand-ins for whichever model the server is pointed at) were each given the exact prompt for eight sets of items and
// answered from the prompt alone. This checks that those answers still read, verify and install. It is not a test of the
// OpenAI model the game uses by default: run tools/forge-live.js with a key for that.   Run: node tools/test-forge-models.js
const fs=require('fs'), path=require('path');
const dir=path.join(__dirname,'fixtures','forge-models'), src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,makeBot,stockItem,MOVES,KINDS,ELS,FORGE_API,FORGE_LIMITS};')();
const FS=require('../forgescript.js'), Forge=require('../forge.js'), SETS=JSON.parse(fs.readFileSync(path.join(dir,'sets.json'),'utf8'));
let bad=0; const ok=(name,cond,info)=>{ if(!cond) bad++; console.log((cond?'ok   ':'FAIL ')+name+(info!==undefined?'  '+JSON.stringify(info):'')); };
(async()=>{
  for(const model of ['haiku','sonnet']){
    let rules=0, pass=0, usable=0, installed=0; const fails=[];
    for(let i=0;i<SETS.length;i++){
      const text=fs.readFileSync(path.join(dir,'reply-'+(i+1)+'-'+model+'.txt'),'utf8'), F=Forge({D,ForgeScript:FS}), rep=F.parseReply(text);
      if(rep.error){ fails.push('set '+(i+1)+': '+rep.error); continue; } usable++;
      for(const r of rep.rules){ rules++; const v=F.verifyRule(r,SETS[i]); if(v.ok) pass++; else fails.push('set '+(i+1)+' '+r.name+': '+v.errors[0]); }
      const out=await Forge({D,ForgeScript:FS,ask:async()=>text}).forgeRules(SETS[i],{budgetMs:9000}); installed+=out.rules.filter(r=>r.source==='ai').length;
    }
    ok(model+': every reply is usable JSON',usable===SETS.length,usable+'/'+SETS.length);
    ok(model+': at least nine rules in ten pass every check (shape, parse, check, scenarios, stress)',rules>=16&&pass>=0.9*rules,{pass,rules,fails:fails.slice(0,4)});
    ok(model+': the pipeline installs the model\'s own rules, not built-in ones',installed>=0.85*rules,{installed,rules});
  }
  console.log(bad?bad+' failed':'all model-fixture tests pass'); process.exit(bad?1:0);
})();
