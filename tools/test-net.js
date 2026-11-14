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

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Waits until cond() is true (checked every 10 ms); false if it is still not after ms.
const until=async(cond,ms)=>{ const t0=Date.now(); while(!cond()){ if(Date.now()-t0>ms) return false; await sleep(10); } return true; };
const atest=async(name,fn)=>{ try{ const r=await fn(); if(Array.isArray(r)) ok(name,r[0],r[1]); else ok(name,r); }catch(e){ ok(name,false,String(e&&e.message||e)); } };
(async()=>{
/* ---------- 2. the handshake and sockets, against a small server in this process ---------- */
test('accept key matches the RFC example',()=>W.acceptKey('dGhlIHNhbXBsZSBub25jZQ==')==='s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
{ const srv=http.createServer((req,res)=>{ res.writeHead(404); res.end(); }), closes={server:0,client:0}, seen={};      // seen: what the server side noticed
  await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const port=srv.address().port, at='ws://127.0.0.1:'+port;
  // A bare TCP client: sends these lines as the request, then keeps whatever comes back.
  const raw=(lines,then)=>new Promise(done=>{ const got={bytes:Buffer.alloc(0),closed:false,tcp:null}, tcp=got.tcp=net.connect(port,'127.0.0.1',()=>{ tcp.write(lines.join('\r\n')+'\r\n\r\n'); if(then) then(tcp); });
    tcp.on('data',d=>{ got.bytes=Buffer.concat([got.bytes,d]); }); tcp.on('close',()=>{ got.closed=true; }); tcp.on('error',()=>{}); setTimeout(()=>done(got),150); });
  const shake=p=>['GET '+p+' HTTP/1.1','Host: x','Upgrade: websocket','Connection: Upgrade','Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==','Sec-WebSocket-Version: 13'];
  try{
    W.attach(srv,'/echo',(sock,req)=>{ seen.url=req.url; sock.on('message',(d,isBinary)=>{ if(d==='bye') sock.close(); else sock.send(d); }); sock.on('close',()=>{ seen[req.url]=(seen[req.url]||0)+1; }); });
    W.attach(srv,'/shout',sock=>{ sock.on('message',d=>sock.send(String(d).toUpperCase())); });
    W.attach(srv,'/idle',sock=>{ seen.idle=sock; sock.on('close',()=>{ seen.idleClosed=Date.now(); }); },{pingMs:40});
    W.attach(srv,'/flood',sock=>{ seen.flood=sock; sock.on('close',()=>{ seen.floodClosed=true; }); },{maxBuffered:256<<10});
    await atest('a client connects, text and binary echo back',async()=>{ const c=await W.connect(at+'/echo?room=AB'), got=[]; c.on('message',(d,isBinary)=>got.push([d,isBinary]));
      c.send('hi'); c.send(Buffer.from([1,2,3])); await until(()=>got.length>=2,1000); const echoText=got[0]&&got[0][0], echoBin=got[1]&&got[1][0]; c.close();
      return [echoText==='hi'&&got[0][1]===false&&Buffer.isBuffer(echoBin)&&echoBin.equals(Buffer.from([1,2,3]))&&got[1][1]===true&&seen.url==='/echo?room=AB',got.length]; });
    await atest('a wrong path gets no upgrade',async()=>{ let wrongPathStatus=0, wrongPathClosed=false; try{ const c=await W.connect(at+'/nope'); wrongPathClosed=await until(()=>c.closed,500); }catch(e){ wrongPathStatus=e.status; }
      return [wrongPathStatus===404||wrongPathClosed,{wrongPathStatus,wrongPathClosed}]; });
    await atest('closing from either end fires close once on the other',async()=>{
      const a=await W.connect(at+'/echo?who=a'); a.close(); await until(()=>seen['/echo?who=a'],1000);                                    // the client closes: the server hears it
      const b=await W.connect(at+'/echo?who=b'); b.on('close',()=>{ closes.client++; }); b.send('bye'); await until(()=>closes.client,1000);      // the server closes: the client hears it
      await sleep(100); closes.server=seen['/echo?who=a']; return [closes.server===1&&closes.client===1&&a.closed&&b.closed&&seen['/echo?who=b']===1,closes]; });
    // Beyond the plan's list.
    await atest('two paths on one server each get their own sockets',async()=>{ const c=await W.connect(at+'/shout'), got=[]; c.on('message',d=>got.push(d)); c.send('héllo ✓'); await until(()=>got.length,1000); c.close(); return [got[0]==='HÉLLO ✓',got]; });
    await atest('a 300 kB message crosses in one piece',async()=>{ const c=await W.connect(at+'/echo'), big=Buffer.from(Array.from({length:300000},(_,i)=>i*31&255)), got=[]; c.on('message',d=>got.push(d)); c.send(big); await until(()=>got.length,3000); c.close(); return got.length===1&&got[0].equals(big); });
    await atest('a typed array is sent as binary',async()=>{ const c=await W.connect(at+'/echo'), got=[]; c.on('message',(d,b)=>got.push([d,b])); c.send(new Uint8Array([9,8,7]).subarray(1)); await until(()=>got.length,1000); c.close(); return got[0][1]===true&&got[0][0].equals(Buffer.from([8,7])); });
    await atest('a ping is answered with a pong that carries the same bytes',async()=>{ const c=await W.connect(at+'/echo'), got=[]; c.on('pong',d=>got.push(d.toString())); c.ping(Buffer.from('abc')); await until(()=>got.length,1000); c.close(); return [got[0]==='abc',got]; });
    await atest('a frame sent in the same breath as the handshake is not lost',async()=>{ const r=await raw(shake('/shout'),tcp=>tcp.write(W.encodeFrame(1,Buffer.from('quick'),{mask:true}))), text=r.bytes.toString('latin1'); r.tcp.destroy();
      return [/^HTTP\/1\.1 101 /.test(text)&&/sec-websocket-accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=\r\n/i.test(text)&&text.endsWith('\x81\x05QUICK'),text.slice(-12)]; });
    await atest('a handshake without a key, or for another version, is refused',async()=>{ const noKey=await raw(shake('/echo').filter(l=>!/^Sec-WebSocket-Key/.test(l))), old=await raw(shake('/echo').map(l=>l.replace('Version: 13','Version: 8')));
      return [/^HTTP\/1\.1 400 /.test(noKey.bytes.toString())&&noKey.closed&&/^HTTP\/1\.1 426 /.test(old.bytes.toString())&&/Sec-WebSocket-Version: 13/.test(old.bytes.toString())&&old.closed,[noKey.bytes.toString().slice(0,20),old.bytes.toString().slice(0,20)]]; });
    await atest('an unmasked frame from a client closes the connection',async()=>{ const r=await raw(shake('/echo'),tcp=>setTimeout(()=>tcp.write(W.encodeFrame(1,Buffer.from('bare'))),30)); return r.closed&&!r.bytes.toString('latin1').includes('bare'); });
    await atest('the server pings, and drops a socket that misses two pongs',async()=>{ const t0=Date.now(), r=await raw(shake('/idle')); await until(()=>seen.idleClosed,2000);             // a bare client never answers a ping
      const pings=r.bytes.toString('latin1').split('\x89\x00').length-1, took=seen.idleClosed-t0; return [pings===2&&took>=60&&took<1000,{pings,took}]; });
    await atest('and keeps one that answers',async()=>{ seen.idleClosed=0; const c=await W.connect(at+'/idle'); await sleep(300); const alive=!c.closed&&!seen.idleClosed; c.close(); return alive; });
    await atest('a socket whose other end stops reading is dropped, not buffered without end',async()=>{ const r=await raw(shake('/flood'),tcp=>tcp.pause()); const chunk=Buffer.alloc(64<<10); let n=0;
      while(!seen.floodClosed&&n<4000){ seen.flood.send(chunk); n++; if(n%50===0) await sleep(1); } await until(()=>seen.floodClosed,1000); r.tcp.destroy(); return [seen.floodClosed===true&&n<4000,n]; });
  }catch(e){ ok('the socket tests ran',false,String(e&&e.stack||e)); }
  finally{ srv.closeAllConnections&&srv.closeAllConnections(); srv.close(); }
}

console.log(bad?bad+' failed':'all net tests pass'); process.exit(bad?1:0);
})();
