// How a match's state crosses a socket: any JSON value packed into bytes, and the difference between two values as a
// patch. The server (duel-server.js) and the page (duel.html) both load this file: require('./wire.js') or window.Wire.
// Nothing here knows what a snapshot contains, so a field another feature adds needs no change.
(function(root,factory){ const W=factory(); if(typeof module==='object'&&module.exports) module.exports=W; else root.Wire=W; })(typeof self!=='undefined'?self:this,function(){
'use strict';

/* ---------- values as JSON sees them ---------- */
const isObj=v=>v!==null&&typeof v==='object', has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const gone=v=>v===undefined||typeof v==='function';      // what JSON leaves out of an object
// A value that is not a list or an object, as JSON would carry it: no undefined, no NaN or Infinity, no -0.
const prim=v=>gone(v)?null:typeof v==='number'?(isFinite(v)?(v===0?0:v):null):v;
const keysOf=o=>{ const ks=Object.keys(o), out=[]; for(let i=0;i<ks.length;i++) if(!gone(o[ks[i]])) out.push(ks[i]); return out; };
// A key named __proto__ must become an ordinary field, as it does in JSON.parse, and not the object's prototype.
const setKey=(o,k,v)=>{ if(k==='__proto__') Object.defineProperty(o,k,{value:v,enumerable:true,writable:true,configurable:true}); else o[k]=v; };
// A deep copy holding exactly what JSON.parse(JSON.stringify(v)) would, sharing nothing with v.
function clone(v){
  if(!isObj(v)) return prim(v);
  if(Array.isArray(v)){ const out=new Array(v.length); for(let i=0;i<v.length;i++) out[i]=clone(v[i]); return out; }
  const out={}, ks=Object.keys(v); for(let i=0;i<ks.length;i++){ const x=v[ks[i]]; if(!gone(x)) setKey(out,ks[i],clone(x)); } return out;
}
// The same value as JSON sees it: the same fields in the same order.
function equal(a,b){
  if(a===b) return true;
  const oa=isObj(a), ob=isObj(b);
  if(!oa||!ob) return !oa&&!ob&&prim(a)===prim(b);
  const arr=Array.isArray(a); if(arr!==Array.isArray(b)) return false;
  if(arr){ if(a.length!==b.length) return false; for(let i=0;i<a.length;i++) if(!equal(a[i],b[i])) return false; return true; }
  const ka=keysOf(a), kb=keysOf(b); if(ka.length!==kb.length) return false;
  for(let i=0;i<ka.length;i++) if(ka[i]!==kb[i]||!equal(a[ka[i]],b[kb[i]])) return false;
  return true;
}

/* ---------- packing ----------
   One tag byte, then what the tag calls for:
     0 null   1 false   2 true
     3 integer: a zigzag varint          4 any other number: 8 bytes, little-endian float64
     5, 6, 7 a number with one, two or three decimals: the zigzag varint of it times 10, 100 or 1000
             (only when dividing back gives the very same number, so nothing is rounded)
     8 a string: varint byte length, then UTF-8     9 a string sent before: varint of its place in the dictionary
     10 a list: varint count, then the values       11 an object: varint count, then key (a string) and value, in turn
     0x10-0x1f a list of 0 to 15 values    0x20-0x2f an object of 0 to 15 fields
     0x40-0x7f the integers 0 to 63        0x80-0xff the first 128 strings of the dictionary
   The dictionary: every string of 1 to 48 characters, key or value, takes the next place the first time it is spelt
   out, until 4096 places are taken. Both ends build it from the bytes alone, so a codec packs (or unpacks) for one
   direction of one connection, and everything packed must be unpacked, once and in order. */
const T_NULL=0,T_FALSE=1,T_TRUE=2,T_INT=3,T_F64=4,T_DEC1=5,T_DEC2=6,T_DEC3=7,T_STR=8,T_REF=9,T_ARR=10,T_OBJ=11,S_ARR=0x10,S_OBJ=0x20,S_INT=0x40,S_REF=0x80;
const DICT_MAX=4096, DICT_STR=48, INT_MAX=1125899906842624;      // 2^50: twice it still fits a float64 exactly
const utf8=new TextEncoder(), text=new TextDecoder();
function createCodec(){
  const ids=new Map(), strs=[], f8=new DataView(new ArrayBuffer(8));      // ids: the packing side's dictionary; strs: the unpacking side's
  let buf=new Uint8Array(2048), n=0;
  const room=k=>{ if(n+k>buf.length){ const b=new Uint8Array(Math.max(buf.length*2,n+k)); b.set(buf.subarray(0,n)); buf=b; } };
  const varint=v=>{ room(9); while(v>=128){ buf[n++]=(v%128)|128; v=Math.floor(v/128); } buf[n++]=v; };
  const zigzag=v=>varint(v<0?-2*v-1:2*v);
  const tagged=(t,v)=>{ room(1); buf[n++]=t; zigzag(v); };
  function str(s){
    const id=ids.get(s);
    if(id!==undefined){ if(id<128){ room(1); buf[n++]=S_REF|id; } else{ room(1); buf[n++]=T_REF; varint(id); } return; }
    const b=utf8.encode(s); room(1); buf[n++]=T_STR; varint(b.length); room(b.length); buf.set(b,n); n+=b.length;
    if(s.length&&s.length<=DICT_STR&&ids.size<DICT_MAX) ids.set(s,ids.size);
  }
  function num(v){
    if(!isFinite(v)){ room(1); buf[n++]=T_NULL; return; }
    if(Number.isInteger(v)&&v>=-INT_MAX&&v<=INT_MAX){ if(v>=0&&v<64){ room(1); buf[n++]=S_INT|v; } else tagged(T_INT,v); return; }
    let m=Math.round(v*10); if(m/10===v&&m>=-INT_MAX&&m<=INT_MAX) return tagged(T_DEC1,m);
    m=Math.round(v*100); if(m/100===v&&m>=-INT_MAX&&m<=INT_MAX) return tagged(T_DEC2,m);
    m=Math.round(v*1000); if(m/1000===v&&m>=-INT_MAX&&m<=INT_MAX) return tagged(T_DEC3,m);
    room(9); buf[n++]=T_F64; f8.setFloat64(0,v,true); for(let i=0;i<8;i++) buf[n++]=f8.getUint8(i);
  }
  function put(v){
    if(typeof v==='number') return num(v);
    if(typeof v==='string') return str(v);
    if(v===true||v===false){ room(1); buf[n++]=v?T_TRUE:T_FALSE; return; }
    if(!isObj(v)){ room(1); buf[n++]=T_NULL; return; }      // null, and what JSON turns into null inside a list
    if(Array.isArray(v)){ const k=v.length; room(1); if(k<16) buf[n++]=S_ARR|k; else{ buf[n++]=T_ARR; varint(k); } for(let i=0;i<k;i++) put(v[i]); return; }
    const ks=keysOf(v), k=ks.length; room(1); if(k<16) buf[n++]=S_OBJ|k; else{ buf[n++]=T_OBJ; varint(k); }
    for(let i=0;i<k;i++){ str(ks[i]); put(v[ks[i]]); }
  }
  // value -> bytes (a Uint8Array of its own).
  function pack(value){ n=0; put(value); return buf.slice(0,n); }
  // bytes -> value. Throws (the message starts "wire:") if the bytes are not one whole packed value; the codec is then
  // out of step with the other end and the connection it belongs to has to be dropped.
  function unpack(bytes){
    const len=bytes.length; let i=0;
    const need=k=>{ if(i+k>len) throw new Error('wire: the data ends early'); };
    const varint=()=>{ let v=0, m=1, b; do{ need(1); b=bytes[i++]; v+=(b&127)*m; m*=128; if(m>72057594037927936&&(b&128)) throw new Error('wire: a number that is too long'); }while(b&128); return v; };
    const zigzag=()=>{ const z=varint(); return z%2?-(z+1)/2:z/2; };
    const ref=id=>{ if(id>=strs.length) throw new Error('wire: a string that was never sent'); return strs[id]; };
    const lit=()=>{ const k=varint(); need(k); const s=text.decode(bytes.subarray(i,i+k)); i+=k; if(s.length&&s.length<=DICT_STR&&strs.length<DICT_MAX) strs.push(s); return s; };
    const key=()=>{ need(1); const t=bytes[i++]; if(t&S_REF) return ref(t&127); if(t===T_REF) return ref(varint()); if(t===T_STR) return lit(); throw new Error('wire: a field name that is not a string'); };
    const list=k=>{ if(k>len-i) throw new Error('wire: the data ends early'); const out=new Array(k); for(let j=0;j<k;j++) out[j]=get(); return out; };
    const obj=k=>{ if(k>len-i) throw new Error('wire: the data ends early'); const out={}; for(let j=0;j<k;j++){ const name=key(); setKey(out,name,get()); } return out; };
    function get(){
      need(1); const t=bytes[i++];
      if(t&S_REF) return ref(t&127);
      if(t&S_INT) return t&63;
      if((t&0xf0)===S_OBJ) return obj(t&15);
      if((t&0xf0)===S_ARR) return list(t&15);
      switch(t){
        case T_NULL: return null; case T_FALSE: return false; case T_TRUE: return true;
        case T_INT: return zigzag(); case T_DEC1: return zigzag()/10; case T_DEC2: return zigzag()/100; case T_DEC3: return zigzag()/1000;
        case T_F64: { need(8); for(let j=0;j<8;j++) f8.setUint8(j,bytes[i++]); return f8.getFloat64(0,true); }
        case T_STR: return lit(); case T_REF: return ref(varint());
        case T_ARR: return list(varint()); case T_OBJ: return obj(varint());
      }
      throw new Error('wire: an unknown tag '+t);
    }
    const value=get(); if(i!==len) throw new Error('wire: bytes left over'); return value;
  }
  return {pack,unpack};
}

/* ---------- deltas ----------
   diff(prev, cur) is undefined when the two are the same to JSON, else a patch: a small list that packs like any value.
     [0, value]                        the value itself, replacing whatever was there
     [1, set, sub, del, order]         an object: set holds the fields with a new value (also the new fields), sub holds a
                                       patch for each field that is itself patched, del lists the fields that went, and
                                       order lists every field in its new order when that is not the old order with the
                                       new fields at the end. 0 stands for an empty part; empty parts at the end are left off.
     [2, del, changed, added, order]   a list whose members all carry an id (the shots): the ids that went, then
                                       id, patch, id, patch... for those that changed, the new members, and the ids in
                                       their new order when that is not the old order with the new members at the end.
     [3, i, patch, i, patch...]        a list of the same length as before: only the places that changed.
   Any other list is sent whole when it differs. apply(prev, patch) builds the new value; prev is not changed, and the
   parts of it that did not change are shared with the result. */
const REPLACE=0, OBJECT=1, BYID=2, INDEX=3;
function diff(a,b){
  if(a===b) return undefined;
  const oa=isObj(a), ob=isObj(b);
  if(!oa||!ob) return !oa&&!ob&&prim(a)===prim(b)?undefined:[REPLACE,b];
  const arr=Array.isArray(b);
  if(arr!==Array.isArray(a)) return [REPLACE,b];
  return arr?diffList(a,b):diffObject(a,b);
}
function diffObject(a,b){
  const ka=keysOf(a), kb=keysOf(b); let set=null, sub=null, del=null, order=null, kept=0, sameKeys=ka.length===kb.length;
  for(let i=0;sameKeys&&i<ka.length;i++) if(ka[i]!==kb[i]) sameKeys=false;
  for(let i=0;i<kb.length;i++){
    const k=kb[i];
    if(!sameKeys&&(!has(a,k)||gone(a[k]))){ setKey(set=set||{},k,b[k]); continue; }      // a new field
    const d=diff(a[k],b[k]);
    if(d===undefined) kept++; else if(d[0]===REPLACE) setKey(set=set||{},k,d[1]); else setKey(sub=sub||{},k,d);
  }
  if(!sameKeys){
    const stay=[]; for(let i=0;i<ka.length;i++){ const k=ka[i]; if(has(b,k)&&!gone(b[k])) stay.push(k); else (del=del||[]).push(k); }
    for(let i=0;i<kb.length;i++) if(!has(a,kb[i])||gone(a[kb[i]])) stay.push(kb[i]);      // where apply would put the fields with no order given
    for(let i=0;i<kb.length;i++) if(stay[i]!==kb[i]){ order=kb; break; }
  }
  if(!set&&!sub&&!del&&!order) return undefined;
  if(!kept&&!sub) return [REPLACE,b];      // nothing of the old object is left: the new one is no longer than a patch
  const p=[OBJECT,set||0]; if(sub||del||order) p.push(sub||0); if(del||order) p.push(del||0); if(order) p.push(order);
  return p;
}
// The members of a list by their id, if every one is an object with an id of its own and no id comes twice; else null.
function byId(list){
  if(!list.length) return null;
  const m=new Map();
  for(let i=0;i<list.length;i++){ const el=list[i]; if(!isObj(el)||Array.isArray(el)) return null; const id=el.id; if((typeof id!=='string'&&!(typeof id==='number'&&isFinite(id)))||m.has(id)) return null; m.set(id,el); }
  return m;
}
function diffList(a,b){
  const ma=byId(a), mb=ma&&byId(b);
  if(mb){
    let del=null, changed=null, added=null, order=null; const stay=[];
    for(let i=0;i<a.length;i++){ const id=a[i].id; if(mb.has(id)) stay.push(id); else (del=del||[]).push(id); }
    if(!stay.length) return [REPLACE,b];
    for(let i=0;i<b.length;i++){ const el=b[i], old=ma.get(el.id); if(old===undefined){ (added=added||[]).push(el); stay.push(el.id); } else{ const d=diff(old,el); if(d!==undefined) (changed=changed||[]).push(el.id,d); } }
    for(let i=0;i<b.length;i++) if(stay[i]!==b[i].id){ order=b.map(el=>el.id); break; }
    if(!del&&!changed&&!added&&!order) return undefined;
    const p=[BYID,del||0]; if(changed||added||order) p.push(changed||0); if(added||order) p.push(added||0); if(order) p.push(order);
    return p;
  }
  if(a.length===b.length&&b.some(isObj)){
    let p=null, whole=true;
    for(let i=0;i<b.length;i++){ const d=diff(a[i],b[i]); if(d===undefined) whole=false; else{ (p=p||[INDEX]).push(i,d); if(d[0]!==REPLACE) whole=false; } }
    return !p?undefined:whole?[REPLACE,b]:p;
  }
  return equal(a,b)?undefined:[REPLACE,b];
}
const unfit=()=>{ throw new Error('wire: a patch that does not fit the value it is for'); };
function apply(a,p){
  if(p===undefined||p===null) return a;
  if(!Array.isArray(p)) unfit();
  switch(p[0]){
    case REPLACE: return p[1];
    case OBJECT: {
      if(!isObj(a)||Array.isArray(a)) unfit();
      const set=p[1]||null, sub=p[2]||null, del=p[3]||null, order=p[4]||null, out={};
      const now=k=>set&&has(set,k)?set[k]:sub&&has(sub,k)?apply(a[k],sub[k]):a[k];
      if(order){ for(let i=0;i<order.length;i++) setKey(out,order[i],now(order[i])); return out; }
      const ks=keysOf(a); for(let i=0;i<ks.length;i++){ const k=ks[i]; if(!del||del.indexOf(k)<0) setKey(out,k,now(k)); }
      if(set){ const ns=Object.keys(set); for(let i=0;i<ns.length;i++) if(!has(out,ns[i])) setKey(out,ns[i],set[ns[i]]); }
      return out;
    }
    case BYID: {
      if(!Array.isArray(a)) unfit();
      const del=p[1]||null, changed=p[2]||null, added=p[3]||null, order=p[4]||null, patch=new Map(); let out=[];
      if(changed) for(let i=0;i<changed.length;i+=2) patch.set(changed[i],changed[i+1]);
      for(let i=0;i<a.length;i++){ const el=a[i]; if(!isObj(el)) unfit(); if(del&&del.indexOf(el.id)>=0) continue; out.push(patch.has(el.id)?apply(el,patch.get(el.id)):el); }
      if(added) for(let i=0;i<added.length;i++) out.push(added[i]);
      if(order){ const by=new Map(); for(let i=0;i<out.length;i++) by.set(out[i].id,out[i]); out=order.map(id=>by.has(id)?by.get(id):unfit()); }
      return out;
    }
    case INDEX: {
      if(!Array.isArray(a)) unfit();
      const out=a.slice(); for(let i=1;i<p.length;i+=2){ if(!(p[i]>=0&&p[i]<out.length)) unfit(); out[p[i]]=apply(a[p[i]],p[i+1]); }
      return out;
    }
  }
  return unfit();
}

/* ---------- state frames ----------
   What goes down a socket for every snapshot of the match. Byte 0 is 1 (the whole snapshot) or 2 (a delta); then, as
   varints, the frame's number (1, 2, 3...), for a delta the number of the snapshot it is a patch against, and the
   sender's clock in milliseconds; then one packed value: the snapshot, or the patch (null when nothing changed).
   The other end says which snapshot it holds (ack). A delta is always against the newest one it has said it holds, if
   the sender still has that among the last 32 it sent; if not, and once every two seconds anyway, the frame is whole.
   So an end that never acknowledges, or has lost its place, is still sent everything it needs. */
const FULL=1, DELTA=2;
function header(bytes){
  if(!bytes||bytes.length<3||(bytes[0]!==FULL&&bytes[0]!==DELTA)) throw new Error('wire: not a state frame');
  let i=1; const varint=()=>{ let v=0, m=1, b; do{ if(i>=bytes.length||m>72057594037927936) throw new Error('wire: not a state frame'); b=bytes[i++]; v+=(b&127)*m; m*=128; }while(b&128); return v; };
  const seq=varint(), base=bytes[0]===DELTA?varint():0, serverMs=varint();
  return {kind:bytes[0],seq,base,serverMs,at:i};      // at: where the packed value starts
}
// The sending end of one connection. frame(snap, nowMs) is the bytes for the next snapshot; snap must not be changed
// afterwards (the sender keeps it to patch against). ack(n): the other end holds snapshot n.
function createSender(opts){
  const keep=(opts&&opts.keep)||32, fullMs=(opts&&opts.fullMs)||2000, codec=createCodec(), sent=[];
  let seq=0, acked=0, fullAt=-Infinity;
  return {
    ack(n){ if(Number.isInteger(n)&&n>acked&&n<=seq) acked=n; },
    frame(snap,nowMs){
      let base=null; for(let i=sent.length-1;i>=0&&!base;i--) if(sent[i].seq===acked) base=sent[i];
      const full=!base||nowMs-fullAt>=fullMs, head=[full?FULL:DELTA], varint=v=>{ while(v>=128){ head.push((v%128)|128); v=Math.floor(v/128); } head.push(v); };
      seq++; varint(seq); if(!full) varint(base.seq); varint(Math.max(0,Math.floor(nowMs)));
      const body=codec.pack(full?snap:(diff(base.snap,snap)||null)), out=new Uint8Array(head.length+body.length);
      out.set(head,0); out.set(body,head.length);
      sent.push({seq,snap}); if(sent.length>keep) sent.shift(); if(full) fullAt=nowMs;
      return out;
    }
  };
}
// The receiving end. read(bytes) gives {kind, seq, base, serverMs, snap}: snap is the caller's own copy of the snapshot,
// to change as it likes. Every frame must be read, in order. It throws (the message starts "wire:") on a frame it
// cannot follow; the connection then has to be dropped and made again.
function createReceiver(opts){
  const keep=(opts&&opts.keep)||64, codec=createCodec(), held=new Map();      // number -> snapshot, oldest first, never changed once held
  return {
    read(bytes){
      const h=header(bytes), value=codec.unpack(bytes.subarray(h.at)); let snap=value;
      if(h.kind===DELTA){
        if(!held.has(h.base)) throw new Error('wire: a delta against a snapshot this end does not hold');
        snap=apply(held.get(h.base),value);
        for(const k of held.keys()){ if(k<h.base) held.delete(k); else break; }      // the sender never goes back to an older one
      }
      held.set(h.seq,snap); if(held.size>keep) held.delete(held.keys().next().value);
      return {kind:h.kind,seq:h.seq,base:h.base,serverMs:h.serverMs,snap:clone(snap)};
    }
  };
}

return {createCodec,diff,apply,clone,equal,header,createSender,createReceiver,FULL,DELTA};
});
