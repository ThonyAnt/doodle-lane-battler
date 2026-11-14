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
    W.attach(srv,'/broken',()=>{ throw new Error('on purpose'); });
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
    await atest('a path whose code throws drops that socket and nothing else',async()=>{ const say=console.error; console.error=()=>{}; let closed=false; try{ const c=await W.connect(at+'/broken'); closed=await until(()=>c.closed,1000); }catch(e){ closed=true; } finally{ console.error=say; }
      const c=await W.connect(at+'/shout'), got=[]; c.on('message',d=>got.push(d)); c.send('still here'); await until(()=>got.length,1000); c.close(); return closed&&got[0]==='STILL HERE'; });
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

/* ---------- 3. binary packing and deltas (wire.js) ---------- */
// 600 consecutive snapshots of a bot-against-bot match with the rules from duel.html, one per 1/60 s as the server sends
// them, starting where the fight starts (the hard part: a countdown hardly changes and would flatter the numbers).
// Each is copied as it is taken, undefined fields and all: a snapshot shares arrays with the match, which goes on changing.
const src=fs.readFileSync(path.join(__dirname,'..','duel.html'),'utf8').replace(/\r\n/g,'\n');
const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,makeBot,stockItem};')();
function record(seed,n,from,to){
  const S=D.createDuel({seed}), bots=[D.makeBot(0,()=>0.55,seed+1),D.makeBot(1,()=>0.55,seed+2)], out=[];
  [['sword','gun'],['hammer','bow']].forEach((keys,s)=>keys.forEach((key,k)=>S.setItem(s,k,D.stockItem(key,k?'fire':'none').spec,45)));
  for(let i=0;out.length<n&&i<60*400;i++){ for(const s of [0,1]){ bots[s](S,1/60); if(S.phase==='draw'&&!S.ready[s]) S.setReady(s); } S.step(1/60); const snap=structuredClone(S.snapshot()); if(out.length||S.phase===from) out.push(snap); if(S.phase===to) break; }
  return out;
}
const SNAPS=record(7,600,'fight'), Wire=require('../wire.js'), util=require('util');
{ // pk and un are the two ends of one connection: what pk packs, un must unpack, in order (they share a dictionary of strings).
  const C=Wire.createCodec(), U=Wire.createCodec(), pk=v=>C.pack(v), un=b=>U.unpack(b), json=v=>JSON.stringify(v), viaJson=v=>JSON.parse(JSON.stringify(v));
  const size=v=>Wire.createCodec().pack(v).length;      // bytes on a connection that has carried nothing yet
  test('the recording is a real fight',()=>[SNAPS.length===600&&SNAPS[0].phase==='fight'&&SNAPS.some(s=>s.pr.length>0)&&SNAPS.some(s=>s.ev.length>0)&&SNAPS.some(s=>s.f.some(f=>f.act))&&SNAPS.some(s=>s.pr.some(p=>'h' in p&&p.h===undefined)),
    {shots:SNAPS.filter(s=>s.pr.length).length,events:SNAPS.reduce((n,s)=>n+s.ev.length,0)}]);
  test('pack and unpack round-trip odd values',()=>[0,-1,1.5,1e21,'','é',true,null,[],{},{a:[{id:1,x:0.1}]}].every(v=>JSON.stringify(un(pk(v)))===JSON.stringify(v)));
  test('every recorded snapshot survives a delta',()=>SNAPS.every((s,i)=>i===0||JSON.stringify(Wire.apply(SNAPS[i-1],un(pk(Wire.diff(SNAPS[i-1],s)))))===JSON.stringify(s)));
  test('a delta against a snapshot 30 back also works',()=>JSON.stringify(Wire.apply(SNAPS[100],Wire.diff(SNAPS[100],SNAPS[130])))===JSON.stringify(SNAPS[130]));
  test('an unknown new field is carried',()=>Wire.apply({a:1},Wire.diff({a:1},{a:1,forge:{x:[1,2]}})).forge.x[1]===2);
  test('identical snapshots give no patch',()=>Wire.diff(SNAPS[5],JSON.parse(JSON.stringify(SNAPS[5])))===undefined);
  // (The plan measured with pk, whose dictionary the tests above have already filled; a connection of its own is the honest count.)
  const M=Wire.createCodec(), jsonBytes=SNAPS.reduce((n,s)=>n+JSON.stringify(s).length,0), deltaBytes=SNAPS.reduce((n,s,i)=>n+(i?M.pack(Wire.diff(SNAPS[i-1],s)||0).length:M.pack(s).length),0);
  ok('deltas are at most 40% of the JSON',deltaBytes<=0.4*jsonBytes,{jsonBytes,deltaBytes,percent:+(100*deltaBytes/jsonBytes).toFixed(2)});
  // Beyond the plan's list. First the packing: what comes out is what JSON would have carried, bit for bit.
  test('every recorded snapshot packs to exactly what JSON carries, in fewer bytes',()=>{ const c=Wire.createCodec(), u=Wire.createCodec(); let packed=0;
    for(const s of SNAPS){ const b=c.pack(s); packed+=b.length; if(!util.isDeepStrictEqual(u.unpack(b),viaJson(s))||json(u.unpack(c.pack(s)))!==json(s)) return false; } return [packed<0.5*jsonBytes,{packed,jsonBytes}]; });
  test('numbers come back exactly, whatever their shape',()=>{ const xs=[0,-0,1,63,64,-64,127,128,255,256,65535,-65536,2**31,-(2**31),2**50,2**50+1,-(2**50)-1,2**53-1,-(2**53)+1,1e21,-1e21,0.1,-0.1,12.3,0.25,-7.77,0.125,1.005,123456.789,0.1+0.2,1/3,-1/3,1e-7,5e-324,1.7976931348623157e308,Math.PI,340.5,0.30000000000000004,99999999999.9,4503599627370496.5];
    const bad=xs.filter(x=>{ const y=un(pk(x)); return !(y===x)||(x!==0&&1/y!==1/x); }); return [bad.length===0&&un(pk(NaN))===null&&un(pk(Infinity))===null&&un(pk(-Infinity))===null&&Object.is(un(pk(-0)),0),bad]; });
  test('a one-decimal number takes 3 bytes, a float that is not decimal takes 9',()=>size(123.4)===3&&size(-0.5)===2&&size(40)===1&&size(Math.PI)===9);
  test('what JSON drops is dropped, what JSON nulls is null',()=>{ const v={a:undefined,b:[undefined,()=>1,NaN],c:()=>2,d:{e:undefined},f:null}; return json(un(pk(v)))===json(v)&&util.isDeepStrictEqual(un(pk(v)),viaJson(v)); });
  test('strings of every sort survive',()=>['','a','é','日本語','😀 ok','\u0000\n"\\','x'.repeat(300),'__proto__','constructor'].every(x=>un(pk(x))===x&&un(pk({[x]:x}))[x]===x&&un(pk([x,x,x])).every(y=>y===x)));
  test('a key called __proto__ stays an ordinary key',()=>{ const v=JSON.parse('{"__proto__":{"evil":1},"a":1}'), y=un(pk(v)); return json(y)===json(v)&&Object.getPrototypeOf(y)===Object.prototype&&y.evil===undefined&&({}).evil===undefined; });
  test('a string seen before costs one byte, on its own connection only',()=>{ const c=Wire.createCodec(), u=Wire.createCodec(), first=c.pack('overdrive'), again=c.pack(['overdrive','overdrive']);
    return [first.length===11&&again.length===3&&u.unpack(first)==='overdrive'&&u.unpack(again).join()==='overdrive,overdrive'&&Wire.createCodec().pack('overdrive').length===11,[first.length,again.length]]; });
  test('the dictionary is bounded: long strings and those past its limit are spelt out every time',()=>{ const c=Wire.createCodec(), u=Wire.createCodec(), long='y'.repeat(200); let ok=c.pack(long).length===c.pack(long).length;
    for(let i=0;i<6000;i++){ const s='s'+i; if(u.unpack(c.pack([s,s]))[1]!==s) return [false,i]; } const late='s5999', early='s0';
    return [ok&&c.pack(late).length===late.length+2&&c.pack(early).length<=3&&u.unpack(c.pack([early,late,'fresh'])).join()==='s0,s5999,fresh',[c.pack(late).length,c.pack(early).length]]; });
  test('damaged or cut-off data throws instead of making something up',()=>{ const whole=Wire.createCodec().pack(SNAPS[0]), tries=[whole.subarray(0,whole.length-1),whole.subarray(0,10),Uint8Array.from([...whole,0]),Uint8Array.from([0x0f]),Uint8Array.from([0x89,0x05]),Uint8Array.from([0x0a,0xff,0xff,0xff,0x7f])];
    return tries.every(t=>{ try{ Wire.createCodec().unpack(t); return false; }catch(e){ return /^wire:/.test(e.message); } }); });
  // Then the deltas, on made-up values: a seeded mess of nested objects and lists, changed a little at a time.
  const rnd=(()=>{ let a=12345; return ()=>{ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; })(), pick=a=>a[Math.floor(rnd()*a.length)];
  const leaf=()=>pick([0,1,-1,2.5,rnd()*100,Math.round(rnd()*1000)/10,'a','bb',pick(['fire','water','plant']),true,false,null,undefined,[],{}]);
  const make=d=>{ const r=rnd(); if(d<=0||r<0.3) return leaf();
    if(r<0.5) return Array.from({length:Math.floor(rnd()*4)},()=>make(d-1));
    if(r<0.65){ const ids=[1,2,3,4,5,6,'x','y'].filter(()=>rnd()<0.5).sort(()=>rnd()-0.5); return ids.map(id=>({id,x:leaf(),o:make(d-2)})); }
    const o={}; for(const k of ['x','y','hp','act','pr','10','2','name']) if(rnd()<0.6) o[k]=make(d-1); return o; };
  const change=(v,d)=>{ const r=rnd(); if(v===null||typeof v!=='object'||r<0.08) return rnd()<0.5?make(d):v;
    if(Array.isArray(v)){ let out=v.map(x=>rnd()<0.4?change(x,d-1):x); if(rnd()<0.25) out=out.filter(()=>rnd()<0.7); if(rnd()<0.25) out.push(make(d-1)); if(rnd()<0.1) out.reverse(); if(rnd()<0.1&&out.length) out.push(out[0]); return out; }
    const keys=Object.keys(v), out={}; if(rnd()<0.15) keys.reverse(); if(rnd()<0.2) out[pick(['x','zz','7','name'])]=make(d-1);
    for(const k of keys){ if(rnd()<0.1) continue; out[k]=rnd()<0.4?change(v[k],d-1):v[k]; } if(rnd()<0.2) out[pick(['y','new','3'])]=make(d-1); return out; };
  test('5000 made-up changes: the delta, packed and unpacked, rebuilds the new value exactly and leaves the old one alone',()=>{ let v=make(4)||{}, n=0, none=0;
    for(let i=0;i<5000;i++){ let next=rnd()<0.05?structuredClone(v):change(v,4); if(next===undefined) next=null; const before=json(v), d=Wire.diff(v,next), built=Wire.apply(v,d===undefined?undefined:un(pk(d)));
      if(json(built)!==json(next)||json(v)!==before||(d===undefined)!==(json(v)===json(next))) return [false,{i,v:String(json(v)).slice(0,300),next:String(json(next)).slice(0,300),d:String(json(d)).slice(0,300),built:String(json(built)).slice(0,300)}];
      if(d===undefined) none++; else n++; v=rnd()<0.03?(make(4)||[]):next; } return [n>3000&&none>100,{n,none}]; });
  test('only what changed is in the patch',()=>{ const a=SNAPS[200], b=structuredClone(a); b.f[1].hp-=3; b.t=+(b.t-0.02).toFixed(2); const d=Wire.diff(a,b), bytes=Wire.createCodec().pack(d).length;
    return [json(Wire.apply(a,d))===json(b)&&!json(d).includes('"items"')&&!json(d).includes('"x"')&&json(d).includes('"hp"')&&bytes<40,{bytes,d:json(d)}]; });
  test('shots are matched by id: one leaving, one arriving and one moving cost a few bytes, not the whole list',()=>{ const shot=(id,x)=>({id,k:'shot',st:'gun',side:0,slot:1,x,y:-40,vx:520,vy:0,el:'fire',o:0}), a={pr:[shot(1,10),shot(2,20),shot(3,30),shot(4,40)]}, b={pr:[shot(2,20),shot(3,35.5),shot(4,40),shot(5,0)]}, d=Wire.diff(a,b);
    const c=Wire.createCodec(); c.pack(a); const bytes=c.pack(d).length, whole=c.pack([0,b]).length; return [json(Wire.apply(a,d))===json(b)&&bytes<whole/2&&json(d).split('"k"').length===2,{bytes,whole,d:json(d)}]; });
  test('a list whose order changes, or whose ids repeat, still comes out right',()=>{ const a=[{id:1,v:1},{id:2,v:2},{id:3,v:3}], cases=[[a[2],a[0],a[1]],[a[0],a[0]],[{id:3,v:9},{id:1,v:1}],[],[{id:'1',v:1},{id:1,v:1}],[{v:1},{id:2}]];
    return cases.every(b=>json(Wire.apply(a,Wire.diff(a,b)))===json(b)&&json(Wire.apply(b,Wire.diff(b,a)))===json(a)); });
  test('a field that appears in the middle of an object comes out in its place',()=>{ const a={id:1,k:'shot',x:1,z:1}, b={id:1,k:'shot',h:1,x:2,z:1}, c={z:1,x:2}; return json(Wire.apply(a,Wire.diff(a,b)))===json(b)&&json(Wire.apply(b,Wire.diff(b,a)))===json(a)&&json(Wire.apply(b,Wire.diff(b,c)))===json(c)&&Wire.diff(a,{z:1,x:1,k:'shot',id:1})!==undefined; });
  test('no patch means no change, and the old value is handed back',()=>{ const a={x:[1,{y:2}]}; return Wire.apply(a,undefined)===a&&Wire.apply(a,null)===a&&Wire.diff(a,a)===undefined&&Wire.diff({a:undefined,b:1},{b:1})===undefined&&Wire.diff([undefined,NaN],[null,null])===undefined; });
  test('a copy is what JSON would carry and shares nothing with the original',()=>{ const s=SNAPS[300], c=Wire.clone(s); c.f[0].x+=1; c.ev.push({e:'x'}); c.wins[0]=9;
    return util.isDeepStrictEqual(Wire.clone(s),viaJson(s))&&s.f[0].x!==c.f[0].x&&s.wins[0]!==9&&json(Wire.clone({a:undefined,b:[undefined,-0,NaN]}))==='{"b":[null,0,null]}'; });
  test('a patch that does not fit the value it is applied to throws',()=>{ try{ Wire.apply({a:1},[9,1]); return false; }catch(e){ return /^wire:/.test(e.message); } });
  // What the 40% is made of, and a whole match for comparison (countdown, every round, the waits between them).
  { const all=record(7,60*400,'count','over'), cA=Wire.createCodec(), full=all.reduce((n,s)=>n+JSON.stringify(s).length,0), delta=all.reduce((n,s,i)=>n+(i?cA.pack(Wire.diff(all[i-1],s)||0).length:cA.pack(s).length),0);
    console.log('     fight only, 600 snapshots: JSON '+jsonBytes+' bytes, deltas '+deltaBytes+' bytes ('+(100*deltaBytes/jsonBytes).toFixed(2)+'%), '+Math.round(jsonBytes/600)+' against '+(deltaBytes/600).toFixed(1)+' bytes a snapshot');
    console.log('     a whole match, '+all.length+' snapshots: JSON '+full+' bytes, deltas '+delta+' bytes ('+(100*delta/full).toFixed(2)+'%)'); }
}

/* ---------- 4. state frames: whole snapshots and deltas against what the other end holds ---------- */
{ const json=v=>JSON.stringify(v), kindOf=b=>Wire.header(b).kind;
  // A link whose acknowledgements reach the sender `lag` frames late (-1: never). Returns the kinds sent, what was decoded, the bytes.
  const stream=(snaps,lag,opts)=>{ const tx=Wire.createSender(opts), rx=Wire.createReceiver(), out={kinds:[],got:[],bytes:0,bases:[]}, acks=[];
    snaps.forEach((s,i)=>{ if(lag>=0&&i-lag-1>=0) tx.ack(acks[i-lag-1]); const f=tx.frame(s,1000000+i*1000/60), r=rx.read(f); out.kinds.push(r.kind); out.got.push(r.snap); out.bytes+=f.length; out.bases.push(r.kind===2?r.seq-r.base:0); acks.push(r.seq); });
    return out; };
  const plain=SNAPS.map(s=>Wire.clone(s));      // as the server holds them
  test('a frame says what it is: kind, number, base, the server\'s clock',()=>{ const tx=Wire.createSender(), a=tx.frame(plain[0],1731500000123); tx.ack(1); const b=tx.frame(plain[1],1731500000140), ha=Wire.header(a), hb=Wire.header(b);
    return [a[0]===1&&b[0]===2&&ha.kind===1&&ha.seq===1&&ha.base===0&&ha.serverMs===1731500000123&&hb.kind===2&&hb.seq===2&&hb.base===1&&hb.serverMs===1731500000140,[ha,hb]]; });
  test('the first frame is whole; acknowledged at once, every later one within two seconds is a delta',()=>{ const r=stream(plain.slice(0,100),0); return [r.kinds[0]===1&&r.kinds.slice(1).every(k=>k===2)&&r.got.every((g,i)=>json(g)===json(plain[i])),r.kinds.slice(0,5)]; });
  test('never acknowledged, every frame is whole and still right',()=>{ const r=stream(plain.slice(0,100),-1); return r.kinds.every(k=>k===1)&&r.got.every((g,i)=>json(g)===json(plain[i])); });
  test('a whole frame goes out every two seconds whatever is acknowledged',()=>{ const r=stream(plain,0), at=r.kinds.map((k,i)=>k===1?i:-1).filter(i=>i>=0); return [at.join()==='0,120,240,360,480',at]; });
  test('600 snapshots arrive exactly, however late the acknowledgements are',()=>{ const sizes={}; for(const lag of [0,1,2,5,12,30,31,32,45,-1]){ const r=stream(plain,lag); sizes[lag]=r.bytes; if(!r.got.every((g,i)=>json(g)===json(plain[i]))) return [false,lag]; } return [sizes[0]<sizes[5]&&sizes[5]<sizes[-1]&&sizes[45]===sizes[-1],sizes]; });
  test('an acknowledgement more than 32 frames old no longer names a snapshot the sender kept: whole frames',()=>{ const r=stream(plain.slice(0,200),32), ok31=stream(plain.slice(0,200),31); return [r.kinds.every(k=>k===1)&&ok31.kinds.slice(40,100).every(k=>k===2)&&Math.max(...ok31.bases)===32,[r.kinds.slice(0,3),Math.max(...ok31.bases)]]; });
  test('acknowledgements for frames never sent, or going backwards, or not numbers, are ignored',()=>{ const tx=Wire.createSender(), rx=Wire.createReceiver(), k=[]; const go=i=>{ const r=rx.read(tx.frame(plain[i],1000+i)); k.push(r.kind+':'+r.base); return json(r.snap)===json(plain[i]); };
    let good=go(0); tx.ack(7); tx.ack('1'); tx.ack(NaN); tx.ack(-1); tx.ack(1.5); good=go(1)&&good; tx.ack(2); good=go(2)&&good; tx.ack(1); good=go(3)&&good; return [good&&k.join()==='1:0,1:0,2:2,2:2',k]; });
  test('what the receiver hands over is the caller\'s own: changing it does not disturb the frames that follow',()=>{ const tx=Wire.createSender(), rx=Wire.createReceiver(); let good=true;
    for(let i=0;i<60;i++){ const r=rx.read(tx.frame(plain[i],1000+i*16)); tx.ack(r.seq); good=good&&json(r.snap)===json(plain[i]); r.snap.f[0].x=-999; r.snap.ev.push({e:'mine'}); r.snap.items=null; for(const e of r.snap.ev) e.t0=1; } return good; });
  test('an unchanged snapshot is a delta of a dozen bytes',()=>{ const tx=Wire.createSender(), rx=Wire.createReceiver(), a=rx.read(tx.frame(plain[3],1700000000000)); tx.ack(a.seq); const f=tx.frame(Wire.clone(plain[3]),1700000000016), b=rx.read(f); return [b.kind===2&&f.length<=12&&json(b.snap)===json(plain[3]),f.length]; });
  test('a delta against a snapshot the receiver does not hold throws, as does a frame that is not one',()=>{ const tx=Wire.createSender(), a=tx.frame(plain[0],1); tx.ack(1); const b=tx.frame(plain[1],2), fresh=Wire.createReceiver();
    const bad=f=>{ try{ fresh.read(f); return false; }catch(e){ return /^wire:/.test(e.message); } }; return kindOf(b)===2&&bad(b)&&bad(Uint8Array.from([3,1,1,0]))&&bad(new Uint8Array(0)); });
  test('the frames of a fight are a twentieth of the JSON',()=>{ const r=stream(plain,2), jsonBytes=plain.reduce((n,s)=>n+json(s).length,0); return [r.bytes<jsonBytes/15,{frames:r.bytes,jsonBytes,percent:+(100*r.bytes/jsonBytes).toFixed(2)}]; });
}

/* ---------- 5. the server: rooms over a socket (a child `node server.js` on port 3195, no API key) ---------- */
const PORT=3195, HTTP0='http://127.0.0.1:'+PORT, WS0='ws://127.0.0.1:'+PORT;
const post=async(p,o)=>{ const r=await fetch(HTTP0+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o||{})}); let body=null; try{ body=await r.json(); }catch(e){} return {status:r.status,body}; };
const HELD={l:false,r:false,d:false,j:0,a:0,b:0,m:0,q:0,u:0,h:0};
// A device on the event stream. names: every event in the order it came; events: the same with their data, states left
// out; states: each state as JSON text; state: the newest.
function listenSse(code,id,watch){ const me={names:[],events:[],states:[],state:null,evs:{},req:null};
  me.req=http.get(HTTP0+'/duel/events?room='+code+'&id='+id+(watch?'&watch=1':''),res=>{ res.setEncoding('utf8'); let buf='';
    res.on('data',chunk=>{ buf+=chunk; for(let i;(i=buf.indexOf('\n\n'))>=0;){ const msg=buf.slice(0,i); buf=buf.slice(i+2); const ev=(/^event: (.*)$/m.exec(msg)||[])[1], data=(/^data: (.*)$/m.exec(msg)||[])[1]; if(!ev||!data) continue;
      me.names.push(ev); if(ev==='state'){ me.states.push(data); me.state=JSON.parse(data); } else{ const d=JSON.parse(data); me.events.push([ev,d]); me.evs[ev]=d; } } }); });
  me.req.on('error',()=>{}); me.close=()=>me.req.destroy(); return me; }
// A device on a socket, the same fields; kinds: 1 for each whole state frame, 2 for each delta. ack:false never acknowledges.
async function listenWs(code,id,opts){ opts=opts||{}; const sock=await W.connect(WS0+'/duel/ws?room='+code+'&id='+id+(opts.watch?'&watch=1':'')), rx=Wire.createReceiver();
  const me={sock,names:[],events:[],states:[],state:null,evs:{},kinds:[],closed:false,error:null,seq:0};
  sock.on('message',(data,isBinary)=>{ try{
    if(!isBinary){ const m=JSON.parse(data); me.names.push(m.ev); me.events.push([m.ev,m.data]); me.evs[m.ev]=m.data; return; }
    const r=rx.read(data); me.names.push('state'); me.kinds.push(r.kind); me.state=r.snap; me.states.push(JSON.stringify(r.snap)); me.seq=r.seq; if(opts.ack!==false) sock.send(JSON.stringify({t:'ack',ack:r.seq}));
  }catch(e){ me.error=me.error||String(e&&e.message||e); } });
  sock.on('close',()=>{ me.closed=true; }); me.send=o=>sock.send(JSON.stringify(o)); me.close=()=>sock.close(); return me; }
let server=null; const stop=()=>{ if(server){ try{ server.kill('SIGKILL'); }catch(e){} server=null; } }; process.on('exit',stop);
try{
  let busy=false; try{ await fetch(HTTP0+'/info'); busy=true; }catch(e){}
  if(busy) throw new Error('port '+PORT+' is already in use: stop whatever is listening there and run again');
  server=cp.spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:Object.assign({},process.env,{PORT:String(PORT),OPENAI_API_KEY:'',FORGE_CACHE:'',NOWS:'',FORGE:''}),stdio:'ignore'});
  let up=false; for(let i=0;i<60&&!up;i++){ await sleep(100); try{ up=(await fetch(HTTP0+'/info')).ok; }catch(e){} }
  if(!up) throw new Error('the test server did not start');

  // Room A: a bot room. A big screen watches on the event stream; the player comes in on a socket.
  const A=(await post('/duel/room?bot=1&skill=0')).body.code, watcher=listenSse(A,'net-watch',true), actA=(id,o)=>post('/duel/act',Object.assign({room:A,id},o));
  await until(()=>watcher.states.length>=2,2000);
  { const n=watcher.states.length; await until(()=>watcher.states.length>n,1000); }      // just after one of the room's four-a-second states: the next is a quarter of a second off
  const mark=watcher.events.length, player=await listenWs(A,'net-player');
  await until(()=>player.evs.hello&&player.evs.players&&player.kinds.length>=1,2000);
  await atest('hello and players arrive as text events',()=>{ const evs=player.evs; return [evs.hello.side===0&&!!evs.players&&evs.hello.code===A&&evs.hello.bot===true&&evs.hello.watch===false&&evs.players.present.join()==='true,true'&&evs.players.screen===true&&evs.players.bot===true,evs.hello]; });
  await atest('a device that arrives by socket is sent what one on the event stream is: hello, the items so far, who is here, the state',()=>[player.names.slice(0,5).join()==='hello,item,item,players,state'&&player.kinds[0]===1&&player.state.phase==='draw'&&player.events.filter(e=>e[0]==='item').every(e=>e[1].side===1&&e[1].strokes.length>0),player.names.slice(0,6)]);
  await actA('net-player',{type:'stock',slot:0,key:'sword',el:'none'}); await actA('net-player',{type:'ready'});
  await until(()=>player.kinds.length>=20,4000);
  await atest('the first state frame is full, later ones are deltas',()=>{ const kinds=player.kinds; return [kinds.length>=20&&kinds[0]===1&&kinds.slice(1,20).every(k=>k===2),kinds.slice(0,20).join('')]; });
  await until(()=>player.state.phase==='fight'&&watcher.state.phase==='fight',12000); await sleep(400);
  await atest('decoded state matches the event stream within one tick',()=>{ const wsState=player.state, sseState=watcher.state; return [wsState.phase==='fight'&&Math.abs(wsState.f[0].x-sseState.f[0].x)<12&&Math.abs(wsState.f[1].x-sseState.f[1].x)<12&&Math.abs(wsState.t-sseState.t)<0.05,[wsState.f[0].x,sseState.f[0].x,wsState.t,sseState.t]]; });
  await atest('every state the socket carried is, to the letter, one the event stream carried',()=>{ const seen=new Set(watcher.states), mine=player.states.slice(1,-8), missing=mine.filter(s=>!seen.has(s)).length;      // the first was the player's alone; the last few may still be on their way to the watcher
    return [player.error===null&&mine.length>150&&missing===0&&mine.some(s=>JSON.parse(s).ev.length>0),{states:mine.length,missing,error:player.error}]; });
  await atest('item and forge events are the same on both links',()=>{ const pick=list=>list.filter(e=>e[0]==='item'||e[0]==='forge'), a=pick(player.events.slice(player.names.indexOf('players'))), b=pick(watcher.events.slice(mark));
    return [a.length>=3&&JSON.stringify(a)===JSON.stringify(b)&&a[0][0]==='item'&&a[0][1].side===0&&a.some(e=>e[0]==='forge'&&e[1].state==='working')&&a.some(e=>e[0]==='forge'&&e[1].state==='done'&&e[1].rules.length>0),a.map(e=>e[0]+(e[1].state?':'+e[1].state:''))]; });
  // Devices that arrive late, one on each link: both are told the same things in the same order.
  const lateWs=await listenWs(A,'net-late-ws'), lateSse=listenSse(A,'net-late-sse'); await until(()=>lateWs.kinds.length>=1&&lateSse.states.length>=1,2000);
  await atest('a late device is told the same on a socket as on the event stream: items, rules, state',()=>{ const upTo=c=>c.names.slice(0,c.names.indexOf('state')+1), first=c=>c.events.slice(0,upTo(c).length-1).filter(e=>e[0]!=='players'), a=upTo(lateWs), b=upTo(lateSse);
    const sa=JSON.parse(lateWs.states[0]), sb=JSON.parse(lateSse.states[0]);
    return [a.join()==='hello,item,item,item,players,forge,state'&&a.join()===b.join()&&JSON.stringify(first(lateWs))===JSON.stringify(first(lateSse))&&lateWs.evs.hello.side===-1&&lateWs.evs.forge.rules.length>0&&lateWs.kinds[0]===1&&sa.phase===sb.phase&&Math.abs(sa.t-sb.t)<0.2&&JSON.stringify(sa.items)===JSON.stringify(sb.items),a]; });
  const quiet=await listenWs(A,'net-noack',{ack:false}); await sleep(600);
  await atest('never acknowledging still works: full frames keep coming',()=>{ const kindsNoAck=quiet.kinds, seen=new Set(watcher.states), mine=quiet.states.slice(1,-8);
    return [kindsNoAck.filter(k=>k===1).length>=2&&kindsNoAck.every(k=>k===1)&&mine.length>15&&mine.every(s=>seen.has(s))&&quiet.error===null,{frames:kindsNoAck.length,whole:kindsNoAck.filter(k=>k===1).length}]; });
  await atest('a ping over the socket is answered with a pong that carries its number',async()=>{ player.send({t:'ping',ms:12345.5}); await until(()=>player.evs.pong,1000); return [player.evs.pong&&player.evs.pong.ms===12345.5,player.evs.pong]; });
  await atest('nonsense on a socket is ignored: the socket stays, and so does the server',async()=>{ const n=player.kinds.length; player.send('x'); player.sock.send('{not json'); player.sock.send('null'); player.sock.send('[1,2]'); player.sock.send(Buffer.from([1,2,3,4]));
    player.send({t:'input'}); player.send({t:'input',seq:'x',l:{},h:1e99,j:'many'}); player.send({t:'ack',ack:'x'}); player.send({t:'ack',ack:1e15}); player.send({t:'nothing'}); await sleep(300);
    return [!player.closed&&player.kinds.length>n+5&&(await fetch(HTTP0+'/info')).ok,player.kinds.length-n]; });
  // The big screen sets the terrain and asks for a rematch: every device hears of both, whatever its link.
  { const m=[watcher.events.length,player.events.length,lateWs.events.length], named=(c,from)=>c.events.slice(from).filter(e=>e[0]!=='players'&&e[0]!=='pong');
    await actA('net-watch',{type:'plats',plats:[{id:'a',x0:100,x1:300,y:120}]}); await actA('net-watch',{type:'rematch'});
    await until(()=>[watcher,player,lateWs].every((c,i)=>named(c,m[i]).filter(e=>e[0]==='item').length>=2)&&player.state.phase==='draw'&&player.state.round===1,3000); await sleep(200);
    await atest('plats, reset and the new match\'s items and rules reach a socket as they reach the event stream',()=>{ const a=named(player,m[1]), b=named(watcher,m[0]), c=named(lateWs,m[2]), names=a.map(e=>e[0]);
      return [JSON.stringify(a)===JSON.stringify(b)&&JSON.stringify(c)===JSON.stringify(b)&&names[0]==='plats'&&names[1]==='reset'&&names.filter(n=>n==='item').length===2&&names.includes('forge')&&a[0][1].plats[0].x1===300,names]; });
    await atest('after the rematch the socket goes on with deltas of the new match',()=>{ const seen=new Set(watcher.states), tail=player.states.slice(-12,-4); return [player.error===null&&player.state.phase==='draw'&&player.state.wins.join()==='0,0'&&player.state.items[0].every(x=>x===null)&&tail.every(s=>seen.has(s))&&player.kinds.slice(-10).includes(2),player.kinds.slice(-10).join('')]; }); }
  for(const c of [watcher,player,lateWs,lateSse,quiet]) c.close();

  // Room B: two people, no bot and no match rules, so nothing moves a fighter but its player. Blue is on a socket, Red on the event stream.
  const B=(await post('/duel/room?forge=0')).body.code, actB=(id,o)=>post('/duel/act',Object.assign({room:B,id},o));
  const blue=await listenWs(B,'net-blue'); await until(()=>blue.evs.hello,2000); const red=listenSse(B,'net-red'); await until(()=>red.evs.hello,2000);
  for(const id of ['net-blue','net-red']){ await actB(id,{type:'stock',slot:0,key:'sword',el:'none'}); await actB(id,{type:'ready'}); }
  await until(()=>blue.state.phase==='fight'&&red.state&&red.state.phase==='fight',8000); await sleep(100);
  const x=()=>blue.state.f[0].x, at=async(t0,ms)=>{ await sleep(Math.max(0,t0+ms-Date.now())); return x(); };
  { const xBefore=x(), t0=Date.now(); blue.send(Object.assign({t:'input',seq:1,ack:blue.seq},HELD,{r:true}));
    const xAfter=await at(t0,400), xAt1300=await at(t0,1300), xAt2200=await at(t0,2200);
    await atest('holding right over the socket moves the fighter',()=>[blue.evs.hello.side===0&&xAfter-xBefore>40,[xBefore,xAfter]]);
    await atest('silence releases the held direction within 1.3 s',()=>[Math.abs(xAt2200-xAt1300)<8&&xAt1300-xBefore>200&&xAt1300-xBefore<400,[xBefore,xAt1300,xAt2200]]); }
  await atest('only a higher seq counts: a message that arrives late is dropped',async()=>{ blue.send(Object.assign({t:'input',seq:10},HELD,{l:true})); await sleep(200); const x1=x();
    blue.send(Object.assign({t:'input',seq:9},HELD,{r:true})); blue.send(Object.assign({t:'input',seq:10},HELD)); await sleep(250); const x2=x();      // older, and the same again: neither counts
    await actB('net-blue',Object.assign({type:'input',seq:8},HELD)); await sleep(150); const x3=x();                                                     // nor does an old one that comes by request
    blue.send(Object.assign({t:'input',seq:11},HELD)); await sleep(350); const x4=x(); await sleep(250); const x5=x();
    return [x2<x1-40&&x3<x2-20&&Math.abs(x5-x4)<1,[x1,x2,x3,x4,x5]]; });
  await atest('a socket without a seat cannot press buttons',async()=>{ const spy=await listenWs(B,'net-spy'), big=await listenWs(B,'net-screen',{watch:true}); await until(()=>spy.evs.hello&&big.evs.hello,2000); const x0=x();
    spy.send(Object.assign({t:'input',seq:50},HELD,{r:true})); big.send(Object.assign({t:'input',seq:50},HELD,{r:true})); await sleep(300); const x1=x(); spy.close(); big.close();
    return [spy.evs.hello.side===-1&&big.evs.hello.watch===true&&Math.abs(x1-x0)<1,[x0,x1]]; });
  await atest('the event stream and its requests work as before beside the socket',async()=>{ const x0=red.state.f[1].x; await actB('net-red',Object.assign({type:'input',seq:1},HELD,{l:true})); await sleep(400); const x1=red.state.f[1].x;
    await actB('net-red',Object.assign({type:'input',seq:2},HELD)); await sleep(350); const x2=red.state.f[1].x; await sleep(200);
    return [x0-x1>40&&Math.abs(red.state.f[1].x-x2)<1&&Math.abs(blue.state.f[1].x-red.state.f[1].x)<1&&red.evs.hello.side===1,[x0,x1,x2]]; });
  { const n=red.events.length, again=await listenWs(B,'net-blue'); await until(()=>blue.closed&&again.kinds.length>=1,2000);
    await atest('a second socket with the same id takes over cleanly',async()=>{ const firstClosed=blue.closed, secondGotFull=again.kinds[0]===1, rosters=red.events.slice(n).filter(e=>e[0]==='players').map(e=>e[1].present.join());
      const x0=again.state.f[0].x; again.send(Object.assign({t:'input',seq:1},HELD,{r:true})); await sleep(300); const x1=again.state.f[0].x; again.send(Object.assign({t:'input',seq:2},HELD));      // the new socket counts its inputs from the start
      return [firstClosed&&secondGotFull&&again.evs.hello.side===0&&again.state.phase==='fight'&&rosters.length>=1&&rosters.every(r=>r==='true,true')&&x1-x0>40&&again.error===null,{rosters,moved:x1-x0}]; });
    await atest('when a player\'s socket closes the others are told the seat is empty',async()=>{ const m=red.events.length; again.close(); await until(()=>red.events.slice(m).some(e=>e[0]==='players'),2000); const last=red.events[red.events.length-1]; return [last[0]==='players'&&last[1].present.join()==='false,true',last]; }); }
  red.close();
  await atest('a socket for a room that does not exist is told it is gone, and closed',async()=>{ const c=await listenWs('ZZZZ','net-nobody'); await until(()=>c.closed,2000); return [c.names.join()==='gone'&&c.closed,c.names]; });
  await atest('without an upgrade the socket address is an ordinary 404',async()=>(await fetch(HTTP0+'/duel/ws?room='+B+'&id=x')).status===404);
  await atest('the server hands the page wire.js',async()=>{ const r=await fetch(HTTP0+'/wire.js'), text=await r.text(); return r.status===200&&/javascript/.test(r.headers.get('content-type'))&&text===fs.readFileSync(path.join(__dirname,'..','wire.js'),'utf8'); });
}catch(e){ ok('the room tests ran',false,String(e&&e.stack||e)); }
finally{ stop(); }

console.log(bad?bad+' failed':'all net tests pass'); process.exit(bad?1:0);
})();
