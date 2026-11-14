// Nemesis: INK-OS plays Red itself, and between rounds it studies the human who plays Blue and rebuilds its weapons to
// beat them. A deep agent (LangChain's deepagents) whose two sub-agents work at the same time:
//   scout     reads the numbers of the rounds just played and the saved notes on this player; writes the profile the
//             player is shown when the match is over (/dossier.md) and adds a line to the notes that outlive the match
//             (/memories/<player>.md)
//   armorer   forges a build from the same numbers: two weapons and, on the main one, an ability it writes as code. Its
//             forge_build tool checks the build and at once spars it in practice rounds of the real game against a copy
//             of the player (the game's bot with their weapons, skill and habits). A build that loses is forged again.
// The first build that wins its sparring is in Red's hands at once (the agents finish their notes afterwards), so the
// wait is one planning call and one forging call. The machine gets no more than a player can have (nemesis.js checks
// every build), and the game server checks it again.
//
//   hunt(body, emit)   body: {player, round, wins, reports, mine, playerItems, current, skill, abilities}
//   emits, one object at a time: {type:"read",player,lines,known}  {type:"plan",todos}  {type:"delegate",to,task}
//       {type:"file",agent,path,did}  {type:"dossier",text}  {type:"remember",note}  {type:"build",ok,errors,name,items}
//       {type:"spar",winPct,was,rounds,...}  {type:"deploy",build,winPct,was}  {type:"keep",taunt,winPct,was}
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

You do not do the work yourself. You run two sub-agents, and they work at the same time:
- scout: writes up the player's style from the round's numbers and keeps the game's saved notes on them
- armorer: forges your next build (two weapons, with an ability it writes as game script) and spars it against a bot that imitates the player

The next round is about to start, so be fast.
Turn 1: three tool calls in the SAME turn: write_todos (three items: "Study the player", "Forge and spar a counter", "Deploy"; the first two in_progress), task -> scout, and task -> armorer. Give each a brief of one sentence.
Turn 2: call deploy. Nothing after it.
Never read files yourself. No markdown.`;

const SCOUT=`You are the scout for INK-OS, the computer-controlled opponent (Red) in the party fighting game Doodle Duel; the player is Blue. Everything you need is below: the numbers of the rounds just played, what Red's own weapons did, and the game's saved notes on this player's style. Do not read any files.
In ONE turn call write_file and remember together.
write_file /dossier.md: the player's file, which they are shown when the match is over. Five short lines, dry and a little smug, never insulting:
- Style: how they play, in one line, by nickname.
- Habits: three, each with its number from the rounds.
- Weapons: which one does the damage and which one they barely use.
- Tell: the one habit that gives them away.
- Advice: one line of honest advice for beating Red next time.
remember: one line worth knowing the next time Red plays this player: their habit with its number, and what worked against it or did not.
Then reply with one line.`;

const ARMORER=`You are the armorer for INK-OS, the computer-controlled opponent (Red) in the party fighting game Doodle Duel; the player is Blue. Everything you need is below: the rules of what you may build, then the numbers on this player. Do not read any files.
In your first turn call forge_build with the whole build as JSON text. It checks the build, tests its abilities, and at once plays it in practice rounds of the real game against a bot that imitates the player (their weapons, skill and habits), and answers with the win rate.
- If it lists errors, fix them and call forge_build again.
- If it says the build is good enough, reply with one line and stop.
- If it says the build loses, change what the numbers point at (a side item that is never used is wasted ink; an ability that never fires is dead; a different base or element) and call forge_build once more. Then stop.
Build to counter this player's habits, not to be strong in general: the two weapons and the ability should each answer something they do. Red is played by the game's bot, so keep abilities simple and sure to fire: act every time the moment comes, with no rare condition around it (for example on "hit": status('tether'); say('GOT YOU');). Inside a script, values keep their owner: hit.last, shot.charged, me.hp, Math.abs(n).
The taunt is a playful one-line tease shown to the player, by nickname, as the round starts: dry and smug but friendly, quoting one number from their rounds. Never insulting.`;

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
    let forged=0;
    const ship=()=>{ if(result||!best) return; result=best;
      if(best.winPct+15<base.winPct) emit({type:'keep',taunt:best.build.taunt,winPct:best.winPct,was:base.winPct}); else emit({type:'deploy',build:best.build,winPct:best.winPct,was:base.winPct});
      emit({type:'plan',todos:(board||['Study the player','Forge and spar a counter','Deploy'].map(text=>({text}))).map(t=>({text:t.text,status:'completed'}))});
      try{ fs.writeFileSync(memJson,JSON.stringify({player,skill:cl.skill,habit:cl.habit,items:playerItems,lastBuild:result.build.name,lastWinPct:result.winPct,seen:new Date().toISOString()})); }catch(e){} };
    const forge=tool(async({json})=>{
      if(result) return 'A build is already in Red\'s hands. Reply with one line and stop.';
      let raw; try{ raw=JSON.parse(json); }catch(e){ emit({type:'build',ok:false,errors:['not valid JSON']}); return 'ERRORS:\n- that is not valid JSON: '+short(e.message,100); }
      fs.writeFileSync(path.join(dir,'build.json'),JSON.stringify(raw,null,1)); emit({type:'file',agent:'armorer',path:'/build.json',did:'wrote'});
      const c=NEM.clean(raw,n); emit({type:'build',ok:!c.errors.length,errors:c.errors,name:c.build?c.build.name:short(raw&&raw.name,24),items:c.build?c.build.items.map(it=>({name:it.name,base:it.base,element:it.element,ink:it.ink,abilities:it.abilities.map(a=>a.name)})):[]});
      if(c.errors.length) return 'Saved, but it has ERRORS:\n- '+c.errors.join('\n- ');
      forged++; const r=NEM.spar(NEM.arm(c.build),cl,{rounds:40,skill});
      if(r.ok&&(!best||r.winPct>best.winPct)) best={build:c.build,winPct:r.winPct};
      emit({type:'spar',ok:r.ok,problems:r.problems,name:c.build.name,winPct:r.winPct,was:base.winPct,rounds:r.rounds,roundSeconds:r.roundSeconds,abilityFiresPerRound:r.abilityFiresPerRound});
      fs.writeFileSync(path.join(dir,'spar-report.md'),'# Sparring "'+c.build.name+'" against a copy of '+player+'\n\nWins '+r.winPct+'% of '+r.rounds+' rounds (the current weapons win '+base.winPct+'%).'+(r.problems.length?'\n\nProblems:\n- '+r.problems.join('\n- '):'')+'\n\n```json\n'+JSON.stringify({thisBuild:r,whatRedHoldsNow:base},null,1)+'\n```\n'); emit({type:'file',agent:'armorer',path:'/spar-report.md',did:'wrote'});
      const good=r.ok&&(r.winPct>=50||r.winPct>base.winPct);
      if(good||forged>=2) ship();      // good enough (or the second try): Red has it now, the notes are finished afterwards
      return 'Saved and sparred: it wins '+r.winPct+'% of '+r.rounds+' practice rounds (what Red holds now wins '+base.winPct+'%).'+(r.problems.length?' Problems: '+r.problems.join('; ')+'.':'')+
        (good||forged>=2?' That will do: reply with one line and stop.':' That loses. The numbers: '+JSON.stringify(r)+'. Change the build and call forge_build once more.');
    },{name:'forge_build',description:'Save the build to /build.json, check it (legal items, ink within the limit, abilities tested) and spar it at once against a bot that imitates the player. Give the whole build as JSON text. Answers with errors, or with the win rate.',schema:z.object({json:z.string().describe('the whole build object as JSON text')})});
    const deploy=tool(async()=>{ if(!best) return 'Nothing has been forged yet: Red keeps its weapons.'; ship(); return 'Deployed "'+best.build.name+'" (wins '+best.winPct+'% in practice).'; },
      {name:'deploy',description:'Take the best build forged so far into the next round.',schema:z.object({})});

    // Small, quick models by default: the routing is trivial and the game checks everything that is forged. NEM_MODEL and NEM_BUILD_MODEL pick others.
    const brain=(model,timeout)=>{ const thinks=/^(gpt-5|gpt-6|o\d)/.test(model); return new ChatOpenAI({model,apiKey:process.env.OPENAI_API_KEY,timeout,maxRetries:3,...(thinks?{useResponsesApi:true,reasoning:{effort:'none'}}:{}),...(process.env.OPENAI_BASE_URL?{configuration:{baseURL:process.env.OPENAI_BASE_URL}}:{})}); };
    const quick=brain(process.env.NEM_MODEL||'gpt-5.4-nano',5000), careful=brain(process.env.NEM_BUILD_MODEL||'gpt-5.4-mini',12000);
    const agent=createDeepAgent({model:quick,name:'nemesis',systemPrompt:KERNEL,tools:[deploy],middleware:[todoListMiddleware()],
      backend:new CompositeBackend(new FilesystemBackend({rootDir:dir,virtualMode:true}),{'/memories/':new FilesystemBackend({rootDir:memDir,virtualMode:true})}),      // the workspace is thrown away with the match; /memories/ is not
      subagents:[{name:'scout',description:'Writes up the player\'s style from the rounds just played (/dossier.md) and files a note for next time.',systemPrompt:SCOUT+'\n\n'+brief,tools:[remember],model:careful},
        {name:'armorer',description:'Forges the build in /build.json and spars it against a bot that imitates the player.',systemPrompt:ARMORER+'\n\n'+MANUAL+'\n\n'+brief,tools:[forge],model:careful}]});

    let who='nemesis', pending='helper', board=null; const nsWho=new Map(), queue=[], STEP={scout:0,armorer:1};
    const seen=(m,top)=>{
      for(const c of (m&&(m.tool_calls||(m.kwargs&&m.kwargs.tool_calls))||[])){ steps++; const a=c.args||{};
        if(c.name==='write_todos'&&Array.isArray(a.todos)){ if(!result){ board=a.todos.slice(0,8).map(t=>({text:short(t.content,70),status:t.status})); emit({type:'plan',todos:board}); } }
        else if(c.name==='task'){ const to=short(a.subagent_type||'helper',20); queue.push(to); emit({type:'delegate',to,task:short(a.description,160)}); }
        else if(c.name==='write_file'||c.name==='edit_file'){ const f=short(a.file_path||a.path,60); emit({type:'file',agent:who,path:f,did:c.name==='write_file'?'wrote':'edited'}); if(/dossier\.md$/.test(f)&&typeof a.content==='string') emit({type:'dossier',text:a.content.slice(0,900)}); }
        else if(c.name==='read_file') emit({type:'file',agent:who,path:short(a.file_path||a.path,60),did:'read'});
      }
    };
    // Two sub-agents run at once, so a nested piece of the run is named by what it does first, not by the order it began in.
    const nameOf=(k,m)=>{ if(nsWho.has(k)) return nsWho.get(k); const calls=(m&&(m.tool_calls||(m.kwargs&&m.kwargs.tool_calls))||[]).map(c=>c.name);
      const w=calls.includes('forge_build')?'armorer':calls.includes('remember')||calls.includes('write_file')?'scout':''; if(w) nsWho.set(k,w); return w||'helper'; };
    const stream=await agent.stream({messages:[{role:'user',content:'Round '+(body.round|0)+' is about to start against '+player+'. '+(reports.length?'The last round is on file.':'No round has been played yet, but there are saved notes on them.')+' Turn 1: write_todos, task -> scout and task -> armorer, all in the same turn.'}]},{streamMode:'updates',subgraphs:true,recursionLimit:60});
    try{ for await(const chunk of stream){
      const [ns,update]=Array.isArray(chunk)&&chunk.length===2&&Array.isArray(chunk[0])?chunk:[[],chunk];
      for(const node of Object.values(update||{})){ const msgs=node&&node.messages; if(!msgs) continue; for(const m of Array.isArray(msgs)?msgs:[msgs]){ who=ns.length?nameOf(String(ns[0]),m):'nemesis'; seen(m,!ns.length); } }
    } }catch(e){ if(!best&&!result) throw e; console.error('nemesis: the run broke after a build was sparred, keeping it:',e&&e.message); }
    if(!result) ship();      // nobody called deploy: take the best sparred build anyway
    return {ok:!!result,steps,dir};
  }
  return {hunt,known};
}
