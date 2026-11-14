// Tests for RuleForge: the ForgeScript language (parser, checker, interpreter) and the rule engine in the match rules.
// Run: node tools/test-forge.js
const fs=require('fs'), path=require('path');
let bad=0; const ok=(name,cond,info)=>{ if(!cond) bad++; console.log((cond?'ok   ':'FAIL ')+name+(info!==undefined?'  '+JSON.stringify(info):'')); };
const FS=require('../forgescript.js');

{ // 1. the parser
  const good=s=>FS.parse(s).ok, bad=s=>{ const r=FS.parse(s); return !r.ok&&r.errors.length>0&&r.errors[0].line>=1&&r.errors[0].col>=1; };
  ok('parses the racket rule',good("if (shot.speed > 100) { shot.reflect(1.2); say('RETURN!'); }"));
  ok('parses let, const, ternary, compound assignment, mem, comments',good("// tally\nlet k = mem.n > 2 ? 1.5 : 1; mem.n += 1; const d = Math.abs(me.x - foe.x) % 7; if (!(d >= 3) && dist != 0) return;"));
  for(const s of ["while (true) {}","for (;;) {}","function f() {}","(() => 1)();","new Date();","this.x;","me['x'];","`x`;","let a = [1];","let o = {a:1};",
    "mem.n++;","a?.b;","a ?? b;","x = 1, y = 2;","let \\u0061 = 1;","say('a\\nb');","let café = 1;","let x = null;","let y = undefined;","import('fs');","try { } catch (e) { }","/a/.test('a');","let 9x = 1;","say('hi'"])
    ok('rejects: '+s,bad(s));
  ok('says where the error is',(r=>!r.ok&&r.errors[0].line===2&&r.errors[0].col===5)(FS.parse("say('a');\nlet 9x = 1;")));
  ok('enforces the size limits',bad("say('"+'a'.repeat(800)+"');")&&bad('mem.v = '+'1+'.repeat(300)+'1;')&&bad('mem.v = '+'('.repeat(30)+'1'+')'.repeat(30)+';'));
  ok('counts nodes',FS.parse("say('hi');").nodes<=6);
  // beyond the plan
  ok('a line may end with a carriage return and a line feed, and a string may not run over one',good("say('a');\r\nsay('b');")&&bad("say('a\r\nb');")&&bad("say('a\rb');")&&bad("say('a'); // x\rsay('b');"));
  for(const s of ["a--b;","x = 1e5;","x = 0x10;","x = 08;","x = .5;","x = 1.;","x = 1_000;","x = 5n;","let a;","return 1;","a = b = 1;","/* c */ a();","if (a) let b = 1;","f()();","f().x;","('a').length;","a.if;","a => 1;","a ** 2;","a << 1;","a & b;","a | b;","~a;","+a;","a ? b;","a.b.c = 1;","me.x += 1;","$a;","a\u00a0= 1;","{","}","if (a) { say('x'); ","label: a();","a, b;","say('x', );","void 0;","typeof a;","delete mem.n;","a instanceof b;","'a' in mem;","async(1);","await(1);","yield(1);","x = 1 +;","x = (1;","x = 1);","\u2028a();","a\u0000();"])
    ok('rejects: '+JSON.stringify(s).slice(1,-1),bad(s));
  for(const s of ["a - -b;","x = 0.5;","x = 10.25 * 3;","if (a) ; else ;",";;","{ { } }","a ? b : c ? d : e;","!-!a;","a.b.c(1, 2);","x = (a);","say(\"it's\");","say('\u00e9 \u2713'); // \u00fcn\u00efcode","if (a) b(); else if (c) d(); else { e(); }","a && b() || c();","x = a == b != c === d !== e;","x = a < b <= c > d >= e;"])
    ok('parses: '+JSON.stringify(s).slice(1,-1),good(s));
  ok('gives a tree of plain frozen nodes with a place each',(r=>r.ok&&r.ast.t==='prog'&&r.ast.body[0].t==='if'&&r.ast.body[0].then.body[1].e.t==='call'&&r.ast.body[0].then.body[1].line===2&&r.ast.body[0].then.body[1].col===3&&Object.isFrozen(r.ast)&&Object.isFrozen(r.ast.body)&&Object.isFrozen(r.ast.body[0].test))(FS.parse("if (shot.speed > 100) { shot.reflect(1.2);\n  say('RETURN!'); }")));
  ok('800 characters are allowed, 801 are not',good('// '+'x'.repeat(797))&&bad('// '+'x'.repeat(798))&&FS.LIMITS.chars===800&&JSON.stringify(FS.LIMITS)==='{"chars":800,"nodes":250,"depth":24,"locals":12,"mem":8,"fuel":2000}');
  ok('nesting 24 deep is allowed, 25 is not',good('mem.v = '+'('.repeat(24)+'1'+')'.repeat(24)+';')&&bad('mem.v = '+'('.repeat(25)+'1'+')'.repeat(25)+';')&&bad('{'.repeat(25)+'}'.repeat(25))&&bad('mem.v = '+'!'.repeat(25)+'1;'));
  ok('code that is not text is refused, not thrown at',[undefined,null,5,{},['a']].every(v=>{ const r=FS.parse(v); return !r.ok&&r.errors.length===1; }));
}

{ // 2. the checker, against a literal copy of the swat entry of FORGE_API
  const F_FIGHTER={x:'num',y:'num',vx:'num',vy:'num',face:'num',hp:'num',grounded:'bool',attacking:'bool',blocking:'bool',burning:'bool',soaked:'bool',stunned:'bool'};
  const F_ITEM={kind:'str',style:'str',element:'str',power:'num',range:'num',speed:'num'};
  const F_MATH={abs:'fn(num):num',sign:'fn(num):num',floor:'fn(num):num',round:'fn(num):num',sqrt:'fn(num):num',sin:'fn(num):num',cos:'fn(num):num',min:'fn(num,num):num',max:'fn(num,num):num',hypot:'fn(num,num):num'};
  const F_BASE={me:F_FIGHTER,foe:F_FIGHTER,mine:F_ITEM,theirs:F_ITEM,dist:'num',time:'num',mem:'mem',Math:F_MATH,chance:'fn(num):bool',
    push:'fn(who,num,num)',burn:'fn(who,num)',soak:'fn(who,num)',stun:'fn(who,num)',heal:'fn(who,num)',hurt:'fn(who,num)',say:'fn(str)',spark:'fn(num,num)'};
  const F_SHOT={x:'num',y:'num',vx:'num',vy:'num',speed:'num',damage:'num',element:'str',bomb:'bool',reflect:'fn(num)',destroy:'fn()',slow:'fn(num)',turn:'fn(num)',power:'fn(num)'};
  const ENV={...F_BASE,shot:F_SHOT};
  const errs=s=>{ const p=FS.parse(s); return p.ok?FS.check(p.ast,ENV):p.errors; }, clean=s=>errs(s).length===0, rejected=s=>errs(s).length>0;
  ok('accepts the racket rule',clean("if (shot.speed > 100) { shot.reflect(1.2); say('RETURN!'); }"));
  ok('accepts locals, mem and Math',clean("let k = Math.min(mem.n, 3); mem.n = k + 1; push(foe, me.face * 200, 100);"));
  for(const s of ["constructor.constructor('return process')();","me.constructor;","mem.__proto__ = 1;","mem.constructor = 1;","globalThis;","eval('1');","require('fs');","process.exit();",
    "me.x = 5;","shot.reflect.call(shot, 2);","Math.constructor;","Math.random();","say(me);","push(shot, 1, 2);","push(foe, 1);","shot.reflect();","hit.scale(1.2);","dist();","let dist = 1;","undeclared = 1;","const c = 1; c = 2;"])
    ok('rejects: '+s,rejected(s));
  ok('names the unknown thing',/hit/.test(errs("hit.scale(1.2);")[0].msg));
  ok('allows at most 12 locals and 8 mem names',rejected(Array.from({length:13},(_,i)=>'let v'+i+' = 1;').join(' '))&&rejected(Array.from({length:9},(_,i)=>'mem.m'+i+' = 1;').join(' ')));
  // beyond the plan: the checker is the only thing between the model and a rule that faults on its first run
  ok('accepts 12 locals and 8 mem names',clean(Array.from({length:12},(_,i)=>'let v'+i+' = 1;').join(' '))&&clean(Array.from({length:8},(_,i)=>'mem.m'+i+' = 1;').join(' ')));
  ok('accepts the built-in rule bodies',clean("shot.reflect(0.9); say('DEFLECT!');")&&clean("if (me.hp < foe.hp - 40 && chance(0.5)) { heal(me, 2); say('SECOND WIND'); }")
    &&clean("if (foe.attacking) { push(foe, me.face * 260, 120); spark(foe.x, foe.y + 50); say('CLASH!'); }"));
  ok('accepts a call behind && or ?: as a statement, but not as a value',clean("shot.speed > 100 && shot.reflect(1.2); chance(0.5) ? say('A') : say('B');")&&rejected("let a = dist > 1 && say('x');"));
  for(const s of ["say(1);","say('a' + 1);","push(foe, 'far', 1);","let a = -'x';","let a = me;","let a = say;","mem.n = shot;","let a = say('x');","let me = 1;","let a = 1; let a = 2;","{ let a = 1; } a = 2;",
    "if (true) { let a = 1; } say(a);","mem.Big = 1;","mem.n = mem.toString;","mem.waytoolongname1 = 1;","push(me.x, 1, 2);","let foe2 = foe; push(foe2, 1, 2);","mine.kind = 'x';","shot.speed();","burn(foe);","chance();","let a = dist < 'x';","dist = 5;","mem = 1;","Math = 1;"])
    ok('rejects: '+s,rejected(s));
  ok('reports a place for every error',errs("say(1); push(foe, 1);").every(e=>e.line===1&&e.col>=1&&typeof e.msg==='string'));
}

{ // 3. the interpreter
  const run=(s,host,opts)=>{ FS.compile(FS.parse(s).ast,opts)(host); return host; }, faults=(s,host,opts)=>{ try{ run(s,host,opts); return false; }catch(e){ return e.name==='ForgeFault'; } };
  ok('arithmetic and precedence',run("mem.v = 1 + 2 * 3 - 8 / 4 % 3;",{mem:{}}).mem.v===5);
  ok('logic short-circuits',(h=>{ run("false && boom(); true || boom();",h); return h.n===0; })({n:0,boom(){ this.n++; }}));
  ok('== never coerces',run("mem.v = (1 == true) ? 1 : 0;",{mem:{}}).mem.v===0);
  ok('if, else, return and locals',run("let a = 2; if (a > 1) { mem.v = 10; return; } else mem.v = 20; mem.v = 30;",{mem:{}}).mem.v===10);
  ok('who arguments keep their identity',(h=>{ run("push(foe, 1, 2);",h); return h.got===h.foe; })({foe:{x:1},push(w){ this.got=w; }}));
  ok('string plus number is a fault',faults("say('a' + 1);",{say(){}}));
  ok('a missing host value is a fault, not a TypeError',faults("mem.v = shot.speed;",{mem:{}}));
  ok('a host function returning an object is a fault',faults("mem.v = leak();",{mem:{},leak:()=>({})}));
  ok('runs out of fuel',faults("mem.a = 1; mem.b = 2; mem.c = 3; mem.d = 4;",{mem:{}},{fuel:5}));
  ok('mem cannot reach the prototype',(h=>{ run("mem.v = mem.tostring == 1 ? 1 : 2;",h); return h.mem.v===2; })({mem:{}}));
  ok('fast enough',(()=>{ const f=FS.compile(FS.parse(Array.from({length:40},(_,i)=>'mem.a = mem.a + '+i+';').join(' ')).ast), h={mem:{a:0}}, t=Date.now(); for(let i=0;i<1000;i++) f(h); return Date.now()-t<50; })());
  // beyond the plan: the interpreter has to hold whatever the checker lets through, and without the checker at all
  const val=(s,host)=>run('mem.v = '+s+';',Object.assign({mem:{}},host)).mem.v;
  ok('the other operators',val("-3 % 2")===-1&&val("7 / 2")===3.5&&val("!0")===true&&val("'a' + 'b'")==='ab'&&val("2 < 3 == true")===true&&val("1 !== 1")===false&&val("'1' != 1")===true&&val("0 || 5")===5&&val("2 && 3")===3&&val("- -2")===2);
  ok('a compound assignment works on locals and mem',run("let a = 2; a *= 5; a -= 1; mem.v = 4; mem.v /= 2; mem.v += a;",{mem:{}}).mem.v===11);
  ok('a call as a value, and behind && as a statement',(h=>{ run("mem.v = Math.max(1, twice(4)); mem.v > 7 && note('hi'); chance(1) ? note('yes') : note('no');",h); return h.mem.v===8&&h.said.join()==='hi,yes'; })
    ({mem:{},said:[],Math:{max:Math.max},twice:v=>v*2,chance:()=>true,note(s){ this.said.push(s); }}));
  ok('a member function is called on its own object',(h=>{ run("shot.reflect(1.2);",h); return h.shot.got===1.2; })({shot:{reflect(f){ this.got=f; }}}));
  ok('a block ends its locals',faults("{ let a = 1; } mem.v = a;",{mem:{}})&&run("{ let a = 1; } { let a = 2; mem.v = a; }",{mem:{}}).mem.v===2);
  for(const [s,h] of [["mem.v = me;",{mem:{},me:{x:1}}],["mem.v = say;",{mem:{},say(){}}],["mem.v = say('x');",{mem:{},say(){}}],["say(shot);",{say(){},shot:{}}],["say(mem);",{say(){},mem:{}}],["push(Math, 1);",{push(){},Math:{}}],
    ["mem.v = 1 + true;",{mem:{}}],["mem.v = -'a';",{mem:{}}],["mem.v = 'a' < 'b';",{mem:{}}],["dist();",{dist:5}],["me.x();",{me:{x:1}}],["mem.v = me.y;",{mem:{},me:{x:1}}],["mem.v = me.x.y;",{mem:{},me:{x:1}}],
    ["mem.v = me.tostring;",{mem:{},me:{}}],["mem.v = say.name;",{mem:{},say(){}}],["mem.v = say.length;",{mem:{},say(){}}],["mem.v = list.length;",{mem:{},list:[1,2]}],["a = 1;",{}],["const c = 1; c = 2;",{}],["let a = 1; let a = 2;",{}],["let dist = 1;",{dist:5}],
    ["mem.Big = 1;",{mem:{}}],["mem.v = 1;",{}],["mem.v = 1;",{mem:5}],["mem.v = mem.w;",{mem:{w:{}}}],["boom();",{boom(){ throw new TypeError('x'); }}],["mem.v = leak();",{mem:{},leak:()=>null}],["mem.v = leak();",{mem:{},leak:()=>[1]}],["mem.v = leak();",{mem:{},leak:()=>()=>1}],
    ["mem.a = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; mem.a += mem.a; mem.a += mem.a;",{mem:{}}]])
    ok('a fault: '+s.slice(0,40),faults(s,h));
  ok('mem takes 8 names and no more',run(Array.from({length:8},(_,i)=>'mem.m'+i+' = 1;').join(' '),{mem:{}}).mem.m7===1&&faults("mem.i = 1;",{mem:{a:1,b:1,c:1,d:1,e:1,f:1,g:1,h:1}}));
  ok('nothing but a ForgeFault ever comes out',[null,undefined,5,'x'].every(h=>{ try{ FS.compile(FS.parse("say('x');").ast)(h); }catch(e){ return e instanceof FS.Fault&&e instanceof Error&&e.name==='ForgeFault'; } })
    &&[null,{},{t:'prog'},{t:'prog',body:[{t:'what'}]},{t:'prog',body:[{t:'expr',e:{t:'dot',obj:{t:'name',name:'me'},prop:'constructor'}}]}].every(a=>{ try{ FS.compile(a)({me:{}}); }catch(e){ return e.name==='ForgeFault'; } }));
  ok('a tree that loops back on itself runs out of fuel',(()=>{ const loop={t:'block',body:[]}; loop.body.push(loop,loop); try{ FS.compile({t:'prog',body:[loop]})({}); }catch(e){ return e.name==='ForgeFault'; } })());
  ok('host objects cannot be reached through their prototype',(()=>{ const h={mem:{},me:Object.create({secret:42})}; return faults("mem.v = me.secret;",h)&&faults("mem.v = me.hasOwnProperty;",h)&&faults("me.valueOf();",h); })());
  ok('only me and foe pass as themselves, and only as bare names',(h=>{ run("push(me, 1); push(foe, 2);",h); return h.got.length===2&&h.got[0]===h.me&&h.got[1]===h.foe; })({me:{x:1},foe:{x:2},got:[],push(w){ this.got.push(w); }})
    &&faults("let foe = 1; push(foe, 1);",{foe:{x:1},push(){}})&&faults("push(me, 1);",{me:5,push(w){ if(typeof w!=='object') throw new Error('not a fighter'); }}));
}

// ---- the rule engine in the match rules ----
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,INK,boardCells,MOVES,FORGE_API,FORGE_LIMITS};')();
const HP0=D.createDuel({practice:true}).f[0].hp;
const run=(S,sec)=>{ for(let i=0;i<Math.round(sec*60);i++) S.step(1/60); };
const inp=(S,side,o)=>{ S._i=S._i||[{l:0,r:0,d:0,j:0,a:0,b:0,m:0,q:0,h:0},{l:0,r:0,d:0,j:0,a:0,b:0,m:0,q:0,h:0}]; Object.assign(S._i[side],o); S.setInput(side,S._i[side]); };
const press=(S,side)=>inp(S,side,{a:(S._i?S._i[side].a:0)+1});        // one press of that side's first item
const SWORD={kind:'melee',style:'blade',element:'none',name:'Sword'}, BALL={kind:'ranged',style:'hurl',element:'none',name:'Ball'}, SHIELD={kind:'shield',style:'',element:'none',name:'Shield'};
// A practice sim with Blue holding aSpec in slot 0 and Red holding bSpec in slot 0, standing 60 px apart.
// Two things are pinned so that the tests measure rules and nothing else: every item gets the Swift trait (left to its
// name, 'Sword' gets Lucky, which doubles one hit in six, and 'Ball' gets Boomerang), and the pair stands near the
// right-hand wall, so a rule that shoves Red away cannot push them out of reach of `near`.
const BLUE_X=720, plain=spec=>Object.assign({traits:['swift'],trait:'swift'},spec);
function place(S,gap){ const a=S.f[0], b=S.f[1]; Object.assign(a,{x:BLUE_X,y:0,vx:0,vy:0,face:1,ground:true}); Object.assign(b,{x:BLUE_X+gap,y:0,vx:0,vy:0,face:-1,ground:true}); }
function duo(aSpec,bSpec){ const S=D.createDuel({practice:true}); S.setItem(0,0,plain(aSpec),45); S.setItem(1,0,plain(bSpec),45); S.step(1/60); S.snapshot(); place(S,60); return S; }
// Blue's attack once, from 60 px: steps until Red loses health, then on until Blue's move has ended, Red is no longer
// stunned and Blue's item is ready again, so every call is the first move of a combo. Returns what the blow took.
function blueHits(S){
  const a=S.f[0], b=S.f[1]; place(S,60); const hp=b.hp; let d=0;
  press(S,0);
  for(let i=0;i<240&&!d;i++){ S.step(1/120); d=hp-b.hp; }
  for(let i=0;i<360&&(a.act||b.hurt>0||b.stun>0||a.cd[0]>0||S.stop>0);i++) S.step(1/120);
  run(S,0.3); return d;
}

{ // 4. rules in the sim: the strike event, cooldown, budgets, the fault breaker
  const base=blueHits(duo(SWORD,SWORD));
  ok('the test fighters land one clean blow a call',base>3&&base<12&&Math.abs(blueHits(duo(SWORD,SWORD))-base)<1e-9,base);
  { const S=duo(SWORD,SWORD); let seen=0; const id=S.addRule({name:'T',blurb:'',a:[0,0],b:[1,0],on:'strike',cooldown:0.5,run:h=>{ seen=h.hit.damage; h.hit.scale(5); }});
    const d=blueHits(S); ok('a strike rule scales the hit, clamped to 1.4x',id===1&&seen>0&&Math.abs(d/base-1.4)<0.02,{base,d});
    ok('firing emits a rule event',S.snapshot().ev.some(e=>e.e==='rule'&&e.id===1&&e.side===0)); }
  { const S=duo(SWORD,SWORD); let runs=0; S.addRule({name:'T',blurb:'',a:[0,1],b:[1,0],on:'strike',cooldown:0.5,run:()=>{ runs++; }}); blueHits(S); ok('a rule for an item that is not held does not run',runs===0); }
  { const S=duo(SWORD,SWORD); let runs=0; S.addRule({name:'T',blurb:'',a:[0,0],b:[1,0],on:'strike',cooldown:5,run:h=>{ runs++; h.say('X'); }}); blueHits(S); blueHits(S); ok('cooldown holds the rule back',runs===1); }
  { const S=duo(SWORD,SWORD); let runs=0; S.addRule({name:'T',blurb:'',a:[0,0],b:[1,0],on:'strike',cooldown:0.25,run:()=>{ runs++; }}); blueHits(S); blueHits(S); ok('a run with no effect does not start the cooldown',runs===2); }
  { const S=duo(SWORD,SWORD); S.addRule({name:'T',blurb:'',a:[0,0],b:[1,0],on:'strike',cooldown:0.25,run:()=>{ throw new Error('x'); }}); for(let i=0;i<5;i++) blueHits(S);
    ok('three faults switch a rule off and the sim carries on',S.rules[0].off===true&&S.rules[0].faults===3&&S.sane()); }
  { const S=duo(SWORD,SWORD); S.addRule({name:'T',blurb:'',a:[0,0],b:[1,0],on:'strike',cooldown:0.25,run:h=>{ for(let i=0;i<10;i++) h.hurt(h.foe,8); }}); let extra=0; for(let i=0;i<6;i++) extra+=blueHits(S)-base;
    ok('hurt is capped per call and by the 24 hp round budget',extra>23&&extra<25,extra); }
  ok('the capability table lists the four events',Object.keys(D.FORGE_API).join()==='swat,guard,strike,near'&&D.FORGE_LIMITS.hpBudget===24);
  // beyond the plan
  const rule=(o,fn)=>Object.assign({name:'T',blurb:'',a:[0,0],b:[1,0],on:'strike',cooldown:0.25,run:fn||(()=>{})},o);
  { const S=duo(SWORD,SWORD), n=S.rules.length;
    ok('a rule that is not a rule is refused',[null,{},rule({run:'code'}),rule({on:'toString'}),rule({on:'shoot'}),rule({a:[0,0],b:[0,1]}),rule({a:[2,0]}),rule({a:'blue.0'}),rule({b:[1,2]})].every(r=>S.addRule(r)===0)&&S.rules.length===n);
    ok('ids count from 1, also after the rules are cleared',S.addRule(rule())===1&&S.addRule(rule())===2&&(S.clearRules(),S.rules.length===0)&&S.addRule(rule())===1&&S.rules[0].id===1);
    ok('the cooldown is kept between 0.25 and 5 seconds',[[0,0.25],[-3,0.25],[99,5],[1/0,1],['soon',1],[2,2]].every(([c,want])=>{ S.clearRules(); S.addRule(rule({cooldown:c})); return S.rules[0].cooldown===want; })); }
  { const S=duo(SWORD,SWORD); let host=null; S.addRule(rule({},h=>{ host=h; })); blueHits(S);
    const shape=(h,api)=>Object.keys(api).every(k=>{ const want=api[k], v=h[k]; return typeof want==='object'?v&&typeof v==='object'&&shape(v,want):want==='mem'?v&&typeof v==='object':want.startsWith('fn')?typeof v==='function':typeof v===({num:'number',bool:'boolean',str:'string'})[want]; });
    ok('the host of a strike has the values FORGE_API promises',!!host&&['me','foe','mine','theirs','dist','time','mem','Math','chance','hurt','say','hit'].every(k=>k in host)&&shape({me:host.me,foe:host.foe,mine:host.mine,theirs:host.theirs,dist:host.dist,time:host.time,mem:host.mem,Math:host.Math},
      {me:D.FORGE_API.strike.me,foe:D.FORGE_API.strike.foe,mine:D.FORGE_API.strike.mine,theirs:D.FORGE_API.strike.theirs,dist:'num',time:'num',mem:'mem',Math:D.FORGE_API.strike.Math}),host&&Object.keys(host));
    ok('and they describe the fight',!!host&&host.me.face===1&&host.foe.x>host.me.x&&Math.abs(host.dist-(host.foe.x-host.me.x))<1&&host.me.attacking===true&&host.foe.hp===HP0&&host.mine.kind==='melee'&&host.mine.style==='blade'&&host.theirs.element==='none'&&Math.abs(host.hit.damage-base)<1e-9,host&&host.me); }
  { const S=duo(SWORD,SWORD); let runs=0; S.addRule(rule({},()=>{ runs++; }));
    const a=S.f[0], b=S.f[1]; S.snapshot(); place(S,60); b.vx=1400; b.flung=0.8; b.flungBy=0; run(S,1.5); const slam=runs; place(S,60); a.od=100; S.startUlt(0); run(S,4); const hits=S.snapshot().ev.filter(e=>e.e==='hit'&&e.side===1);
    ok('a slam and an ultimate are not strikes',slam===0&&runs===0&&hits.some(e=>e.hap==='slam')&&hits.some(e=>e.ult===1),{slam,runs,hits:hits.length}); }
  { const S=duo(SWORD,SWORD); S.setItem(1,1,plain(BALL),30); let runs=0; S.addRule(rule({},()=>{ runs++; })); S.f[1].held=1; blueHits(S); const other=runs; S.f[1].held=0; blueHits(S);
    ok('a strike rule needs the foe to hold item b',other===0&&runs===1,{other,runs}); }
  { // in the middle of the arena: a bomb thrown from near the wall flies out of it
    const got={}; for(const [name,spec,gap] of [['gun',{kind:'ranged',style:'gun',element:'none',name:'Gun'},200],['ball',BALL,200],['bomb',{kind:'bomb',style:'',element:'none',name:'Bomb'},250],['dash',{kind:'dash',style:'',element:'none',name:'Rocket'},120],['shield',SHIELD,60],['heal',{kind:'heal',style:'',element:'none',name:'Apple'},60]]){
      const S=duo(spec,SWORD); S.f[0].x=400; S.f[1].x=400+gap; let seen=''; S.addRule(rule({},h=>{ seen+=h.mine.kind+(h.hit.damage>0?'':'?'); h.hit.scale(1.4); })); press(S,0); run(S,2.5); got[name]=seen; }
    ok('a strike is a swing, a shot, a bomb or a dash of item a: once each, and never a shield or a heal',got.gun==='ranged'&&got.ball==='ranged'&&got.bomb==='bomb'&&got.dash==='dash'&&got.shield===''&&got.heal==='',got); }
  { const S=duo(SWORD,SWORD); S.addRule(rule({a:[1,0],b:[0,0]},h=>{ h.hit.scale(0.1); })); const d=blueHits(S); S.clearRules(); S.addRule(rule({},h=>{ h.hit.scale(1.4); h.hit.scale(1.4); })); S.addRule(rule({},h=>{ h.hit.scale(1.4); })); const twice=blueHits(S);
    ok('a rule belongs to one side, and rules cannot stack a blow past 1.4x',Math.abs(d-base)<1e-9&&Math.abs(twice/base-1.4)<0.02,{d,twice}); }
  { const S=duo(SWORD,SWORD); let said=0; S.addRule(rule({},h=>{ h.hurt(h.me,3); h.hurt(h.foe,0/0); said=1; })); S.snapshot(); for(let i=0;i<4;i++) blueHits(S); const evs=S.snapshot().ev, own=evs.filter(e=>e.e==='hit'&&e.side===0);
    ok('a faulting run keeps what it had done, stops there, and the breaker says so',said===0&&S.rules[0].off&&own.length===3&&own.every(e=>e.n===3)&&evs.filter(e=>e.e==='rulefault'&&e.id===1).length===1&&S.sane(),own); }
  { const S=duo(SWORD,SWORD); S.addRule(rule({},h=>{ h.hurt({x:1},8); })); S.addRule(rule({},h=>{ h.say(7); })); S.addRule(rule({},h=>{ h.hit.scale('2'); })); const d=blueHits(S);
    ok('a wrong kind of argument is a fault and does nothing',Math.abs(d-base)<1e-9&&S.rules.every(r=>r.faults===1&&r.fired===0)); }
  { // rounds: notes and budgets come back, faults do not
    const S=D.createDuel(); S.setItem(0,0,plain(SWORD),45); S.setItem(1,0,plain(SWORD),45); const seen=[];
    S.addRule(rule({cooldown:0.25},h=>{ seen.push(h.mem.n||0); h.mem.n=(h.mem.n||0)+1; h.hurt(h.foe,8); h.hurt(h.foe,8); if(seen.length===1) throw new Error('once'); }));
    const fight=()=>{ S.setReady(0); S.setReady(1); for(let i=0;i<900&&S.phase!=='fight';i++) S.step(1/60); return S.phase==='fight'; };
    const one=fight(), d1=[blueHits(S),blueHits(S),blueHits(S)]; S.f[1].hp=0; run(S,4); const drawing=S.phase==='draw'&&S.round===2; const two=fight(), d2=blueHits(S);
    ok('mem and the budgets start again each round; faults are kept',one&&drawing&&two&&seen.join()==='0,1,2,0'&&Math.abs(d1[0]+d1[1]+d1[2]-3*base-24)<1e-6&&Math.abs(d2-base-16)<1e-6&&S.rules[0].faults===1&&S.rules[0].off===false,{seen,d1,d2}); }
  { // the three parts together: source, parse, check against the table, compile, install
    const S=duo(SWORD,SWORD), code="mem.n += 1; if (foe.hp > 20 && mine.kind == 'melee') { hit.scale(1 + mem.n / 10); say('HIT ' + (mem.n > 1 ? 'AGAIN' : 'ONE')); }", p=FS.parse(code);
    const errs=p.ok?FS.check(p.ast,D.FORGE_API.strike):p.errors; if(!errs.length) S.addRule(rule({cooldown:0.25,run:FS.compile(p.ast)}));
    const d=[blueHits(S),blueHits(S)], evs=S.snapshot().ev.filter(e=>e.e==='rule');
    ok('a ForgeScript rule runs in the sim',errs.length===0&&Math.abs(d[0]/base-1.1)<0.01&&Math.abs(d[1]/base-1.2)<0.01&&S.rules[0].faults===0&&evs.length===2&&evs[0].say==='HIT ONE'&&evs[1].say===undefined,{errs,d,evs}); }
  { const S=duo(SWORD,SWORD); S.f[1].hp=HP0+50; const high=S.sane(); S.f[1].hp=HP0; S.f[0].vx=0/0; const nan=S.sane(); S.f[0].vx=0; S.f[0].x=-500; const out=S.sane(); S.f[0].x=BLUE_X; S.pr.push({id:999,k:'shot',side:0,slot:0,x:100,y:1/0,vx:0,vy:0,ttl:1}); const shot=S.sane(); S.pr.length=0;
    ok('sane notices health over the top, a number that is not one, and anything far outside',!high&&!nan&&!out&&!shot&&S.sane()); }
}

// A projectile owned by side/slot, 40 px in front of the other fighter and flying at them, with the fields of a gun shot.
let shotId=9000;
function shotAt(S,side,slot,speed){
  const e=S.f[1-side], it=S.items[side][slot];
  const p={id:shotId++,k:'shot',st:it.style,big:0,side,slot,x:e.x+e.face*40,y:e.y+71,vx:-e.face*speed,vy:0,grav:0,dmg:it.st.dmg*0.55,el:it.el,kb:it.st.kb,stun:0.1,tr:it.trait,fin:0,life:1,ttl:1};
  S.pr.push(p); return p;
}
// Press that side's attack and step to the move's first hit mark.
function swing(S,side){ const f=S.f[side]; press(S,side); for(let i=0;i<120;i++){ S.step(1/120); const M=f.act&&D.MOVES[f.act.m]; if(M&&M.hits&&f.act.t>=M.hits[0]) return true; } return false; }
const calm=S=>{ for(let i=0;i<60&&S.stop>0;i++) S.step(1/120); };      // let a hit-stop pass: nothing moves while it lasts
function raiseShield(S,side){ const f=S.f[side]; press(S,side); for(let i=0;i<60&&!(f.shield>0);i++) S.step(1/120); return f.shield>0; }

{ // 5. shot rules, near, the effects and the countdown hold
  { const S=duo(SWORD,BALL); S.addRule({name:'Return',blurb:'',a:[0,0],b:[1,0],on:'swat',cooldown:0.4,run:h=>{ h.shot.reflect(9); }}); swing(S,0); const p=shotAt(S,1,0,600); const hp=S.f[0].hp; run(S,0.5);
    ok('a swat rule sends the ball back at 1.5x at most',p.side===0&&Math.abs(Math.hypot(p.vx,p.vy)-900)<5&&S.f[0].hp===hp,{side:p.side,v:Math.hypot(p.vx,p.vy)}); }
  { const S=duo(SWORD,BALL); let runs=0; S.addRule({name:'R',blurb:'',a:[0,0],b:[1,0],on:'swat',cooldown:0.25,run:()=>{ runs++; }}); shotAt(S,1,0,600); run(S,0.5); ok('no swing, no swat',runs===0); }
  { const S=duo(SWORD,BALL); let runs=0; S.addRule({name:'R',blurb:'',a:[0,0],b:[1,0],on:'swat',cooldown:0.25,run:h=>{ runs++; h.shot.slow(0.5); }}); swing(S,0); shotAt(S,1,0,300); run(S,0.6); ok('one projectile triggers shot rules once',runs===1); }
  { const S=duo(SHIELD,BALL); S.addRule({name:'Ric',blurb:'',a:[0,0],b:[1,0],on:'guard',cooldown:0.4,run:h=>{ h.shot.destroy(); }}); raiseShield(S,0); const p=shotAt(S,1,0,600); run(S,0.4); ok('a guard rule can destroy the shot',p.ttl<=0); }
  { const S=duo(SWORD,SWORD); S.f[1].x=S.f[0].x+150; let runs=0; S.addRule({name:'N',blurb:'',a:[0,0],b:[1,0],on:'near',cooldown:0.5,run:h=>{ runs++; h.soak(h.foe,9); h.push(h.foe,9999,9999); h.say('ABCDEFGHIJKLMNOPQRSTUVWXYZ'); }}); run(S,2.1);
    const ev=S.snapshot().ev.filter(e=>e.e==='rule');
    ok('near runs on its cooldown and clamps soak, push and say',runs>=4&&runs<=5&&S.f[1].slow<=2&&Math.abs(S.f[1].vx)<=520&&ev[0].say.length===18&&ev.filter(e=>e.say).length<=2,{runs}); }
  { const S=duo(SWORD,SWORD); S.f[1].x=S.f[0].x+150; S.addRule({name:'N',blurb:'',a:[0,0],b:[1,0],on:'near',cooldown:0.25,run:h=>{ h.stun(h.foe,0/0); h.heal(h.me,1/0); }}); run(S,1.2); ok('non-finite arguments do nothing and count as faults',S.rules[0].off&&S.sane()); }
  { const S=D.createDuel(); S.setItem(0,0,SWORD,45); S.setItem(1,0,SWORD,45); S.setReady(0); S.setReady(1); S.step(1/60); S.setHold(99); run(S,6.5); const held=S.phase; run(S,1); ok('the countdown waits for the hold, 4 s at most',held==='count'&&S.phase==='fight',held); }
  // beyond the plan
  const rule=(on,fn,o)=>Object.assign({name:'T',blurb:'',a:[0,0],b:[1,0],on,cooldown:0.25,run:fn||(()=>{})},o), evs=(S,e)=>S.snapshot().ev.filter(v=>v.e===e), base=blueHits(duo(SWORD,SWORD));
  const BOMB={kind:'bomb',style:'',element:'none',name:'Bomb'}, bombAt=(S,o)=>{ const p=Object.assign({id:shotId++,k:'bomb',side:1,slot:0,x:S.f[0].x+40,y:60,vx:-300,vy:-100,dmg:10,el:'none',kb:200,radius:70,grav:1100,tr:'swift',ttl:3},o); S.pr.push(p); return p; };
  // a real match (no practice healing), in its fight, the two fighters 150 px apart
  const arena=(aSpec,bSpec)=>{ const S=D.createDuel(); S.setItem(0,0,plain(aSpec),45); S.setItem(1,0,plain(bSpec),45); S.setReady(0); S.setReady(1); for(let i=0;i<900&&S.phase!=='fight';i++) S.step(1/60); place(S,150); S.snapshot(); return S; };
  { const S=D.createDuel(); S.setItem(0,0,SWORD,45); S.setItem(1,0,SWORD,45); S.setReady(0); S.setReady(1); S.step(1/60); const none=S.hold; S.setHold(-5); const neg=S.hold; S.setHold('x'); const junk=S.hold; S.setHold(2.5); const some=S.hold; S.setHold(4);
    run(S,2.5); const early=S.phase, left=S.hold; run(S,1.5); const holding=S.phase, t=S.snapshot().t; S.setHold(0); run(S,0.1);
    ok('the hold is 0 unless asked for, never runs before the countdown is over, and setHold(0) lets go',none===0&&neg===0&&junk===0&&some===2.5&&early==='count'&&left===4&&holding==='count'&&t===0&&S.phase==='fight',{early,left,holding,t,now:S.phase}); }
  { const S=D.createDuel(); S.setItem(0,0,SWORD,45); S.setItem(1,0,SWORD,45); S.setReady(0); S.setReady(1); run(S,3.1); ok('with no hold the countdown is the usual three seconds',S.phase==='fight'); }
  { const S=duo(SWORD,BALL); S.addRule(rule('swat',h=>{ h.shot.reflect(1); })); let strikes=0; S.addRule(rule('strike',()=>{ strikes++; })); swing(S,0); strikes=0; place(S,200); S.snapshot(); const p=shotAt(S,1,0,600); p.x=S.f[0].x+40; p.vx=-600; const hp=S.f[1].hp; let low=hp, o;
    for(let i=0;i<60;i++){ S.step(1/120); low=Math.min(low,S.f[1].hp); const q=S.snapshot().pr.find(q=>q.id===p.id); if(q&&q.side===0) o=q.o; }
    ok('a returned shot hits its thrower, is nobody\'s strike, and still says whose it was',p.side===0&&p.os===1&&o===1&&low<hp&&strikes===0&&p.ttl<=0,{low,hp,strikes,o}); }
  { const S=duo(SWORD,BALL); let runs=0; S.addRule(rule('swat',()=>{ runs++; })); swing(S,0); calm(S); const a=S.f[0];
    const behind=shotAt(S,1,0,600); behind.x=a.x-40; behind.vx=600; const high=shotAt(S,1,0,0); high.x=a.x+40; high.y=a.y+140; high.vx=0; const far=shotAt(S,1,0,0); far.x=a.x+140; far.vx=0; far.y=a.y+50;
    S.step(1/120); S.step(1/120); const out=runs; const edge=shotAt(S,1,0,0); edge.x=a.x+95; edge.vx=0; edge.y=a.y+50; S.step(1/120); S.step(1/120);
    ok('a swat needs the shot inside the swing: not behind, not overhead, not out of reach',out===0&&runs===1,{out,runs,reach:S.items[0][0].st.reach}); }
  { const S=duo(SWORD,BALL); let runs=0; S.addRule(rule('swat',()=>{ runs++; })); swing(S,0); run(S,0.5); const late=shotAt(S,1,0,600); run(S,0.3); ok('a swat needs the swing to be live: 0.1 s after the last hit mark it is over',runs===0&&late.ttl<=0); }
  { const S=duo(SWORD,BALL); let runs=0; S.addRule(rule('swat',()=>{ runs++; })); S.addRule(rule('guard',()=>{ runs++; })); swing(S,0); const a=S.f[0];
    const fleet=shotAt(S,1,0,600); fleet.tr='fleet'; const bolt=shotAt(S,1,0,600); bolt.k='bolt'; const mineBack=shotAt(S,1,0,600); mineBack.os=0; run(S,0.4);
    ok('an ultimate\'s shot, a drawn bolt and a shot already sent back trigger no shot rule',runs===0); }
  { const S=duo(SWORD,BOMB); S.addRule(rule('swat',h=>{ h.shot.reflect(1); h.say(h.shot.bomb?'BOMB':'SHOT'); })); swing(S,0); calm(S); S.f[1].x=S.f[0].x+200; S.snapshot(); const hp=S.f[0].hp, p=bombAt(S,{}), v0=Math.hypot(p.vx,p.vy); S.step(1/120); S.step(1/120); S.step(1/120);      // the thrower 200 px off: a returned bomb bursts on a thrower it touches
    const ev=S.snapshot().ev; ok('a swat rule can send a bomb back before it bursts',p.side===0&&p.vx>0&&p.vy>0&&Math.abs(Math.hypot(p.vx,p.vy)-v0)<30&&p.ttl>2&&S.f[0].hp===hp&&!ev.some(e=>e.e==='boom')&&ev.some(e=>e.e==='rule'&&e.say==='BOMB'),{vx:p.vx,vy:p.vy,ttl:p.ttl});
    const S2=duo(SWORD,BOMB); S2.addRule(rule('swat',h=>{ h.shot.reflect(1); })); swing(S2,0); calm(S2); S2.snapshot(); const hp2=S2.f[1].hp, q=bombAt(S2,{}); for(let i=0;i<12;i++) S2.step(1/120);
    ok('and a returned bomb bursts on a thrower who stands close',q.side===0&&q.ttl<=0&&S2.f[1].hp<hp2&&S2.snapshot().ev.some(e=>e.e==='boom'),{lost:hp2-S2.f[1].hp}); }
  { const S=duo(SHIELD,BALL); let seen=null; S.addRule(rule('guard',h=>{ seen=h.shot; h.shot.reflect(0.8); },{cooldown:0.4})); raiseShield(S,0); S.snapshot(); const p=shotAt(S,1,0,600), hp=S.f[0].hp; run(S,0.2);
    const ev=S.snapshot().ev; ok('a guard rule sends a shot back off the shield instead of blocking it',p.side===0&&Math.abs(Math.hypot(p.vx,p.vy)-480)<5&&S.f[0].hp===hp&&!ev.some(e=>e.e==='block')&&ev.some(e=>e.e==='rule'&&e.id===1)&&!!seen&&seen.speed===600&&seen.vx===-600&&seen.bomb===false&&seen.element==='none'&&seen.damage>0,seen&&{speed:seen.speed,vx:seen.vx}); }
  { const S=duo(SHIELD,BALL); let runs=0; S.addRule(rule('guard',h=>{ runs++; h.say('TING'); })); raiseShield(S,0); S.snapshot(); const p=shotAt(S,1,0,600); run(S,0.2); const ev=S.snapshot().ev;
    ok('a guard rule that leaves the shot alone is followed by the normal block',runs===1&&p.ttl<=0&&p.side===1&&ev.some(e=>e.e==='block')&&ev.some(e=>e.e==='rule'&&e.say==='TING')); }
  { const S=duo(SHIELD,BALL); let runs=0; S.addRule(rule('guard',()=>{ runs++; })); const p0=shotAt(S,1,0,600); run(S,0.2); const down=runs; raiseShield(S,0); const p=shotAt(S,1,0,600); p.x=S.f[0].x-40; p.vx=600; run(S,0.2);
    ok('guard needs the shield up; it is not asked which way the shield faces',down===0&&runs===1,{down,runs}); }
  { const S=duo(SHIELD,BOMB); S.addRule(rule('guard',h=>{ h.shot.reflect(0.8); })); raiseShield(S,0); S.snapshot(); const p=bombAt(S,{x:S.f[0].x+10,y:50,vx:-200,vy:0}); S.step(1/120); S.step(1/120);
    ok('a guard rule can bounce a bomb off the shield',p.side===0&&p.vx>0&&p.ttl>2&&!S.snapshot().ev.some(e=>e.e==='boom')); }
  { const S=duo(SWORD,BALL); let seen=[]; S.addRule(rule('swat',h=>{ h.shot.slow(0.01); h.shot.power(9); h.shot.power(9); h.shot.turn(9999); }));  S.addRule(rule('swat',h=>{ seen=[h.shot.speed,h.shot.damage,h.shot.vx,h.shot.vy]; h.shot.slow(0.5); h.shot.reflect(1.5); h.shot.reflect(1.5); h.shot.power(0.01); }));
    swing(S,0); calm(S); const p=shotAt(S,1,0,600), d0=p.dmg; S.step(1/120); S.step(1/120); S.step(1/120);
    ok('slow, power and turn are clamped, one by one and all a shot\'s rules together',Math.abs(seen[0]-180)<1e-6&&Math.abs(seen[1]-d0*1.5)<1e-9&&seen[2]>179&&Math.abs(seen[3])<1e-6&&p.side===0&&Math.abs(Math.hypot(p.vx,p.vy)-600*0.3*1.5*1.5)<1e-6&&Math.abs(p.dmg-d0*0.75)<1e-9&&p.ruled===1,{seen,v:Math.hypot(p.vx,p.vy),dmg:p.dmg/d0}); }
  { const S=duo(SWORD,BALL); S.addRule(rule('swat',h=>{ h.shot.turn(30); })); swing(S,0); calm(S); const p=shotAt(S,1,0,600); S.step(1/120); S.step(1/120); S.step(1/120); const up=p.vy>0&&p.vx<0&&Math.abs(Math.hypot(p.vx,p.vy)-600)<1e-6;
    const S2=duo(SWORD,BALL); S2.addRule(rule('swat',h=>{ h.shot.turn(30); })); swing(S2,0); calm(S2); const q=shotAt(S2,1,0,0); q.vx=300; q.x=S2.f[0].x+20; S2.step(1/120); S2.step(1/120); S2.step(1/120);
    ok('a positive turn bends a shot upwards whichever way it flies',up&&q.vy>0&&q.vx>0,{l:[p.vx,p.vy],r:[q.vx,q.vy]}); }
  { const S=duo(SWORD,SWORD); S.addRule(rule('strike',h=>{ h.push(h.foe,-400,0); })); place(S,60); press(S,0); const b=S.f[1], hp=b.hp; let vx=0; for(let i=0;i<120;i++){ S.step(1/120); if(b.hp<hp){ vx=b.vx; break; } }
    const S2=duo(SWORD,SWORD); place(S2,60); press(S2,0); const b2=S2.f[1]; let vx2=0; for(let i=0;i<120;i++){ S2.step(1/120); if(b2.hp<hp){ vx2=b2.vx; break; } }
    ok('a push from a strike rule is not undone by the blow\'s own knock-back',vx<=-380&&vx>=-400&&vx2>0,{vx,vx2}); }
  { const S=arena(SWORD,SWORD), a=S.f[0], b=S.f[1]; a.hp=100; S.addRule(rule('near',h=>{ h.heal(h.me,99); h.spark(h.me.x,h.me.y+50); h.spark(1/1e-300,-5); h.spark(1,1); h.spark(1,1); h.spark(1,1); h.spark(1,1); })); run(S,0.3); const sparks=evs(S,'spark'); run(S,3);
    ok('heal is capped per call and by the round budget; a run shows four sparks at most, inside the arena',Math.abs(a.hp-124)<1e-9&&b.hp===HP0&&sparks.length===4&&sparks[1].x===960&&sparks[1].yd===0&&S.rules[0].faults===0,{hp:a.hp,sparks:sparks.length}); }
  { const S=arena(SWORD,SWORD), a=S.f[0], b=S.f[1]; b.hp=HP0-0.5; S.addRule(rule('near',h=>{ h.heal(h.foe,8); })); run(S,1); ok('heal stops at full health',b.hp===HP0); }
  { const S=arena(SWORD,SWORD), a=S.f[0], b=S.f[1]; a.hp=100; S.addRule(rule('near',h=>{ for(let i=0;i<40;i++){ h.hurt(h.foe,0.1); h.heal(h.me,0.05); } })); run(S,0.3); const ev=S.snapshot().ev;
    ok('however many calls a run makes, it shows one number per fighter',Math.abs(HP0-b.hp-4)<1e-9&&Math.abs(a.hp-102)<1e-9&&ev.filter(e=>e.e==='hit').length===1&&ev.find(e=>e.e==='hit').n===4&&ev.filter(e=>e.e==='heal').length===1&&ev.find(e=>e.e==='heal').n===2&&ev.filter(e=>e.e==='rule').length===1,ev.map(e=>e.e)); }
  { const S=arena(SWORD,SWORD), b=S.f[1]; S.addRule(rule('near',h=>{ h.burn(h.foe,99); })); run(S,1); const lit=b.burn>0&&b.burn<=2, early=HP0-b.hp; run(S,29);
    ok('a rule\'s fire burns at most 2 s a call and its damage comes out of the 24 hp budget',lit&&early>0.5&&early<2&&Math.abs(HP0-b.hp-24)<0.3&&!(b.burn>0),{early,lost:HP0-b.hp}); }
  { const S=arena(SWORD,SWORD), b=S.f[1]; S.addRule(rule('near',h=>{ h.stun(h.foe,99); })); let ticks=0, longest=0; for(let i=0;i<120*8;i++){ S.step(1/120); if(b.stun>0) ticks++; longest=Math.max(longest,b.stun); }
    ok('stun is 0.6 s a call and 1.5 s a round',longest<=0.6&&Math.abs(ticks/120-1.5)<0.05,{secs:ticks/120,longest}); }
  { const S=arena(SWORD,SWORD), a=S.f[0], b=S.f[1]; S.addRule(rule('near',h=>{ h.hurt(h.foe,8); })); b.hp=10; run(S,1); const end=S.phase, w=S.wins[0];
    ok('a rule can land the last blow, and the round ends as usual',end==='end'&&w===1&&S.winner===0&&S.sane(),{end,w,hp:b.hp}); }
  { const S=arena(SWORD,SWORD), a=S.f[0], b=S.f[1]; let runs=0; S.addRule(rule('near',()=>{ runs++; })); a.x=400; b.x=700; run(S,1); const far=runs; b.x=600; S.f[1].held=1; run(S,1); const other=runs; S.f[1].held=0; run(S,1.01);
    ok('near needs the two within 260 px and holding the two items; it is tried four times a second',far===0&&other===0&&runs===4,{far,other,runs}); }
  { const S=arena(SWORD,SWORD), a=S.f[0]; let seen=[]; S.addRule(rule('near',h=>{ seen.push(h.time); h.say('A'); },{cooldown:1})); S.addRule(rule('near',h=>{ h.say('B'); },{a:[1,0],b:[0,0],cooldown:1})); run(S,3.6); const ev=evs(S,'rule');
    ok('each side has its own rules; a call-out is rationed per rule, the firing is not',seen.length===4&&Math.abs(seen[1]-seen[0]-1)<0.02&&ev.length===8&&ev.filter(e=>e.id===1&&e.side===0).length===4&&ev.filter(e=>e.say==='A').length===2&&ev.filter(e=>e.say==='B').length===2&&ev.every(e=>e.say===undefined||typeof e.say==='string'),{seen,n:ev.length}); }
  { const S=arena(SWORD,SWORD); S.addRule(rule('near',h=>{ h.push(h.foe,0,520); })); S.addRule(rule('near',h=>{ h.push(h.foe,0,520); },{a:[1,0],b:[0,0]})); let top=0, sane=true; for(let i=0;i<120*10;i++){ S.step(1/120); top=Math.max(top,S.f[0].y,S.f[1].y); sane=sane&&S.sane(); }
    ok('rules cannot juggle a fighter up and out of the arena',top>100&&top<400&&sane,{top}); }
  { const S=duo(SWORD,BALL); S.addRule(rule('swat',h=>{ h.shot.reflect(1.5); h.shot.turn(90); })); swing(S,0); calm(S); const p=shotAt(S,1,0,900); p.life=p.ttl=1.6; let top=0, sane=true; for(let i=0;i<240;i++){ S.step(1/120); top=Math.max(top,p.y); sane=sane&&S.sane(); }
    ok('a shot a rule sends straight up is gone once it is out of the arena',p.vy>1300&&top>900&&top<1000&&p.ttl<=0&&sane,{top,vy:p.vy}); }
  { // the rule of the Design section and the four built-in bodies, from source, through the checker, into a fight
    const live=(on,code)=>{ const p=FS.parse(code); return p.ok&&FS.check(p.ast,D.FORGE_API[on]).length===0?FS.compile(p.ast):null; };
    const racket=live('swat',"if (shot.speed > 100) { shot.reflect(1.2); say('RETURN!'); }"), deflect=live('swat',"shot.reflect(0.9); say('DEFLECT!');"), ricochet=live('guard',"shot.reflect(0.8); say('RICOCHET!');");
    const clash=live('strike',"if (foe.attacking) { hit.scale(0.8); push(foe, me.face * 260, 120); spark(foe.x, foe.y + 50); say('CLASH!'); }"), wind=live('near',"if (me.hp < foe.hp - 40 && chance(0.5)) { heal(me, 2); say('SECOND WIND'); }");
    ok('the Design\'s rule and the four built-in bodies pass the checker for their event',!!(racket&&deflect&&ricochet&&clash&&wind));
    { const S=duo(SWORD,BALL); S.addRule(rule('swat',racket,{cooldown:0.4})); swing(S,0); S.snapshot(); const p=shotAt(S,1,0,600); run(S,0.1);
      ok('Return Serve: a swung racket returns the ball',p.side===0&&Math.abs(Math.hypot(p.vx,p.vy)-720)<1e-6&&evs(S,'rule')[0].say==='RETURN!'&&S.rules[0].faults===0); }
    { const S=duo(SWORD,BALL); S.addRule(rule('swat',deflect,{cooldown:1.2})); swing(S,0); const p=shotAt(S,1,0,600); run(S,0.1); const S2=duo(SHIELD,BALL); S2.addRule(rule('guard',ricochet,{cooldown:1.5})); raiseShield(S2,0); const q=shotAt(S2,1,0,600); run(S2,0.2);
      ok('Deflect and Ricochet send a shot back',p.side===0&&Math.abs(Math.hypot(p.vx,p.vy)-540)<1e-6&&q.side===0&&Math.abs(Math.hypot(q.vx,q.vy)-480)<1e-6&&S.rules[0].faults+S2.rules[0].faults===0); }
    { const S=duo(SWORD,SWORD); S.addRule(rule('strike',clash,{cooldown:0.8})); const calm=blueHits(S); const b=S.f[1]; place(S,60); press(S,1); press(S,0); const hp=b.hp; let d=0, vx=0; for(let i=0;i<120&&!d;i++){ S.step(1/120); d=hp-b.hp; vx=b.vx; }
      ok('Clash: only when the foe is mid-swing, the blow lands softer and shoves them back',Math.abs(calm-base)<1e-9&&Math.abs(d/base-0.8)<0.02&&vx>250&&vx<=260&&S.rules[0].faults===0&&S.rules[0].fired===1,{calm,d,vx}); }
    { const S=arena(SWORD,SWORD), a=S.f[0]; S.addRule(rule('near',wind,{cooldown:2})); run(S,3); const even=S.rules[0].fired; a.hp=60; run(S,20);
      ok('Second Wind: heals the one who is well behind, a little at a time',even===0&&S.rules[0].fired>=3&&a.hp>60&&a.hp<=84&&S.rules[0].faults===0,{fired:S.rules[0].fired,hp:a.hp}); }
  }
  { // a returned shot can hit at once: the thrower stands 60 px away, the ball comes back from 20 px in front of them
    const S=duo(SWORD,BALL); S.addRule(rule('swat',h=>{ h.shot.reflect(1); })); swing(S,0); calm(S); S.snapshot(); const b=S.f[1], hp=b.hp, p=shotAt(S,1,0,600); for(let i=0;i<12;i++) S.step(1/120);
    ok('a returned shot hits a thrower who stands close: it does not fly through them',p.side===0&&p.os===1&&p.ttl<=0&&b.hp<hp&&S.snapshot().ev.some(e=>e.e==='hit'&&e.side===1),{lost:hp-b.hp,ttl:p.ttl,x:p.x-b.x}); }
  { // a spent budget: the rule has healed its 24 hp, so its heal does nothing more and the run no longer fires
    const S=arena(SWORD,SWORD), a=S.f[0]; a.hp=60; S.addRule(rule('near',h=>{ h.heal(h.me,8); h.say('MEND'); h.spark(h.me.x,h.me.y+50); },{cooldown:0.5})); run(S,1.8); const first=S.rules[0].fired, hp=a.hp; S.snapshot(); run(S,4); const ev=S.snapshot().ev;
    ok('an effect the spent budget stopped is not a firing: no cooldown, no rule event, no call-out, no spark',first===3&&Math.abs(hp-84)<1e-9&&S.rules[0].fired===3&&a.hp===hp&&!(S.rules[0].cd>0)&&!ev.some(e=>e.e==='rule'||e.e==='spark')&&S.rules[0].faults===0,{first,fired:S.rules[0].fired,hp:a.hp,cd:S.rules[0].cd}); }
  { const S=arena(SWORD,SWORD), b=S.f[1]; S.addRule(rule('near',h=>{ h.hurt(h.foe,8); h.soak(h.foe,1); h.say('SPLASH'); },{cooldown:0.5})); run(S,1.8); const lost=HP0-b.hp; S.snapshot(); run(S,2.1); const ev=evs(S,'rule');
    ok('a run that also did something real still fires once the budget is spent',Math.abs(lost-24)<1e-9&&Math.abs(HP0-b.hp-24)<1e-9&&ev.length>=3&&ev.some(e=>e.say==='SPLASH')&&b.slow>0,{lost,n:ev.length}); }
  { const S=arena(SWORD,SWORD), b=S.f[1]; S.addRule(rule('near',h=>{ h.stun(h.foe,0.6); h.say('FREEZE'); },{cooldown:1})); S.addRule(rule('near',h=>{ h.burn(h.foe,2); },{a:[1,0],b:[0,0],cooldown:1})); run(S,30); const n=[S.rules[0].fired,S.rules[1].fired]; S.snapshot(); run(S,5);
    ok('the same for a stun past its 1.5 s and a fire past the budget',n[0]>=3&&n[0]<=4&&S.rules[0].fired===n[0]&&n[1]>=1&&S.rules[1].fired===n[1]&&evs(S,'rule').length===0&&Math.abs(S.rules[0].stun-1.5)<1e-6&&S.rules[1].hp>=24-1e-6,{n,stun:S.rules[0].stun,hp:S.rules[1].hp}); }
  { const S=arena(SWORD,SWORD); S.addRule(rule('near',h=>{ h.hurt(h.foe,0); h.say('TAP'); },{cooldown:0.5})); S.addRule(rule('near',h=>{ h.say('HEY'); },{a:[1,0],b:[0,0],cooldown:0.5})); run(S,1.1);
    ok('a call-out alone, or an effect that asked for nothing, still fires as before',S.rules[0].fired>=2&&S.rules[1].fired>=2&&evs(S,'rule').some(e=>e.say==='HEY')); }
  { // a hostile rule: everything at once, with numbers as bad as they come; then a long bot fight with rules that never rest
    const S=arena(SWORD,BALL), nasty=h=>{ const v=[1e308,-1e308,1e-320,5e-324,-0]; for(const who of [h.me,h.foe]) for(const n of v){ h.push(who,n,n); h.burn(who,n); h.soak(who,n); h.stun(who,n); h.heal(who,n); h.hurt(who,n); h.spark(n,n); }
      h.say('\u0000\n<img src=x onerror=1>'.repeat(40)); if(h.shot) for(const n of v){ h.shot.reflect(n); h.shot.slow(n); h.shot.turn(n); h.shot.power(n); } if(h.hit) for(const n of v) h.hit.scale(n); };
    for(const on of ['near','strike','swat','guard']) for(const side of [0,1]) S.addRule(rule(on,nasty,{a:[side,0],b:[1-side,0]}));
    let sane=true, said=[]; for(let i=0;i<120*6;i++){ if(i%40===0){ press(S,0); press(S,1); } S.step(1/120); sane=sane&&S.sane(); for(const e of S.snapshot().ev) if(e.e==='rule'&&e.say) said.push(e.say); }
    ok('a rule that asks for everything, with the worst numbers, leaves the match in one piece',sane&&S.rules.every(r=>r.faults===0&&r.hp<=24+1e-9&&r.stun<=1.5+1e-9)&&said.length>0&&said.every(t=>t.length<=18&&!/[\x00-\x1f]/.test(t)),{said:said.length,hp:[S.f[0].hp,S.f[1].hp]}); }
}

console.log(bad?bad+' failed':'all forge tests pass'); process.exit(bad?1:0);
