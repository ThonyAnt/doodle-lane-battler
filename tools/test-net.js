// Netcode tests: the hand-written WebSocket (ws.js), and further down the binary packing and deltas (wire.js), the
// server's socket rooms and the page's choice of link.
// Run: node tools/test-net.js      (the room tests start a child `node server.js` on port 3195)
const fs=require('fs'), path=require('path'), http=require('http'), net=require('net'), cp=require('child_process');
const W=require('../ws.js');
let bad=0; const ok=(name,cond,info)=>{ if(!cond) bad++; console.log((cond?'ok   ':'FAIL ')+name+(info!==undefined?'  '+JSON.stringify(info):'')); };
// A test that throws (a function that is not written yet, say) fails by name and the rest still run.
const test=(name,fn)=>{ try{ const r=fn(); if(Array.isArray(r)) ok(name,r[0],r[1]); else ok(name,r); }catch(e){ ok(name,false,String(e&&e.message||e)); } };

/* ---------- 1. the frame codec (the examples are from RFC 6455 section 5.7) ---------- */
const hex=s=>Buffer.from(s.replace(/\s/g,''),'hex');
// Everything a decoder makes of some bytes: the frames it hands on, and the first error it reports.
function feed(chunks,opts){ const out={frames:[],err:null}, push=W.createDecoder(Object.assign({onFrame:(opcode,payload)=>out.frames.push({opcode,payload}),onError:e=>{ out.err=out.err||e; }},opts)); for(const c of chunks) push(c); return out; }
const dec=(buf,opts)=>feed([buf],opts).frames;
const decSlow=(buf,opts)=>feed(Array.from(buf,(_,i)=>buf.subarray(i,i+1)),opts).frames;
const errOf=(buf,opts)=>feed([buf],opts).err;
test('unmasked text "Hello"',()=>W.encodeFrame(1,Buffer.from('Hello')).equals(hex('81 05 48 65 6c 6c 6f')));
test('masked text "Hello" decodes',()=>dec(hex('81 85 37 fa 21 3d 7f 9f 4d 51 58'))[0].payload.toString()==='Hello');
test('fragments join',()=>dec(Buffer.concat([hex('01 03 48 65 6c'),hex('80 02 6c 6f')]),{requireMask:false})[0].payload.toString()==='Hello');
test('ping is opcode 9',()=>dec(hex('89 05 48 65 6c 6c 6f'),{requireMask:false})[0].opcode===9);
test('256 bytes use the 16-bit length',()=>W.encodeFrame(2,Buffer.alloc(256)).subarray(0,4).equals(hex('82 7E 01 00')));
test('65536 bytes use the 64-bit length',()=>W.encodeFrame(2,Buffer.alloc(65536)).subarray(0,10).equals(hex('82 7F 00 00 00 00 00 01 00 00')));
test('a frame fed one byte at a time still decodes',()=>decSlow(W.encodeFrame(1,Buffer.from('Hello'),{mask:true}))[0].payload.toString()==='Hello');
test('two frames in one chunk both arrive',()=>dec(Buffer.concat([W.encodeFrame(1,Buffer.from('a'),{mask:true}),W.encodeFrame(1,Buffer.from('b'),{mask:true})])).length===2);
test('an unmasked client frame is an error',()=>errOf(hex('81 05 48 65 6c 6c 6f'))!==null);
test('a 2 MiB frame is an error',()=>errOf(W.encodeFrame(2,Buffer.alloc(2<<20),{mask:true}))!==null);
// Beyond the plan's list: the corners of the RFC a real browser or proxy can reach.
test('a masked frame carries the mask bit, its key, and the payload XORed with the key',()=>{ const f=W.encodeFrame(1,Buffer.from('Hello'),{mask:true}), key=f.subarray(2,6);
  return f.length===11&&f[0]===0x81&&f[1]===0x85&&Buffer.from(f.subarray(6).map((b,i)=>b^key[i&3])).toString()==='Hello'; });
test('two masked frames do not share a key',()=>{ const keys=new Set(Array.from({length:8},()=>W.encodeFrame(1,Buffer.from('x'),{mask:true}).subarray(2,6).toString('hex'))); return keys.size>1; });
test('every length around the three size classes survives, masked and not',()=>[0,1,125,126,127,65535,65536,70000].every(n=>{ const p=Buffer.from(Array.from({length:n},(_,i)=>i*7&255));
  return dec(W.encodeFrame(2,p,{mask:true}))[0].payload.equals(p)&&dec(W.encodeFrame(2,p),{requireMask:false})[0].payload.equals(p); }));
test('exactly 1 MiB is allowed',()=>{ const r=feed([W.encodeFrame(2,Buffer.alloc(1<<20),{mask:true})]); return r.err===null&&r.frames[0].payload.length===1<<20; });
test('fragments that add up to more than 1 MiB are an error',()=>{ const part=Buffer.alloc(600000), a=W.encodeFrame(2,part,{mask:true}), b=W.encodeFrame(0,part,{mask:true}); a[0]&=0x7f; return feed([a,b]).err!==null; });
test('a ping between two fragments arrives first and the message still joins',()=>{ const fr=dec(Buffer.concat([hex('01 03 48 65 6c'),hex('89 00'),hex('80 02 6c 6f')]),{requireMask:false});
  return [fr.length===2&&fr[0].opcode===9&&fr[1].opcode===1&&fr[1].payload.toString()==='Hello',fr.map(f=>f.opcode)]; });
test('a continuation with nothing to continue is an error',()=>errOf(hex('80 02 6c 6f'),{requireMask:false})!==null);
test('a new message inside an unfinished one is an error',()=>errOf(Buffer.concat([hex('01 03 48 65 6c'),hex('81 02 6c 6f')]),{requireMask:false})!==null);
test('a fragmented or oversized control frame is an error',()=>errOf(hex('09 00'),{requireMask:false})!==null&&errOf(Buffer.concat([hex('89 7e 00 7e'),Buffer.alloc(126)]),{requireMask:false})!==null);
test('reserved bits and unknown opcodes are errors',()=>errOf(hex('c1 00'),{requireMask:false})!==null&&errOf(hex('83 00'),{requireMask:false})!==null&&errOf(hex('8b 00'),{requireMask:false})!==null);
test('after an error nothing more is handed on',()=>{ const r=feed([hex('81 05 48 65 6c 6c 6f'),W.encodeFrame(1,Buffer.from('later'),{mask:true})]); return r.err!==null&&r.frames.length===0; });
test('frames split anywhere across chunks decode the same',()=>{ const all=Buffer.concat([W.encodeFrame(1,Buffer.from('one'),{mask:true}),W.encodeFrame(2,Buffer.alloc(300,7),{mask:true}),W.encodeFrame(9,Buffer.from('p'),{mask:true}),W.encodeFrame(1,Buffer.from('four'),{mask:true})]);
  for(let cut=1;cut<all.length;cut+=3){ const fr=feed([all.subarray(0,cut),all.subarray(cut)]).frames; if(fr.length!==4||fr[0].payload.toString()!=='one'||fr[1].payload.length!==300||fr[2].opcode!==9||fr[3].payload.toString()!=='four') return [false,cut]; } return true; });

console.log(bad?bad+' failed':'all net tests pass'); process.exit(bad?1:0);
