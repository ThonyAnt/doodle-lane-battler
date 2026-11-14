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

console.log(bad?bad+' failed':'all forge tests pass'); process.exit(bad?1:0);
