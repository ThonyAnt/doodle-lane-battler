// Abilities: the creativity ladder, the round that waits for them, replay, the runtime breaker and the quick checks
// the server gives a model's answer. No server, no network. Run: node tools/test-abilities.js
const fs=require('fs'), path=require('path'), dir=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(dir,'duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,replayDuel,makeBot,validItem,stockItem,STOCK,KINDS,HP,ABILITY_API,ABILITY_LIMITS,abilityAllowance,abilityClean,abilitiesFit,builtinAbilities,customCatalog,templateOf,templateCall,TEMPLATE_AXES,TEMPLATE_TIPS,abText,localCreativity};')();
const IS=require(path.join(dir,'inkscript.js')), AB=require(path.join(dir,'abilities.js'))({D,InkScript:IS}), compile=AB.compile;
let bad=0; const ok=(name,cond,info)=>{ let c=false; try{ c=typeof cond==='function'?cond():cond; }catch(e){ info=String(e&&e.stack||e).slice(0,300); } if(!c) bad++; console.log((c?'ok   ':'FAIL ')+name+(info!==undefined?'  '+JSON.stringify(info).slice(0,240):'')); };
const sword=()=>{ const s=D.stockItem('sword','none').spec; delete s.creativity; delete s.why; delete s.abilities; return s; };
const run=(S,secs)=>{ for(let i=0;i<Math.round(secs*60);i++) S.step(1/60); };
const EARN={creativity:8,why:'neat',abilities:[{name:'Zap',blurb:'Hits mark the foe.',on:'hit',cooldown:1,code:"status('mark'); say('ZAP');",src:'ai'},{name:'Glow',blurb:'Healing orbs.',block:'lifesteal',src:'ai'}]};

// the ladder
ok('the score buys 0, 1, 2 or 3 abilities',[1,3,4,6,7,8,9,10].map(s=>D.abilityAllowance(s).n).join()==='0,0,1,1,2,2,3,3');
ok('never more than the cap',D.ABILITY_LIMITS.max===3&&D.abilityAllowance(99).n<=3);
ok('a nonsense score counts as a plain drawing',D.abilityAllowance('x').n===0&&D.abilityAllowance(undefined).n===0);
ok('the player\'s name wins as the item\'s name',D.validItem({name:'Sword',kind:'melee',style:'blade'},null,'Fire Cat').name==='Fire Cat');
ok('every special preset has a score, and in a match keeps as many abilities as that score buys',()=>{ const S=D.createDuel({seed:2,compile}); return Object.keys(D.STOCK).filter(k=>D.STOCK[k].fancy).every(k=>{ const sp=D.stockItem(k,'none').spec, it=S.setItem(0,0,sp,45), n=D.abilityAllowance(sp.creativity).n; return sp.creativity>=1&&sp.creativity<=8&&it.abilities.length===Math.min(n,sp.abilities.length)&&n>=1; }); });
ok('an odd name counts for more than a grand one when there is no reader',()=>{ const st=[{el:'none',pts:[[10,10],[60,60]]},{el:'none',pts:[[20,50],[50,20]]}], c=n=>D.localCreativity(st,n).creativity; return c('frog')>c('banana gun')&&c('banana gun')>c('mega fire sword')&&c('mega fire sword')===c('')&&c('Doomblade')===c('sword'); });

// the round waits for abilities
{ const S=D.createDuel({seed:3,record:true,compile}); const a=S.setItem(0,0,Object.assign(sword(),{pending:true}),45); S.setItem(1,0,sword(),45); S.setReady(0); S.setReady(1); run(S,2);
  ok('both ready with one item pending: the round waits',S.phase==='draw'&&S.snapshot().aw===1&&S.snapshot().items[0][0].pd===1);
  const up=S.setEarned(0,0,EARN,a.ver); run(S,0.2);
  ok('the abilities arrive: the weapon is upgraded and the countdown starts',S.phase==='count'&&up&&up.creativity===8&&up.abilities.map(x=>x.name).join()==='Zap,Glow'&&!up.pending&&up.ver!==a.ver);
  ok('the script was compiled for the match',!!(up&&up.abx&&up.abx[0]&&up.abx[0].run));
  run(S,4); ok('and the fight begins',S.phase==='fight');
  ok('a recorded match that waited replays to the same state',D.replayDuel(JSON.parse(JSON.stringify(S.log())),{compile}).hash()===S.hash()); }
{ const S=D.createDuel({seed:4,compile}); const b=S.setItem(0,0,Object.assign(sword(),{pending:true}),45); S.setItem(1,0,sword(),45); S.setReady(0); S.setReady(1); run(S,3); const had=S.items[0][0].abilities.length, v=S.items[0][0].ver;
  S.setEarned(0,0,null,b.ver); run(S,0.2); ok('nothing came: the item keeps what it had and the round starts',S.phase==='count'&&S.items[0][0].abilities.length===had&&S.items[0][0].ver===v); }
{ const S=D.createDuel({seed:5,compile}); S.setItem(0,0,Object.assign(sword(),{pending:true}),45); S.setItem(1,0,sword(),45); S.setReady(0); S.setReady(1); run(S,D.ABILITY_LIMITS.wait-1); const p1=S.phase; run(S,1.5);
  ok('a lost answer cannot hang a match: it starts after the ceiling',p1==='draw'&&S.phase==='count',[p1,S.phase]); }
{ const S=D.createDuel({seed:6,compile}); S.setItem(0,0,sword(),45); S.setItem(1,0,sword(),45); S.setReady(0); S.setReady(1); run(S,0.2); ok('with nothing pending there is no delay',S.phase==='count'&&S.snapshot().aw===undefined); }
{ const S=D.createDuel({seed:7,compile}); const a=S.setItem(0,0,Object.assign(sword(),{pending:true}),45); S.setItem(1,0,sword(),45); run(S,1);
  ok('still drawing: no waiting flag yet',S.phase==='draw'&&S.snapshot().aw===undefined);
  S.setItem(0,0,sword(),45); ok('after a redraw the old drawing\'s earnings are refused',S.setEarned(0,0,EARN,a.ver)===null&&S.items[0][0].creativity!==8); }

// dropped at game time
{ const S=D.createDuel({practice:true,seed:8,compile}); S.setItem(0,0,Object.assign(sword(),{creativity:8,abilities:[{name:'Dud',blurb:'x',on:'attack',cooldown:0.5,code:"grant('no-such-block', 2); say('x');"}]}),45); S.setItem(1,0,sword(),45); S.step(0.05);
  const i={l:0,r:0,d:0,j:0,a:0,b:0,m:0,q:0,h:0,u:0}; for(let t=0;t<600;t++){ if(t%20===0) i.a++; S.setInput(0,i); S.step(1/60); S.snapshot(); }
  const X=S.items[0][0].abx&&S.items[0][0].abx[0]; ok('a script that breaks in the fight is switched off there, and the match stays sound',(!X||X.off||X.fired===0)&&S.sane(),X&&{faults:X.faults,off:!!X.off}); }
ok('code that does not parse compiles to nothing',compile('this is not code (','hit')===null&&compile("eval('1')",'hit')===null&&compile("say('x')",'no-such-moment')===null);

// the quick path a model's answer goes through
{ const item={name:'Fire Cat',kind:'melee',style:'blade',element:'fire'};
  const e=AB.earn(item,EARN); ok('a good answer is kept: score, reason, abilities',!!e&&e.creativity===8&&e.abilities.length===2,e&&{c:e.creativity,n:e.abilities.length});
  const low=AB.earn(item,Object.assign({},EARN,{creativity:2})); ok('a low score keeps no abilities',!!low&&low.abilities.length===0);
  const many=AB.earn(item,{creativity:10,why:'x',abilities:[1,2,3,4,5].map(n=>({name:'Zap'+n,blurb:'b',on:'hit',cooldown:1,code:"status('mark');"}))}); ok('never more than three',!!many&&many.abilities.length<=3);
  const brk=AB.earn(item,{creativity:8,why:'x',abilities:[{name:'Bad',blurb:'b',on:'hit',cooldown:1,code:'window.alert(1)'},EARN.abilities[0]]}); ok('a script that fails the check is not among them',!!brk&&brk.abilities.every(a=>a.name!=='Bad'||!a.code||a.code.indexOf('window')<0));
  ok('junk for an answer does not throw',()=>{ AB.earn(item,null); AB.earn(item,'x'); AB.earn(item,{abilities:'no'}); return true; });
  ok('the prompt quotes the player\'s label and lists the moments',()=>{ const p=AB.earnPrompt(item,'Fire Cat'); return p.indexOf('Fire Cat')>=0&&Object.keys(D.ABILITY_API).every(m=>p.indexOf(m)>=0); }); }
console.log(bad?bad+' failed':'all abilities tests pass'); process.exit(bad?1:0);
