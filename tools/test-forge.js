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

console.log(bad?bad+' failed':'all forge tests pass'); process.exit(bad?1:0);
