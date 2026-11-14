// Nemesis: INK-OS plays Red itself, and between rounds it studies the human who plays Blue and rebuilds its weapons to
// beat them. A deep agent (LangChain's deepagents) with three sub-agents:
//   scout     reads the numbers of the rounds just played and its long-term file on this player; writes /dossier.md
//             and adds a line to the long-term file (/memories/<player>.md, which outlives the match)
//   armorer   reads the dossier and forges a build: two weapons and, on the main one, abilities it writes as code
//   sparring  plays the build in practice rounds of the real game against a copy of the player (the game's bot with
//             their weapons, their skill and their habits) and reports the win rate
// The kernel sends the build back for one repair when it loses its sparring, then deploys the best build it has seen.
// The machine gets no more than a player can have (nemesis.js checks every build), and the game server checks it again.
//
//   hunt(body, emit, shipped)   body: {player, round, wins, reports, mine, playerItems, current, skill, abilities}
//   emits, one object at a time: {type:"read",player,lines,known}  {type:"plan",todos}  {type:"delegate",to,task}
//       {type:"file",agent,path,did}  {type:"remember",note}  {type:"build",ok,errors,name,items}
//       {type:"spar",winPct,was,rounds,...}  {type:"deploy",build,winPct,was}  {type:"keep",taunt,winPct,was}  {type:"say",text}
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createDeepAgent, FilesystemBackend, CompositeBackend } from 'deepagents';
import { ChatOpenAI } from '@langchain/openai';
import { todoListMiddleware } from 'langchain';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const short=(v,n)=>{ const s=String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim(); return s.length>n?s.slice(0,n-1)+'…':s; };

// The prompts keep to the game's own terms (a cartoon rival countering a play style): the model's provider screens prompts,
// and talk of grudges and files on people gets a run refused.
const KERNEL=`You are INK-OS, a character in the party fighting game Doodle Duel: the cartoon computer the game is set inside. In this match you are the computer-controlled opponent (Red) and the player is Blue. Between rounds you look at how the player played and choose new cartoon weapons that counter their play style. You are a smug but good-natured rival, and it is all in fun.

You do not do the work yourself. You run three sub-agents:
- scout: looks at the numbers of the rounds just played and the game's saved notes on this player's style, and writes /dossier.md
- armorer: reads the dossier and forges your next build (two weapons, with an ability it writes as game script) into /build.json
- sparring: plays that build in practice rounds of the real game against a bot that imitates the player, and reports the win rate

The next round starts when you are done, so be fast: one tool turn per step.
Turn 1: write_todos (four items: "Study the player", "Forge a counter", "Spar against a copy of them", "Deploy"; first in_progress) together with task -> scout, both in the same turn. This is the only time you call write_todos.
Turn 2: task -> armorer, with the habit the scout found in one sentence.
Turn 3: task -> sparring. Its reply starts with the win rate.
Turn 4: if the build wins at least half of its practice rounds, or more than what you hold now, call deploy.
Otherwise: task -> armorer with exactly what the sparring partner said to change (tell it /spar-report.md exists), then task -> sparring again, then deploy whatever happened. One repair round only.
deploy puts the best build you have sparred into your hands. Give each sub-agent a brief of one or two sentences. Never read files yourself. No markdown.`;

const SCOUT=`You are the scout for INK-OS, the computer-controlled opponent (Red) in the party fighting game Doodle Duel; the player is Blue. Everything you need is below: the numbers of the rounds just played, what Red's own weapons did, and the game's saved notes on this player's style. Do not read any files.
In ONE turn call write_file and remember together.
write_file /dossier.md, six short lines, one each:
- Who: the player's play style in one line, by nickname.
- Habits: three, each with its number from the rounds.
- Their weapons: which one does the damage and which one they barely use.
- Opening: the one habit to counter, and why it can be countered.
- My last build: what worked and what did nothing (from Red's own numbers), or "first meeting".
- Counter: the kind of build that answers the habit, in words (which kinds of weapon, what the ability should do). Not JSON.
remember: one line worth knowing the next time Red plays this player: their habit with its number, and what worked against it or did not.
Then reply with one line: the habit to counter, with its number.`;

const ARMORER=`You are the armorer for INK-OS, the computer-controlled opponent (Red) in the party fighting game Doodle Duel; the player is Blue. The rules of what you may build are below: do not read them from a file.
First read /dossier.md (if you were told /spar-report.md exists, read it in the same turn). Then call forge_build with the whole build as JSON text: it checks the build, tests its abilities in practice fights and saves /build.json. If it lists errors, fix them and call forge_build again until it answers OK.
Build to counter the habit in the dossier, not to be strong in general: the two weapons and the ability should each answer something this player does. Red is played by the game's bot, so keep abilities simple and sure to fire.
The taunt is a playful one-line tease shown to the player, by nickname, as the round starts: dry and smug but friendly, quoting one number from the dossier. Never insulting.
Reply with one line saying what you built and why it counters them.`;

const SPARRING=`You are the sparring partner for INK-OS, the computer-controlled opponent (Red) in the party fighting game Doodle Duel; the player is Blue.
Call spar once. It plays /build.json in practice rounds of the real game against a bot that imitates the player (their weapons, skill and habits), and answers with the numbers, the same numbers for what Red holds now, and the dossier. It files them in /spar-report.md. Do not read or write files yourself.
Then reply, with no more tool calls: first "WINS n%" (and what Red's current weapons win), then one line on what is working. If it wins under half, say exactly what the armorer should change: which item, to which base, element, ink, trait or ability, judged from the numbers (a side item that is never used is wasted ink; an ability that never fires is dead).`;

export function makeHunt({NEM,MODEL,here}){
  const memDir=path.join(here,'memory'); fs.mkdirSync(memDir,{recursive:true});
  const slug=name=>short(name,24).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'stranger';
  const known=name=>{ try{ return fs.readFileSync(path.join(memDir,slug(name)+'.md'),'utf8').trim(); }catch(e){ return ''; } };

  async function hunt(body,emit,shipped){
    const player=short(body.player,24)||'stranger', me=slug(player), reports=Array.isArray(body.reports)?body.reports.slice(-3):[], mine=Array.isArray(body.mine)?body.mine.slice(-3):[];
    const memFile=path.join(memDir,me+'.md'), memJson=path.join(memDir,me+'.json'), memory=known(player); let kept={}; try{ kept=JSON.parse(fs.readFileSync(memJson,'utf8')); }catch(e){}
    const n=Math.max(0,Math.min(2,body.abilities|0)), skill=+body.skill>0?+body.skill:0.55, current=Array.isArray(body.current)?body.current.filter(Boolean):[];
    let playerItems=Array.isArray(body.playerItems)?body.playerItems.filter(Boolean):[]; if(!playerItems.length&&Array.isArray(kept.items)) playerItems=kept.items;
    if(!reports.length&&!memory) return {ok:false,skip:true,steps:0};      // a stranger, and nothing seen yet: nothing to build against
    if(!reports.length&&!playerItems.length) return {ok:false,skip:true,steps:0};      // (a player with empty hands can still be studied: they punch; and Red may have lost a weapon)
    const cl=reports.length?NEM.clone(reports,playerItems):{skill:kept.skill||0.55,habit:kept.habit||{},items:playerItems}, lines=reports.length?NEM.read(reports):[];
    if(!body.again) emit({type:'read',player,lines,known:!!memory,round:body.round|0});
    const base=NEM.spar(current,cl,{rounds:40,skill});
    const id=new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)+'-'+crypto.randomBytes(2).toString('hex'), dir=path.join(here,'work',id+'-nemesis'); fs.mkdirSync(dir,{recursive:true});
    const itemLine=it=>it.spec.name+' ('+it.spec.kind+(it.spec.style?', '+it.spec.style:'')+', '+(it.spec.element||'none')+', '+Math.round(it.cost)+' ink'+((it.spec.abilities||[]).length?', abilities: '+it.spec.abilities.map(a=>a.name).join(', '):'')+')';
    const brief=['# The player: '+player,'',reports.length?'## The rounds just played (Blue is the player)':'## No rounds yet this match: work from your file',...lines.map(l=>'- '+l),'',
      '## Round by round (numbers are percent of the round unless named)',JSON.stringify(reports),'',
      '## The player\'s weapons',...playerItems.map(it=>'- '+itemLine(it)),'',
      '## What the machine holds now',...(current.length?current.map(it=>'- '+itemLine(it)):['- nothing: its weapons are gone']),'What it did in those rounds: '+JSON.stringify(mine.map(r=>({round:r.round,won:r.won,hpLeft:r.hpLeft,items:r.items}))),
      'Against a copy of this player it wins '+base.winPct+'% of practice rounds.','',
      '## Score','Blue '+((body.wins||[])[0]|0)+', the machine '+((body.wins||[])[1]|0)+'. Next is round '+(body.round|0)+'.','',
      '## The game\'s saved notes on this player\'s style (/memories/'+me+'.md)',memory||'None: this is a first meeting.'].join('\n');
    fs.writeFileSync(path.join(dir,'scout.md'),brief+'\n');
    const MANUAL=NEM.manual(n);
    const readBuild=()=>{ let raw; try{ raw=JSON.parse(fs.readFileSync(path.join(dir,'build.json'),'utf8')); }catch(e){ return {build:null,errors:['/build.json is missing or is not valid JSON']}; } return NEM.clean(raw,n); };
    let best=null, result=null, steps=0, noted='';

    const remember=tool(async({note})=>{ noted=short(note,200); fs.appendFileSync(memFile,'- '+new Date().toISOString().slice(0,10)+': '+noted+'\n'); emit({type:'remember',note:noted}); return 'Filed in /memories/'+me+'.md.'; },
      {name:'remember',description:'Add one line to the game\'s saved notes on this player\'s style. It is there the next time Red plays them.',schema:z.object({note:z.string().describe('one line: their habit with its number, and what beat them or failed to')})});
    const forge=tool(async({json})=>{
      let raw; try{ raw=JSON.parse(json); }catch(e){ emit({type:'build',ok:false,errors:['not valid JSON']}); return 'ERRORS:\n- that is not valid JSON: '+short(e.message,100); }
      fs.writeFileSync(path.join(dir,'build.json'),JSON.stringify(raw,null,1)); emit({type:'file',agent:'armorer',path:'/build.json',did:'wrote'});
      const c=NEM.clean(raw,n); emit({type:'build',ok:!c.errors.length,errors:c.errors,name:c.build?c.build.name:short(raw&&raw.name,24),items:c.build?c.build.items.map(it=>({name:it.name,base:it.base,element:it.element,ink:it.ink,abilities:it.abilities.map(a=>a.name)})):[]});
      return c.errors.length?'Saved, but it has ERRORS:\n- '+c.errors.join('\n- '):'OK: /build.json is saved, it is a legal build and its abilities fire.';
    },{name:'forge_build',description:'Save the build to /build.json and check it: legal items, ink within the limit, and every ability tested in practice fights. Give the whole build as JSON text. Answers OK or the list of errors.',schema:z.object({json:z.string().describe('the whole build object as JSON text')})});
    const spar=tool(async()=>{
      const c=readBuild(); if(c.errors.length){ emit({type:'build',ok:false,errors:c.errors}); return 'Cannot spar: /build.json has errors:\n- '+c.errors.join('\n- '); }
      const r=NEM.spar(NEM.arm(c.build),cl,{rounds:40,skill});
      if(r.ok&&(!best||r.winPct>best.winPct)) best={build:c.build,winPct:r.winPct};
      emit({type:'spar',ok:r.ok,problems:r.problems,name:c.build.name,winPct:r.winPct,was:base.winPct,rounds:r.rounds,roundSeconds:r.roundSeconds,abilityFiresPerRound:r.abilityFiresPerRound});
      const numbers={thisBuild:r,whatTheMachineHoldsNow:base};
      fs.writeFileSync(path.join(dir,'spar-report.md'),'# Sparring "'+c.build.name+'" against a copy of '+player+'\n\nWins '+r.winPct+'% of '+r.rounds+' rounds (the current weapons win '+base.winPct+'%).'+(r.problems.length?'\n\nProblems:\n- '+r.problems.join('\n- '):'')+'\n\n```json\n'+JSON.stringify(numbers,null,1)+'\n```\n'); emit({type:'file',agent:'sparring',path:'/spar-report.md',did:'wrote'});
      let dossier=''; try{ dossier=fs.readFileSync(path.join(dir,'dossier.md'),'utf8').slice(0,2000); }catch(e){}
      return JSON.stringify(numbers)+'\n\nThe build:\n'+JSON.stringify(c.build)+'\n\nThe dossier (/dossier.md):\n'+dossier;
    },{name:'spar',description:'Play /build.json in practice rounds of the real game against a copy of the player. Returns the win rate and numbers, and the same for what the machine holds now.',schema:z.object({})});
    const ship=()=>{ if(result||!best) return; result=best;
      if(best.winPct+5<base.winPct) emit({type:'keep',taunt:best.build.taunt,winPct:best.winPct,was:base.winPct}); else emit({type:'deploy',build:best.build,winPct:best.winPct,was:base.winPct}); };
    const deploy=tool(async()=>{ if(!best) return 'REFUSED: no build has been sparred yet. Have the sparring partner run spar first.'; ship(); return 'Deployed "'+best.build.name+'" (wins '+best.winPct+'% in practice).'; },
      {name:'deploy',description:'Take the best build sparred so far into the next round.',schema:z.object({})});

    const brain=(effort,timeout)=>new ChatOpenAI({model:MODEL,apiKey:process.env.OPENAI_API_KEY,useResponsesApi:true,reasoning:{effort},timeout,maxRetries:3,...(process.env.OPENAI_BASE_URL?{configuration:{baseURL:process.env.OPENAI_BASE_URL}}:{})});
    const quick=brain(process.env.OS_AGENT_EFFORT||'none',5000), careful=brain(process.env.OS_AGENT_BUILD_EFFORT||'none',12000);
    const agent=createDeepAgent({model:quick,name:'nemesis',systemPrompt:KERNEL,tools:[deploy],middleware:[todoListMiddleware()],
      backend:new CompositeBackend(new FilesystemBackend({rootDir:dir,virtualMode:true}),{'/memories/':new FilesystemBackend({rootDir:memDir,virtualMode:true})}),      // the workspace is thrown away with the match; /memories/ is not
      subagents:[{name:'scout',description:'Studies the player from the rounds just played and the long-term file; writes /dossier.md and files a note for next time.',systemPrompt:SCOUT+'\n\n'+brief,tools:[remember],model:careful},
        {name:'armorer',description:'Forges or repairs the build in /build.json from /dossier.md (and /spar-report.md).',systemPrompt:ARMORER+'\n\n'+MANUAL,tools:[forge],model:careful},
        {name:'sparring',description:'Plays /build.json in practice rounds against a copy of the player and reports the win rate.',systemPrompt:SPARRING,tools:[spar],model:quick}]});

    let who='nemesis', pending='helper', board=null, told=false; const nsWho=new Map(), STEP={scout:0,armorer:1,sparring:2};
    const seen=m=>{
      for(const c of (m&&(m.tool_calls||(m.kwargs&&m.kwargs.tool_calls))||[])){ steps++; const a=c.args||{};
        if(c.name==='write_todos'&&Array.isArray(a.todos)){ board=a.todos.slice(0,8).map(t=>({text:short(t.content,70),status:t.status})); emit({type:'plan',todos:board}); }
        else if(c.name==='task'){ pending=short(a.subagent_type||'helper',20);
          if(board&&board.length===4&&pending in STEP){ const at=STEP[pending]; board=board.map((t,i)=>({text:t.text,status:i<at?'completed':i===at?'in_progress':'pending'})); emit({type:'plan',todos:board}); }
          emit({type:'delegate',to:pending,task:short(a.description,160)}); }
        else if(c.name==='write_file'||c.name==='edit_file') emit({type:'file',agent:who,path:short(a.file_path||a.path,60),did:c.name==='write_file'?'wrote':'edited'});
        else if(c.name==='read_file') emit({type:'file',agent:who,path:short(a.file_path||a.path,60),did:'read'});
      }
    };
    const tell=()=>{ told=true; emit({type:'plan',todos:(board||['Study the player','Forge a counter','Spar against a copy of them','Deploy'].map(text=>({text}))).map(t=>({text:t.text,status:'completed'}))});
      try{ fs.writeFileSync(memJson,JSON.stringify({player,skill:cl.skill,habit:cl.habit,items:playerItems,lastBuild:result.build.name,lastWinPct:result.winPct,seen:new Date().toISOString()})); }catch(e){}
      shipped({ok:true,steps}); };
    const stream=await agent.stream({messages:[{role:'user',content:'Round '+(body.round|0)+' is about to start against '+player+'. '+(reports.length?'The last round is on file.':'No round has been played yet, but you have met before.')+' Turn 1: write_todos and task -> scout together.'}]},{streamMode:'updates',subgraphs:true,recursionLimit:90});
    try{ for await(const chunk of stream){
      if(result&&!told) tell();
      const [ns,update]=Array.isArray(chunk)&&chunk.length===2&&Array.isArray(chunk[0])?chunk:[[],chunk];
      if(!ns.length) who='nemesis'; else{ const k=String(ns[0]); if(!nsWho.has(k)) nsWho.set(k,pending); who=nsWho.get(k); }
      for(const node of Object.values(update||{})){ const msgs=node&&node.messages; if(!msgs) continue; for(const m of Array.isArray(msgs)?msgs:[msgs]) seen(m); }
    } }catch(e){ if(!best&&!result) throw e; console.error('nemesis: the run broke after a build was sparred, shipping it:',e&&e.message); }
    if(!result) ship();      // the studio never called deploy: take the best sparred build anyway
    if(result&&!told) tell();
    return {ok:!!result,steps,dir};
  }
  return {hunt,known};
}
