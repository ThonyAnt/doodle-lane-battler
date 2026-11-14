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

console.log(bad?bad+' failed':'all net tests pass'); process.exit(bad?1:0);
})();
