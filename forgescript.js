// ForgeScript: the small language that RuleForge's match rules are written in. A strict subset of JavaScript that is
// parsed, checked and interpreted here, so a rule written by a language model never reaches eval, new Function or vm.
//   ForgeScript.parse(src)        -> {ok:true, ast, nodes} | {ok:false, errors:[{line,col,msg}]}
//   ForgeScript.check(ast, env)   -> [{line,col,msg}]: what the code touches that env does not offer; empty means clean
//   ForgeScript.compile(ast, opts)-> run(host); throws ForgeScript.Fault (name 'ForgeFault') and nothing else
//   ForgeScript.LIMITS            -> the size limits of a rule
// Statements: let x = e;  const x = e;  x = e;  mem.name = e;  (also += -= *= /=)  if (e) ... else ...  return;
//   an expression as a statement (a call, usually), { } blocks, // comments.
// Expressions: decimal numbers, true, false, strings in single or double quotes, names, a.b, calls, unary - and !,
//   * / % + - < <= > >= == != === !== && ||, ? :, brackets.
// Everything else is an error, and so is a backslash anywhere.
(function(root,factory){ if(typeof module==='object'&&module.exports) module.exports=factory(); else root.ForgeScript=factory(); })(typeof self!=='undefined'?self:this,function(){
'use strict';
const LIMITS={chars:800,nodes:250,depth:24,locals:12,mem:8,fuel:2000};
const KEYWORDS=new Set(['let','const','if','else','return','true','false']);
// Every other reserved word of JavaScript is refused by name, and with them the names that lead to an object's insides.
const RESERVED=new Set(('break case catch class continue debugger default delete do enum export extends finally for function import in instanceof new null super switch this throw try typeof var void while with yield '+
  'await async implements interface package private protected public static undefined NaN Infinity arguments eval constructor prototype __proto__').split(' '));
const OPS3=['===','!=='], OPS2=['==','!=','<=','>=','&&','||','+=','-=','*=','/='], OPS1='(){};,.?:+-*/%<>!=';
const NOT_HERE=['++','--','=>','**','??','?.','<<','>>','/*','..'];
const BIN={'||':1,'&&':2,'==':3,'!=':3,'===':3,'!==':3,'<':4,'<=':4,'>':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
const ASSIGN=['=','+=','-=','*=','/='];
function Bad(line,col,msg){ this.line=line; this.col=col; this.msg=msg; }      // thrown inside parse, never out of it

function tokenize(src){
  const toks=[], n=src.length; let i=0, line=1, col=1;
  const isDigit=c=>c>='0'&&c<='9', isStart=c=>(c>='a'&&c<='z')||(c>='A'&&c<='Z')||c==='_', isPart=c=>isStart(c)||isDigit(c);
  // First pass: characters that may appear nowhere at all, not even inside a string or a comment.
  for(let j=0,l=1,c=1;j<n;j++){
    const ch=src[j], code=src.charCodeAt(j);
    if(ch==='\\') throw new Bad(l,c,'a backslash is not allowed anywhere');
    if((code<32&&ch!=='\n'&&ch!=='\t'&&!(ch==='\r'&&src[j+1]==='\n'))||code===127||code===0x2028||code===0x2029) throw new Bad(l,c,'a control character is not allowed');      // a line ends with \n or \r\n
    if(ch==='\n'){ l++; c=1; } else c++;
  }
  while(i<n){
    const ch=src[i], code=src.charCodeAt(i);
    if(ch==='\n'){ i++; line++; col=1; continue; }
    if(ch===' '||ch==='\t'||ch==='\r'){ i++; col++; continue; }
    if(ch==='/'&&src[i+1]==='/'){ while(i<n&&src[i]!=='\n'){ i++; col++; } continue; }
    const at={line,col}, push=(k,v,len)=>{ toks.push({k,v,line:at.line,col:at.col}); i+=len; col+=len; };
    if(code>126) throw new Bad(line,col,'only plain ASCII is allowed outside strings and comments');
    if(isDigit(ch)){
      let j=i; while(j<n&&isDigit(src[j])) j++;
      if(src[j]==='.'&&isDigit(src[j+1]||'')){ j++; while(j<n&&isDigit(src[j])) j++; }
      const text=src.slice(i,j), next=src[j]||'';
      if(isPart(next)||next==='$'||next==='.'||(text.length>1&&text[0]==='0'&&text[1]!=='.')||!Number.isFinite(Number(text))) throw new Bad(line,col,'not a plain decimal number');
      push('num',Number(text),j-i); continue;
    }
    if(isStart(ch)){
      let j=i; while(j<n&&isPart(src[j])) j++;
      const word=src.slice(i,j);
      if(RESERVED.has(word)) throw new Bad(line,col,"'"+word+"' is not in the language");
      push(KEYWORDS.has(word)?'kw':'name',word,j-i); continue;
    }
    if(ch==="'"||ch==='"'){
      let j=i+1; while(j<n&&src[j]!==ch&&src[j]!=='\n'&&src[j]!=='\r') j++;
      if(src[j]!==ch) throw new Bad(line,col,'the string is not closed');
      push('str',src.slice(i+1,j),j+1-i); continue;
    }
    const two=src.slice(i,i+2);
    if(NOT_HERE.includes(two)) throw new Bad(line,col,"'"+two+"' is not in the language");
    const op=OPS3.find(o=>src.startsWith(o,i))||OPS2.find(o=>o===two)||(OPS1.includes(ch)?ch:'');
    if(!op) throw new Bad(line,col,"'"+ch+"' is not in the language");
    push('op',op,op.length);
  }
  toks.push({k:'eof',v:'',line,col});
  return toks;
}

function parse(src){
  const fail=(line,col,msg)=>({ok:false,errors:[{line,col,msg}]});
  if(typeof src!=='string') return fail(1,1,'the code must be text');
  if(src.length>LIMITS.chars) return fail(1,1,'the code is longer than '+LIMITS.chars+' characters');
  let toks, p=0, nodes=0, depth=0;
  const peek=()=>toks[p], is=(k,v)=>toks[p].k===k&&(v===undefined||toks[p].v===v), isOp=v=>is('op',v);
  const show=t=>t.k==='eof'?'the end of the code':t.k==='str'?'a string':"'"+t.v+"'";
  const err=(msg,t)=>{ t=t||peek(); throw new Bad(t.line,t.col,msg); };
  const expect=v=>{ if(!isOp(v)) err("expected '"+v+"' but found "+show(peek())); return toks[p++]; };
  const node=(t,at,o)=>{ if(++nodes>LIMITS.nodes) err('the code is too big: more than '+LIMITS.nodes+' parts',at); return Object.freeze(Object.assign({t,line:at.line,col:at.col},o)); };
  const deeper=fn=>{ if(++depth>LIMITS.depth) err('nested more than '+LIMITS.depth+' deep'); const r=fn(); depth--; return r; };

  function primary(){
    const t=peek();
    if(t.k==='num'){ p++; return node('num',t,{v:t.v}); }
    if(t.k==='str'){ p++; return node('str',t,{v:t.v}); }
    if(t.k==='kw'&&(t.v==='true'||t.v==='false')){ p++; return node('bool',t,{v:t.v==='true'}); }
    if(t.k==='name'){ p++; return node('name',t,{name:t.v}); }
    if(isOp('(')){ p++; const e=deeper(expr); expect(')'); return e; }
    err('expected a value but found '+show(t));
  }
  // a.b and f(...) follow a name only: nothing can be called on, or read off, the result of a call or a literal.
  function postfix(){
    let e=primary();
    for(;;){
      const t=peek();
      if(isOp('.')&&(e.t==='name'||e.t==='dot')){ p++; if(!is('name')) err('expected a name after the dot but found '+show(peek())); e=node('dot',t,{obj:e,prop:toks[p++].v}); }
      else if(isOp('(')&&(e.t==='name'||e.t==='dot')){
        p++; const args=[];
        deeper(()=>{ if(!isOp(')')) for(;;){ args.push(expr()); if(isOp(',')){ p++; continue; } break; } });
        expect(')'); e=node('call',t,{callee:e,args:Object.freeze(args)});
      }
      else return e;
    }
  }
  function unary(){
    const t=peek();
    if(isOp('-')||isOp('!')){ p++; const e=deeper(unary); return node('un',t,{op:t.v,e}); }
    return postfix();
  }
  function binary(min){
    let l=unary();
    for(;;){
      const t=peek(), prec=t.k==='op'?BIN[t.v]:undefined;
      if(prec===undefined||prec<min) return l;
      p++; const r=binary(prec+1); l=node('bin',t,{op:t.v,l,r});
    }
  }
  function expr(){
    const c=binary(1), t=peek();
    if(!isOp('?')) return c;
    p++; return deeper(()=>{ const a=expr(); expect(':'); const b=expr(); return node('cond',t,{test:c,a,b}); });
  }
  function block(){
    const t=expect('{'), body=[];
    deeper(()=>{ while(!isOp('}')){ if(is('eof')) err("expected '}' but the code ends"); const s=statement(); if(s) body.push(s); } });
    p++; return node('block',t,{body:Object.freeze(body)});
  }
  function branch(){        // the body of an if or an else
    const t=peek();
    if(t.k==='kw'&&(t.v==='let'||t.v==='const')) err('put the '+t.v+' inside { }');
    return deeper(statement)||node('block',t,{body:Object.freeze([])});
  }
  function statement(){
    const t=peek();
    if(isOp('{')) return block();
    if(isOp(';')){ p++; return null; }
    if(t.k==='kw'&&t.v!=='true'&&t.v!=='false'){
      p++;
      if(t.v==='let'||t.v==='const'){
        if(!is('name')) err('expected a name after '+t.v+' but found '+show(peek()));
        const name=toks[p++].v; if(!isOp('=')) err("expected '=' after the name: a "+t.v+' needs a value'); p++;
        const init=expr(); expect(';'); return node('let',t,{name,init,isConst:t.v==='const'});
      }
      if(t.v==='if'){
        expect('('); const test=deeper(expr); expect(')');
        const then=branch(); let other=null;
        if(is('kw','else')){ p++; other=branch(); }
        return node('if',t,{test,then,else:other});
      }
      if(t.v==='return'){ if(!isOp(';')) err("expected ';' after return: a rule returns nothing"); p++; return node('ret',t,{}); }
      err("'"+t.v+"' cannot start a statement",t);
    }
    // x = e;  and  mem.name = e;  are spotted by their first tokens, so the thing assigned to is not a node of its own
    const assign=i=>toks[p+i].k==='op'&&ASSIGN.includes(toks[p+i].v);
    if(t.k==='name'&&assign(1)){ const op=toks[p+1].v; p+=2; const value=expr(); expect(';'); return node('set',t,{name:t.v,op,value}); }
    if(is('name','mem')&&toks[p+1].k==='op'&&toks[p+1].v==='.'&&toks[p+2].k==='name'&&assign(3)){ const name=toks[p+2].v, op=toks[p+3].v; p+=4; const value=expr(); expect(';'); return node('mset',t,{name,op,value}); }
    const e=expr();
    if(assign(0)) err('only a local or mem.name can be assigned to',t);
    expect(';'); return node('expr',t,{e});
  }
  try{
    toks=tokenize(src);
    const first=peek(), body=[];
    while(!is('eof')){ const s=statement(); if(s) body.push(s); }
    return {ok:true,ast:node('prog',first,{body:Object.freeze(body)}),nodes};
  }catch(e){
    if(e instanceof Bad) return fail(e.line,e.col,e.msg);
    throw e;
  }
}

// check(ast, env) -> [{line,col,msg}], empty when the code only touches what env offers and uses it the right way.
// env is a table of what a rule may touch: a leaf is 'num', 'bool', 'str', 'mem' or 'fn(<argument types>)' with an
// optional ':<result type>'; anything else in it is a table of leaves (me.x, Math.abs). The argument type 'who'
// accepts only the bare names me and foe. Types are followed as far as they are certain: a value out of mem can be
// anything, so only what is definitely wrong is reported.
const MEM_NAME=/^[a-z][a-z0-9]{0,11}$/, own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const TYPE_WORD={num:'a number',bool:'true or false',str:'text'};
function check(ast,env){
  const errs=[], err=(n,msg)=>{ if(errs.length<12) errs.push({line:(n&&n.line)||1,col:(n&&n.col)||1,msg}); };
  if(!ast||ast.t!=='prog'||!Array.isArray(ast.body)||!env||typeof env!=='object') return [{line:1,col:1,msg:'nothing to check'}];
  const scopes=[new Map()], mem=new Set(); let locals=0;
  const local=name=>{ for(let i=scopes.length-1;i>=0;i--) if(scopes[i].has(name)) return scopes[i].get(name); return null; };
  const VAL=ty=>({k:'val',ty}), BADREF={k:'bad'};
  const leaf=(n,v,name)=>{
    if(v&&typeof v==='object') return {k:'obj',table:v,name};
    if(v==='num'||v==='bool'||v==='str') return VAL(v);
    if(v==='mem') return {k:'mem'};
    const m=typeof v==='string'&&/^fn\(([a-z, ]*)\)(?::(num|bool|str))?$/.exec(v);
    if(m) return {k:'fn',name,args:m[1].split(',').map(s=>s.trim()).filter(Boolean),ret:m[2]||''};
    err(n,"'"+name+"' cannot be used"); return BADREF;
  };
  const memName=(n,name)=>{
    if(!MEM_NAME.test(name)){ err(n,"'mem."+name+"' is not allowed: a mem name is 1 to 12 lower-case letters and digits, starting with a letter"); return; }
    if(!mem.has(name)){ mem.add(name); if(mem.size===LIMITS.mem+1) err(n,'more than '+LIMITS.mem+' mem names'); }
  };
  const path=n=>n.t==='name'?n.name:n.t==='dot'?path(n.obj)+'.'+n.prop:'that';
  // What a piece of code refers to: a value of some type, nothing (a call with no result), or a thing that is not a
  // value by itself (me, Math, mem, a function).
  function ref(n){
    switch(n.t){
      case 'num': return VAL('num');
      case 'str': return VAL('str');
      case 'bool': return VAL('bool');
      case 'name': {
        const l=local(n.name); if(l) return VAL(l.ty);
        if(own(env,n.name)) return leaf(n,env[n.name],n.name);
        err(n,"unknown name '"+n.name+"'"); return BADREF;
      }
      case 'dot': {
        const o=ref(n.obj), what=path(n.obj);
        if(o.k==='bad') return BADREF;
        if(o.k==='mem'){ memName(n,n.prop); return VAL('any'); }
        if(o.k==='obj'){ if(own(o.table,n.prop)) return leaf(n,o.table[n.prop],what+'.'+n.prop); err(n,"'"+what+"' has no '"+n.prop+"'"); return BADREF; }
        err(n,o.k==='fn'?"'"+what+"' is a function: it can only be called":"'"+what+"' is a value: it has no '"+n.prop+"'"); return BADREF;
      }
      case 'call': {
        const f=ref(n.callee), what=path(n.callee);
        if(f.k!=='fn'){ if(f.k!=='bad') err(n.callee,"'"+what+"' is not a function"); for(const a of n.args) if(a.t!=='name'||(a.name!=='me'&&a.name!=='foe')) value(a); return BADREF; }
        if(n.args.length!==f.args.length) err(n,"'"+what+"' takes "+f.args.length+' argument'+(f.args.length===1?'':'s')+' ('+f.args.join(', ')+') but was given '+n.args.length);
        n.args.forEach((a,i)=>{
          const want=f.args[i];
          if(want==='who'){ if(a.t!=='name'||(a.name!=='me'&&a.name!=='foe')||ref(a).k!=='obj') err(a,'argument '+(i+1)+" of '"+what+"' must be the name me or the name foe"); return; }
          const ty=value(a);
          if(want&&ty!=='any'&&ty!==want) err(a,'argument '+(i+1)+" of '"+what+"' must be "+(TYPE_WORD[want]||want));
        });
        return f.ret?VAL(f.ret):{k:'void',name:what};
      }
      case 'un': {
        const ty=value(n.e);
        if(n.op==='!') return VAL('bool');
        if(ty!=='any'&&ty!=='num') err(n,"'-' needs a number");
        return VAL('num');
      }
      case 'bin': return VAL(binType(n,n.op,value(n.l),value(n.r)));
      case 'cond': { value(n.test); const a=value(n.a), b=value(n.b); return VAL(a===b?a:'any'); }
    }
    err(n,'this cannot be used here'); return BADREF;
  }
  function binType(n,op,a,b){
    const isNum=t=>t==='any'||t==='num';
    if(op==='&&'||op==='||') return a===b?a:'any';
    if(op==='=='||op==='!='||op==='==='||op==='!==') return 'bool';
    if(op==='+'){
      if(a==='bool'||b==='bool'||(a!=='any'&&b!=='any'&&a!==b)){ err(n,"'+' needs two numbers or two pieces of text"); return 'any'; }
      return a==='any'?b:a;
    }
    if(!isNum(a)||!isNum(b)) err(n,"'"+op+"' needs two numbers");
    return op==='<'||op==='<='||op==='>'||op==='>='?'bool':'num';
  }
  function value(n){
    const r=ref(n);
    if(r.k==='val') return r.ty;
    if(r.k==='void') err(n,"'"+r.name+"' gives nothing back, so it cannot be used as a value");
    else if(r.k!=='bad') err(n,"'"+path(n)+"' is not a value by itself"+(r.k==='fn'?': call it':r.k==='mem'?': use mem.name':': use one of its parts, like '+path(n)+'.'+Object.keys(r.table)[0]));
    return 'any';
  }
  function inScope(fn){ scopes.push(new Map()); fn(); scopes.pop(); }
  function stmt(n){
    switch(n.t){
      case 'block': inScope(()=>n.body.forEach(stmt)); return;
      case 'let': {
        const ty=value(n.init);
        if(own(env,n.name)) err(n,"'"+n.name+"' is already the name of something in the game: pick another name");
        else if(local(n.name)) err(n,"'"+n.name+"' is already declared");
        else if(++locals===LIMITS.locals+1) err(n,'more than '+LIMITS.locals+' locals');
        scopes[scopes.length-1].set(n.name,{ty,isConst:!!n.isConst}); return;
      }
      case 'set': {
        const l=local(n.name), ty=value(n.value);
        if(!l){ err(n,own(env,n.name)?"'"+n.name+"' cannot be changed: only locals and mem.name can":"'"+n.name+"' is not declared: use let "+n.name+' = ...'); return; }
        if(l.isConst){ err(n,"'"+n.name+"' is a const and cannot be changed"); return; }
        if(n.op==='=') l.ty=l.ty===ty?ty:'any'; else l.ty=binType(n,n.op[0],l.ty,ty);
        return;
      }
      case 'mset': {
        const ty=value(n.value);
        if(!own(env,'mem')||env.mem!=='mem'||local('mem')){ err(n,'there is no mem here'); return; }
        memName(n,n.name); if(n.op!=='=') binType(n,n.op[0],'any',ty);
        return;
      }
      case 'if': value(n.test); inScope(()=>stmt(n.then)); if(n.else) inScope(()=>stmt(n.else)); return;
      case 'ret': return;
      case 'expr': unused(n.e); return;
    }
    err(n,'this is not a statement');
  }
  // An expression whose result is thrown away: a call that gives nothing back is fine here, also as  test && call();
  function unused(n){
    if(n.t==='call') ref(n);
    else if(n.t==='bin'&&(n.op==='&&'||n.op==='||')){ value(n.l); unused(n.r); }
    else if(n.t==='cond'){ value(n.test); unused(n.a); unused(n.b); }
    else value(n);
  }
  try{ ast.body.forEach(stmt); }catch(e){ err(null,'the code could not be checked'); }     // only a tree that parse did not make can get here
  return errs;
}

// compile(ast, opts) -> run(host). A tree-walking evaluator: the tree is only ever read, never turned into JavaScript.
// host has the shape of the checker's env with real values and functions in it. What keeps a rule inside:
//  - a name is looked up among the rule's own locals, then as an OWN property of host; a.b reads an OWN property of a
//    plain host object; nothing is ever read off a prototype, a function, an array or a value;
//  - the only values are numbers, booleans and strings. A host function is handed those, plus host.me or host.foe when
//    the argument is that bare name, and must give back one of those or nothing;
//  - mem is read and written through hasOwnProperty only, and an unset name reads as 0;
//  - every node visited costs one unit of fuel (opts.fuel, LIMITS.fuel by default), so a run always ends;
//  - whatever goes wrong, a host function throwing included, comes out as a ForgeScript.Fault and as nothing else.
// It does not rely on check() having been run: check is there to tell the author what is wrong before the first run.
class Fault extends Error{ constructor(msg){ super(msg); this.name='ForgeFault'; } }
const MAX_STR=200, VOID=Object.freeze({}), isPrim=v=>typeof v==='number'||typeof v==='boolean'||typeof v==='string';
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function compile(ast,opts){
  if(!ast||ast.t!=='prog'||!Array.isArray(ast.body)) throw new Fault('there is no code to run');
  const maxFuel=opts&&Number.isFinite(+opts.fuel)?+opts.fuel:LIMITS.fuel;
  return function run(host){
    if(!isObj(host)) throw new Fault('there is nothing to run against');
    let fuel=maxFuel; const locals=new Map(), order=[];
    const bad=msg=>{ throw new Fault(msg); }, tick=()=>{ if(--fuel<0) bad('the rule ran for too long'); };
    const get=(o,k,what)=>{ if(typeof k!=='string'||!own(o,k)) bad("there is no '"+what+"'"); return o[k]; };
    const prim=(v,what)=>isPrim(v)?v:bad("'"+what+"' is not a number, true or false, or text");
    const text=v=>typeof v==='string'&&v.length>MAX_STR?bad('a piece of text grew past '+MAX_STR+' characters'):v;
    const path=n=>n&&n.t==='name'?n.name:n&&n.t==='dot'?path(n.obj)+'.'+n.prop:'that';
    const isMem=n=>n&&n.t==='name'&&n.name==='mem'&&!locals.has('mem');
    const memOf=()=>{ const m=own(host,'mem')?host.mem:undefined; return isObj(m)?m:bad('there is no mem here'); };
    // a host object: host.me, host.Math, host.shot ...
    function obj(n){
      tick();
      if(n.t==='name'&&!locals.has(n.name)){ const v=get(host,n.name,n.name); return isObj(v)?v:bad("'"+n.name+"' has no parts"); }
      if(n.t==='dot'&&!isMem(n.obj)){ const v=get(obj(n.obj),n.prop,path(n)); return isObj(v)?v:bad("'"+path(n)+"' has no parts"); }
      bad("'"+path(n)+"' has no parts");
    }
    function call(n){
      tick();
      const c=n.callee, what=path(c); let self, fn;
      if(c&&c.t==='name'&&!locals.has(c.name)){ self=host; fn=get(host,c.name,what); }
      else if(c&&c.t==='dot'&&!isMem(c.obj)){ self=obj(c.obj); fn=get(self,c.prop,what); }
      if(typeof fn!=='function') bad("'"+what+"' is not a function");
      const args=[];
      for(const a of n.args){
        // me and foe, written as bare names, are the only things that are not plain values and may still be handed over
        if(a&&a.t==='name'&&(a.name==='me'||a.name==='foe')&&!locals.has(a.name)){ tick(); const w=get(host,a.name,a.name); args.push(isObj(w)?w:prim(w,a.name)); }
        else args.push(val(a));
      }
      let r;
      try{ r=fn.apply(self,args); }catch(e){ bad("'"+what+"' failed"+(e&&typeof e.message==='string'?': '+e.message.slice(0,120):'')); }
      return r===undefined?VOID:text(prim(r,what+'()'));
    }
    function bin(op,a,b){
      const nums=typeof a==='number'&&typeof b==='number';
      switch(op){
        case '+': return nums?a+b:typeof a==='string'&&typeof b==='string'?text(a+b):bad("'+' needs two numbers or two pieces of text");
        case '==': case '===': return a===b;
        case '!=': case '!==': return a!==b;
      }
      if(!nums) bad("'"+op+"' needs two numbers");
      switch(op){
        case '-': return a-b; case '*': return a*b; case '/': return a/b; case '%': return a%b;
        case '<': return a<b; case '<=': return a<=b; case '>': return a>b; case '>=': return a>=b;
      }
      bad('unknown operator');
    }
    // a value: always a number, a boolean or a string
    function val(n){
      tick();
      switch(n&&n.t){
        case 'num': return typeof n.v==='number'?n.v:bad('not a number');
        case 'str': return typeof n.v==='string'?n.v:bad('not text');
        case 'bool': return n.v===true;
        case 'name': { const l=locals.get(n.name); return l?l.v:prim(get(host,n.name,n.name),n.name); }
        case 'dot': {
          if(isMem(n.obj)){ const m=memOf(); return typeof n.prop==='string'&&own(m,n.prop)?prim(m[n.prop],'mem.'+n.prop):0; }
          return prim(get(obj(n.obj),n.prop,path(n)),path(n));
        }
        case 'call': { const r=call(n); return r===VOID?bad("'"+path(n.callee)+"' gives nothing back"):r; }
        case 'un': { const v=val(n.e); return n.op==='!'?!v:n.op==='-'&&typeof v==='number'?-v:bad("'-' needs a number"); }
        case 'bin': {
          if(n.op==='&&'){ const l=val(n.l); return l?val(n.r):l; }
          if(n.op==='||'){ const l=val(n.l); return l?l:val(n.r); }
          const l=val(n.l); return bin(n.op,l,val(n.r));
        }
        case 'cond': return val(n.test)?val(n.a):val(n.b);
      }
      bad('this is not a value');
    }
    // an expression used as a statement: its result is dropped, so a call that gives nothing back is fine
    function unused(n){
      if(n&&n.t==='call') call(n);
      else if(n&&n.t==='bin'&&n.op==='&&'){ tick(); if(val(n.l)) unused(n.r); }
      else if(n&&n.t==='bin'&&n.op==='||'){ tick(); if(!val(n.l)) unused(n.r); }
      else if(n&&n.t==='cond'){ tick(); unused(val(n.test)?n.a:n.b); }
      else val(n);
    }
    // a statement: true means a return was reached
    function exec(n){
      tick();
      switch(n&&n.t){
        case 'block': {
          if(!Array.isArray(n.body)) bad('not a block');
          const start=order.length;
          for(const s of n.body) if(exec(s)) return true;
          while(order.length>start) locals.delete(order.pop());
          return false;
        }
        case 'let': {
          const v=val(n.init);
          if(typeof n.name!=='string'||locals.has(n.name)||own(host,n.name)) bad("'"+n.name+"' is already taken");
          if(locals.size>=LIMITS.locals) bad('more than '+LIMITS.locals+' locals');
          locals.set(n.name,{v,isConst:!!n.isConst}); order.push(n.name); return false;
        }
        case 'set': {
          const v=val(n.value), l=locals.get(n.name);
          if(!l) bad("'"+n.name+"' is not a local");
          if(l.isConst) bad("'"+n.name+"' is a const");
          l.v=n.op==='='?v:assignOp(n.op,l.v,v); return false;
        }
        case 'mset': {
          const v=val(n.value), m=memOf(), name=n.name;
          if(typeof name!=='string'||!MEM_NAME.test(name)) bad("'mem."+name+"' is not an allowed mem name");
          const had=own(m,name);
          if(!had&&Object.keys(m).length>=LIMITS.mem) bad('more than '+LIMITS.mem+' mem names');
          m[name]=n.op==='='?v:assignOp(n.op,had?prim(m[name],'mem.'+name):0,v); return false;
        }
        case 'if': if(val(n.test)) return exec(n.then); return n.else?exec(n.else):false;
        case 'ret': return true;
        case 'expr': unused(n.e); return false;
      }
      bad('this is not a statement');
    }
    const assignOp=(op,a,b)=>ASSIGN.includes(op)&&op!=='='?bin(op[0],a,b):bad('unknown assignment');
    try{ for(const s of ast.body) if(exec(s)) break; }
    catch(e){ if(e instanceof Fault) throw e; throw new Fault('the rule broke'+(e&&typeof e.message==='string'?': '+e.message.slice(0,120):'')); }
  };
}

return {parse,check,compile,LIMITS,Fault};
});
