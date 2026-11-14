// INK-OS: the machine Doodle Duel is fought inside, as a deep agent (LangChain's deepagents).
// A player types what they want changed ("make the floor lava"). The agent plans the job, hands the parts to three
// sub-agents (a designer, an engineer, a tester), who pass their work to each other as files in a workspace, play-tests the
// update in headless matches of the real game, and installs it only once the play-test is clean.
//
//   node server.mjs            listens on OS_AGENT_PORT (3130). The game server (duel-server.js) calls it; players never do.
//   POST /run {request, context}   answers with one JSON object per line as the work goes on:
//       {type:"plan",todos}  {type:"delegate",to,task}  {type:"file",agent,path}  {type:"check",ok,errors}
//       {type:"playtest",ok,problems,withUpdate,without,ruleFiresPerRound}  {type:"install",patch}  {type:"say",text}
//       {type:"done",ok,ms,steps}  {type:"error",message}
//
// Nothing the agent writes is trusted: an update is data (settings in fixed ranges, and rules in the game's own small
// language, which the game interprets itself), the tools here check it, and the game server checks it again.
// Needs OPENAI_API_KEY (read from ../.env like the game server). OS_AGENT_MODEL picks the model (default gpt-6-luna).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { ChatOpenAI } from '@langchain/openai';
import { todoListMiddleware } from 'langchain';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const here=path.dirname(fileURLToPath(import.meta.url)), root=path.join(here,'..'), require=createRequire(import.meta.url);
try{ for(const line of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)){ const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line); if(m&&process.env[m[1]]===undefined) process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,''); } }catch(e){}
const PORT=+process.env.OS_AGENT_PORT||3130, MODEL=process.env.OS_AGENT_MODEL||'gpt-6-luna';
if(!process.env.OPENAI_API_KEY){ console.error('INK-OS needs OPENAI_API_KEY (in ../.env or the environment).'); process.exit(1); }

// The game itself: its rules block, the rule language, and the update tools built on them.
const page=fs.readFileSync(path.join(root,'duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(page.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,makeBot,botLoadout,stockItem,MODS,WORLD_TIER,ABILITY_API,ABILITY_LIMITS,HP};')();
const OS=require(path.join(root,'osforge.js'))({D,InkScript:require(path.join(root,'inkscript.js'))});
const MANUAL=OS.manual();

const KERNEL=`You are INK-OS, the operating system of the old computer that the fighting game Doodle Duel runs inside. Players fight on your desktop. One of them has typed a request into your terminal: they want the game changed. You ship that change as an update, fast.

You do not write the update yourself. You run a studio of three sub-agents and you are its producer:
- designer: turns the request into a concrete design and writes it to /design.md
- engineer: turns /design.md into the update file /update.json and makes it pass check_update
- tester: play-tests /update.json in real headless matches and writes /qa-report.md with a verdict

The player is watching your terminal and the plan is the first thing they see. Speed matters: do each step in ONE turn, by calling write_todos and the step's tool together in the same turn.
Turn 1: write_todos (four items: "Design the update", "Build it", "Play-test it", "Install it"; first in_progress) together with task -> designer.
Turn 2: write_todos together with task -> engineer.
Turn 3: write_todos together with task -> tester. The tester's reply starts with PASS or FAIL.
Turn 4 on PASS: write_todos (all completed) together with install_update. Then one short closing line.
On FAIL: task -> engineer with what the tester said must change, then task -> tester again. At most two repair rounds; after that have the engineer cut the part that fails, test once more, and install what works.
install_update refuses anything that has not passed a play-test unchanged, so never call it before a PASS.

Give each sub-agent a brief of one sentence; they already have the request and the manual. Never read files yourself.
An update can only change the settings, world rules and look in the manual. If the player asks for something else (new art, a new weapon, something for one side only), ship the closest thing an update can express; never refuse.
Close with one short line to the player in the dry voice of an operating system, saying what is now installed. It is live at once, so do not say "next round". No markdown.`;

const DESIGNER=`You are the designer in INK-OS's update studio for the fighting game Doodle Duel. The player's request and the manual of everything an update can change are below: do not read any files.
Write /design.md with write_file in one go, short and concrete:
- Request: the player's wish in one line.
- Idea: how it will feel in the fight, in one line. It must be obvious to a watcher within two seconds.
- Look: the floor, weather and tint that tell the story of the change. Always pick one.
- Settings: each mods value you want, with the number. Choose strong numbers, far from 1.
- Rules: each world rule in plain words (when, to whom, what it does, how often, what the shout is). Up to three; none if the settings do the job.
- Limits: anything asked for that an update cannot do, and the closest thing you chose instead.
- For the tester: what should move in the numbers if this works.
Both fighters must be treated alike. A timid update that nobody notices is a failed update. Do not write code or JSON. After the file is written, reply with one line.`;

const ENGINEER=`You are the engineer in INK-OS's update studio for the fighting game Doodle Duel. The manual of everything an update can change is below: do not read it from a file.
First read /design.md (if you were told a /qa-report.md exists, read it in the same turn). Then write the update to /update.json with write_file, exactly in the manual's shape: {"name","notes","mods","rules","look"}. The notes are patch notes for players: short, plain, at most three. look is required.
Rule code is in the manual's small language, not JavaScript: no loops, no functions, no arrays, no backslashes. Keep each rule to a condition and one to three calls.
Then call check_update. If it lists errors, fix /update.json and call it again until it answers OK. Reply with one line saying what you built.`;

const TESTER=`You are the play-tester in INK-OS's update studio for the fighting game Doodle Duel.
In your first turn call playtest and read_file /design.md together. playtest plays the update in headless matches of the real game between two bots, next to the same matches without it, and reports problems and numbers.
Judge the numbers against the design: did what it wanted actually happen (a rule firing, rounds changing length, more time in the air)?
Then write /qa-report.md with write_file:
- Verdict: PASS or FAIL on the first line.
- Numbers: the few that matter, with the normal value beside each.
- Problems: every problem playtest listed, and anything the design promised that the numbers do not show.
- Fix: if FAIL, exactly what the engineer should change (which setting to which number, or which rule and how).
FAIL if playtest lists any problem. Also FAIL an update too timid to notice: every number within about a tenth of normal and no rule doing more than a scratch. Otherwise PASS.
Your reply must start with the word PASS or FAIL, then one line of why (and on FAIL, the fix).`;

let busy=false;
const short=(v,n)=>{ const s=String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim(); return s.length>n?s.slice(0,n-1)+'…':s; };

async function run(body,emit){
  const request=short(body&&body.request,240); if(!request) throw new Error('There is no request.');
  const id=new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)+'-'+crypto.randomBytes(2).toString('hex'), dir=path.join(here,'work',id);
  fs.mkdirSync(path.join(dir,'docs'),{recursive:true});
  fs.writeFileSync(path.join(dir,'docs','manual.md'),MANUAL);
  const ctx=body.context||{}, items=Array.isArray(ctx.items)?ctx.items:[];
  fs.writeFileSync(path.join(dir,'request.md'),['# Request','',request,'','# The match right now','',
    'Stage: '+short(ctx.stage||'desktop',30),
    ...['Blue','Red'].map((n,s)=>n+' holds: '+((items[s]||[]).filter(Boolean).map(it=>short(it.name,24)+' ('+short(it.kind,10)+')').join(', ')||'nothing yet')),
    ctx.installed?'Update installed now: '+short(ctx.installed,40)+' (the new update replaces it)':'No update is installed.'].join('\n')+'\n');
  const readUpdate=()=>{ let raw; try{ raw=JSON.parse(fs.readFileSync(path.join(dir,'update.json'),'utf8')); }catch(e){ return {patch:null,errors:['/update.json is missing or is not valid JSON: '+short(e.message,80)]}; } return OS.clean(raw); };
  const stamp=p=>crypto.createHash('sha1').update(JSON.stringify(p)).digest('hex');
  let tested='', result=null, steps=0;

  const checkUpdate=tool(async()=>{ const c=readUpdate(); emit({type:'check',ok:!c.errors.length,errors:c.errors}); return c.errors.length?'ERRORS:\n- '+c.errors.join('\n- '):'OK: /update.json is a valid update.'; },
    {name:'check_update',description:'Check /update.json: the settings are in range and every rule parses and only uses what the manual allows. Answers OK or the list of errors.',schema:z.object({})});
  const playtest=tool(async({rounds})=>{
    const c=readUpdate(); if(c.errors.length){ emit({type:'check',ok:false,errors:c.errors}); return 'Cannot play-test: /update.json has errors:\n- '+c.errors.join('\n- '); }
    const r=OS.playtest(c.patch,{rounds:rounds||40}); if(r.ok) tested=stamp(c.patch);
    emit({type:'playtest',ok:r.ok,problems:r.problems,withUpdate:r.withUpdate,without:r.without,ruleFiresPerRound:r.ruleFiresPerRound,ms:r.ms});
    return JSON.stringify({problems:r.problems.length?r.problems:'none',withUpdate:r.withUpdate,normalGame:r.without,ruleFiresPerRound:r.ruleFiresPerRound,ruleFiresBlueVsRed:r.ruleFiresBlueRed});
  },{name:'playtest',description:'Play /update.json in headless matches of the real game (two bots, same loadout) and the same matches without it. Returns problems found and numbers: round length, knockouts, time in the air, how often each rule fired.',schema:z.object({rounds:z.number().int().min(10).max(80).optional().describe('how many rounds to play; 40 if left out')})});
  const installUpdate=tool(async()=>{
    const c=readUpdate(); if(c.errors.length) return 'REFUSED: /update.json has errors:\n- '+c.errors.join('\n- ');
    if(stamp(c.patch)!==tested) return 'REFUSED: this exact /update.json has not passed a play-test. Have the tester run playtest on it first.';
    result=c.patch; emit({type:'install',patch:c.patch}); return 'Installed "'+c.patch.name+'". It is live in the match now.';
  },{name:'install_update',description:'Install /update.json into the running game. Only works for an update that has passed a play-test unchanged.',schema:z.object({})});

  // The newer OpenAI models only take tools together with thinking over the Responses API.
  const brain=effort=>new ChatOpenAI({model:MODEL,apiKey:process.env.OPENAI_API_KEY,useResponsesApi:true,reasoning:{effort},timeout:45000,maxRetries:1,...(process.env.OPENAI_BASE_URL?{configuration:{baseURL:process.env.OPENAI_BASE_URL}}:{})});
  const quick=brain(process.env.OS_AGENT_EFFORT||'none'), careful=brain(process.env.OS_AGENT_BUILD_EFFORT||'low'), model=quick;      // routing and testing need no thinking; designing and writing rules get a little
  const brief=fs.readFileSync(path.join(dir,'request.md'),'utf8');
  const agent=createDeepAgent({model,name:'ink-os',systemPrompt:KERNEL,tools:[installUpdate],middleware:[todoListMiddleware()],      // the planning tool (write_todos): this build of deepagents leaves it out for this model
   
    backend:new FilesystemBackend({rootDir:dir,virtualMode:true}),
    subagents:[{name:'designer',description:'Turns the player\'s request into a concrete design in /design.md.',systemPrompt:DESIGNER+'\n\n'+brief+'\n\n'+MANUAL,model:careful},
      {name:'engineer',description:'Builds or repairs /update.json from /design.md (and /qa-report.md) and makes it pass check_update.',systemPrompt:ENGINEER+'\n\n'+MANUAL,tools:[checkUpdate],model:careful},
      {name:'tester',description:'Play-tests /update.json in real headless matches and writes /qa-report.md with a PASS or FAIL verdict.',systemPrompt:TESTER,tools:[playtest],model:quick}]});

  // Follow the agents at work: every tool call they make becomes a line the terminal can show.
  let who='ink-os', pending='helper'; const nsWho=new Map();      // which sub-agent a nested piece of the run belongs to
  const seen=m=>{
    const calls=m&&(m.tool_calls||(m.kwargs&&m.kwargs.tool_calls))||[];
    for(const c of calls){ steps++; const a=c.args||{};
      if(c.name==='write_todos'&&Array.isArray(a.todos)) emit({type:'plan',todos:a.todos.slice(0,8).map(t=>({text:short(t.content,70),status:t.status}))});
      else if(c.name==='task'){ pending=short(a.subagent_type||'helper',20); emit({type:'delegate',to:pending,task:short(a.description,160)}); }
      else if(c.name==='write_file'||c.name==='edit_file') emit({type:'file',agent:who,path:short(a.file_path||a.path,60),did:c.name==='write_file'?'wrote':'edited'});
      else if(c.name==='read_file') emit({type:'file',agent:who,path:short(a.file_path||a.path,60),did:'read'});
    }
  };
  const stream=await agent.stream({messages:[{role:'user',content:'A player typed this into the terminal: "'+request+'". Ship it as an update. Turn 1: write_todos and task -> designer together.'}]},{streamMode:'updates',subgraphs:true,recursionLimit:90});
  let last='';
  for await(const chunk of stream){
    const [ns,update]=Array.isArray(chunk)&&chunk.length===2&&Array.isArray(chunk[0])?chunk:[[],chunk];
    if(process.env.OS_AGENT_DEBUG) console.log('  chunk',JSON.stringify(ns).slice(0,40),Object.keys(update||{}).join(','));
    if(!ns.length) who='ink-os'; else{ const k=String(ns[0]); if(!nsWho.has(k)) nsWho.set(k,pending); who=nsWho.get(k); }
    for(const node of Object.values(update||{})){ const msgs=node&&node.messages; if(!msgs) continue;
      for(const m of Array.isArray(msgs)?msgs:[msgs]){ seen(m); const type=m&&(m.getType?m.getType():m.type); const said=typeof m.content==='string'?m.content:Array.isArray(m.content)?m.content.filter(b=>b&&b.type==='text').map(b=>b.text).join(' '):''; if(!ns.length&&type==='ai'&&said.trim()) last=said.trim(); } }
  }
  if(last) emit({type:'say',text:short(last,220)});
  return {ok:!!result,steps,dir};
}

http.createServer((req,res)=>{
  if(req.method==='GET'&&req.url==='/health'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,model:MODEL,busy})); return; }
  if(req.method!=='POST'||req.url!=='/run'){ res.writeHead(404); res.end(); return; }
  const chunks=[]; req.on('data',c=>chunks.push(c)); req.on('end',async()=>{
    res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-cache'});
    const emit=o=>{ if(!res.writableEnded) res.write(JSON.stringify(o)+'\n'); };
    if(busy){ emit({type:'error',message:'INK-OS is still installing the last update. Try again in a moment.'}); res.end(); return; }
    busy=true; const t0=Date.now(); let body={};
    try{ body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'); }catch(e){}
    const timer=setTimeout(()=>{ emit({type:'error',message:'INK-OS took too long and gave up.'}); emit({type:'done',ok:false,ms:Date.now()-t0}); res.end(); },240000);
    try{ const r=await run(body,emit); emit({type:'done',ok:r.ok,ms:Date.now()-t0,steps:r.steps}); console.log('ink-os',JSON.stringify(String(body.request||'').slice(0,60)),r.ok?'installed':'nothing installed',Date.now()-t0+'ms',r.steps+' steps',path.basename(r.dir)); }
    catch(e){ console.error('ink-os failed:',e&&e.message); emit({type:'error',message:short(e&&e.message||'something went wrong',200)}); emit({type:'done',ok:false,ms:Date.now()-t0}); }
    clearTimeout(timer); busy=false; if(!res.writableEnded) res.end();
  });
}).listen(PORT,'127.0.0.1',()=>console.log('INK-OS (deep agent, '+MODEL+') on http://127.0.0.1:'+PORT));
