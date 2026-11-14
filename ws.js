// A small WebSocket, written from RFC 6455 with nothing but Node's own modules: the frame codec, the opening
// handshake, a server side that hangs on an http server (attach) and a minimal client (connect) for tests and tools.
// No extensions and no subprotocols: text and binary messages, ping, pong and close.
const crypto=require('crypto'), http=require('http');

const MAX_PAYLOAD=1<<20;      // 1 MiB: nothing in this game comes near it, so anything larger is refused
const OP={CONT:0,TEXT:1,BINARY:2,CLOSE:8,PING:9,PONG:10};

/* ---------- frames (RFC 6455 section 5) ---------- */
// One whole frame (FIN set) with this opcode and payload. A client must mask what it sends ({mask:true}); a server must not.
function encodeFrame(opcode,payload,opts){
  const mask=!!(opts&&opts.mask), n=payload.length, lenBytes=n<126?0:n<65536?2:8;
  const out=Buffer.allocUnsafe(2+lenBytes+(mask?4:0)+n);
  out[0]=0x80|(opcode&0x0f);
  if(!lenBytes) out[1]=n; else if(lenBytes===2){ out[1]=126; out.writeUInt16BE(n,2); } else{ out[1]=127; out.writeUInt32BE(Math.floor(n/4294967296),2); out.writeUInt32BE(n>>>0,6); }
  let at=2+lenBytes;
  if(mask){
    out[1]|=0x80; const key=crypto.randomBytes(4); key.copy(out,at); at+=4;
    for(let i=0;i<n;i++) out[at+i]=payload[i]^key[i&3];
  } else Buffer.from(payload.buffer,payload.byteOffset,n).copy(out,at);
  return out;
}
// A decoder for one direction of one connection. Give it the bytes as they arrive, in pieces of any size:
// push(chunk). It calls onFrame(opcode, payload) for every whole message (the fragments of a split message are joined
// first and handed on under the opcode of the first) and for every control frame. A frame that breaks the protocol
// calls onError(err) once, after which the decoder takes nothing more: the connection is to be closed.
// requireMask: frames from a client must be masked (the default); a client reading a server sets it to false.
function createDecoder(opts){
  const onFrame=opts.onFrame, onError=opts.onError||(()=>{}), requireMask=opts.requireMask!==false;
  let buf=Buffer.alloc(0), dead=false, parts=null, partsOp=0, partsLen=0;
  const fail=msg=>{ dead=true; buf=Buffer.alloc(0); parts=null; onError(new Error(msg)); };
  return function push(chunk){
    if(dead||!chunk||!chunk.length) return;
    buf=buf.length?Buffer.concat([buf,chunk]):chunk;
    while(!dead){
      if(buf.length<2) return;
      const b0=buf[0], b1=buf[1], fin=!!(b0&0x80), opcode=b0&0x0f, masked=!!(b1&0x80); let len=b1&0x7f, at=2;
      if(b0&0x70) return fail('reserved bits are set');
      if(!(opcode<=2||(opcode>=8&&opcode<=10))) return fail('unknown opcode '+opcode);
      if(requireMask&&!masked) return fail('a client frame without a mask');
      if(opcode>=8&&(!fin||len>125)) return fail('a control frame that is fragmented or too long');
      if(len===126){ if(buf.length<4) return; len=buf.readUInt16BE(2); at=4; }
      else if(len===127){ if(buf.length<10) return; if(buf.readUInt32BE(2)!==0) return fail('frame too large'); len=buf.readUInt32BE(6); at=10; }
      if(len>MAX_PAYLOAD||(opcode<8&&partsLen+len>MAX_PAYLOAD)) return fail('frame too large');      // said before any of it is kept
      if(opcode===OP.CONT&&!parts) return fail('a continuation with nothing to continue');
      if((opcode===OP.TEXT||opcode===OP.BINARY)&&parts) return fail('a new message inside an unfinished one');
      const need=at+(masked?4:0)+len; if(buf.length<need) return;
      let payload;
      if(masked){ const key=buf.subarray(at,at+4); at+=4; payload=Buffer.allocUnsafe(len); for(let i=0;i<len;i++) payload[i]=buf[at+i]^key[i&3]; }
      else payload=Buffer.from(buf.subarray(at,at+len));      // a copy: the caller may keep it
      buf=buf.subarray(need);
      if(opcode>=8){ onFrame(opcode,payload); continue; }
      if(opcode!==OP.CONT&&fin){ onFrame(opcode,payload); continue; }
      if(opcode!==OP.CONT){ parts=[payload]; partsOp=opcode; partsLen=len; continue; }
      parts.push(payload); partsLen+=len;
      if(fin){ const whole=Buffer.concat(parts,partsLen), op=partsOp; parts=null; partsLen=0; onFrame(op,whole); }
    }
  };
}

/* ---------- the opening handshake (RFC 6455 section 4) ---------- */
// What a server answers in Sec-WebSocket-Accept for a client's Sec-WebSocket-Key.
const acceptKey=key=>crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');

/* ---------- a socket, either end ---------- */
// Wraps a TCP connection whose handshake is done. sock.send(string) sends a text message, sock.send(Buffer or typed
// array) a binary one; both answer false if it could not be sent. sock.close() says goodbye and closes.
// sock.on('message', (data, isBinary) => ...) gets a string for text and a Buffer for binary; sock.on('close', ...) fires
// once, whichever end closed and however. sock.ping(bytes) asks for a pong (sock.on('pong', bytes => ...)).
// Messages that arrive before the first 'message' listener is added are kept for it.
// maxBuffered: a socket whose other end has stopped reading is dropped once this many bytes are waiting to go out.
function makeSocket(tcp,opts){
  const client=!!opts.client, maxBuffered=opts.maxBuffered||4<<20, subs={message:[],close:[],pong:[]};
  let closed=false, closing=false, early=[], killer=null;
  const emit=(name,a,b)=>{ for(const fn of subs[name].slice()) fn(a,b); };
  const finish=()=>{ if(closed) return; closed=sock.closed=true; clearTimeout(killer); emit('close'); };
  const write=(op,payload)=>{
    if(closed||tcp.destroyed||!tcp.writable) return false;
    if(tcp.writableLength>maxBuffered){ tcp.destroy(); return false; }      // nobody is reading at the other end
    tcp.write(encodeFrame(op,payload,{mask:client})); return true;
  };
  const bye=code=>{ if(closing) return; closing=true; const b=Buffer.alloc(2); b.writeUInt16BE(code,0); write(OP.CLOSE,b); tcp.end(); killer=setTimeout(()=>tcp.destroy(),2000); if(killer.unref) killer.unref(); };
  const push=createDecoder({requireMask:!client,
    onFrame(op,payload){
      if(op===OP.TEXT||op===OP.BINARY){ const data=op===OP.TEXT?payload.toString('utf8'):payload, isBinary=op===OP.BINARY; if(early) early.push([data,isBinary]); else emit('message',data,isBinary); }
      else if(op===OP.PING) write(OP.PONG,payload);
      else if(op===OP.PONG){ sock.missed=0; emit('pong',payload); }
      else bye(payload.length>=2?payload.readUInt16BE(0):1000);      // a close: answer it and go
    },
    onError(){ bye(1002); tcp.destroy(); }
  });
  const sock={closed:false,missed:0,
    on(name,fn){
      if(!subs[name]) throw new Error('no such event: '+name);
      subs[name].push(fn);
      if(name==='message'&&early){ const held=early; early=null; for(const [d,b] of held) fn(d,b); }
      if(name==='close'&&closed) setImmediate(fn);
      return sock;
    },
    send:data=>typeof data==='string'?write(OP.TEXT,Buffer.from(data,'utf8')):write(OP.BINARY,Buffer.isBuffer(data)?data:Buffer.from(data.buffer,data.byteOffset,data.byteLength)),
    ping:bytes=>write(OP.PING,bytes||Buffer.alloc(0)),
    close:code=>{ if(!closed) bye(code||1000); },
    terminate:()=>tcp.destroy(),
    push
  };
  tcp.setNoDelay(true); tcp.setTimeout(0);
  tcp.on('data',push); tcp.on('end',()=>{ if(!closing) tcp.end(); }); tcp.on('error',()=>tcp.destroy()); tcp.on('close',finish);
  return sock;
}

/* ---------- the server side ---------- */
// Sockets for one path of an http server: attach(server, '/duel/ws', (sock, req) => ...). req is the upgrade request
// (its url carries the query). Other paths, and requests that are not a proper WebSocket handshake, are refused, so a
// server can have several paths attached. Every pingMs (15 s) each socket is pinged; one that has let two pings go
// unanswered is dropped.
const attached=new WeakMap();      // http server -> Map(path -> {onSocket, opts, all})
function attach(server,path,onSocket,opts){
  opts=opts||{};
  let paths=attached.get(server);
  if(!paths){
    attached.set(server,paths=new Map());
    const refuse=(tcp,status,extra)=>{ tcp.on('error',()=>{}); tcp.end('HTTP/1.1 '+status+'\r\nConnection: close\r\nContent-Length: 0\r\n'+(extra||'')+'\r\n'); const t=setTimeout(()=>tcp.destroy(),1000); if(t.unref) t.unref(); };
    server.on('upgrade',(req,tcp,head)=>{
      let p=''; try{ p=new URL(req.url,'http://x').pathname; }catch(e){}
      const entry=paths.get(p), key=req.headers['sec-websocket-key'];
      if(!entry) return refuse(tcp,'404 Not Found');
      if(req.method!=='GET'||!/^websocket$/i.test(req.headers.upgrade||'')||!key||Buffer.from(key,'base64').length!==16) return refuse(tcp,'400 Bad Request');
      if(req.headers['sec-websocket-version']!=='13') return refuse(tcp,'426 Upgrade Required','Sec-WebSocket-Version: 13\r\n');
      tcp.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+acceptKey(key)+'\r\n\r\n');
      const sock=makeSocket(tcp,{client:false,maxBuffered:entry.opts.maxBuffered});
      entry.all.add(sock); sock.on('close',()=>entry.all.delete(sock));
      try{ entry.onSocket(sock,req); }catch(e){ console.error('ws: '+p+' could not take a socket:',e&&e.message); sock.terminate(); return; }      // one bad arrival must not stop the server
      if(head&&head.length) sock.push(head);      // frames that came in right behind the handshake
    });
  }
  const entry={onSocket,opts,all:new Set()}; paths.set(path,entry);
  const timer=setInterval(()=>{ for(const s of entry.all){ if(s.missed>=2) s.terminate(); else{ s.missed++; s.ping(); } } },opts.pingMs||15000);
  if(timer.unref) timer.unref();
  server.on('close',()=>clearInterval(timer));
  return entry;
}

/* ---------- a minimal client, for tests and tools ---------- */
// connect('ws://host:port/path?query') resolves to a socket like the server's once the handshake is done. If the server
// answers without upgrading, it rejects with an error whose status is the HTTP status.
function connect(url){
  return new Promise((resolve,reject)=>{
    const u=new URL(url), key=crypto.randomBytes(16).toString('base64');
    const req=http.request({host:u.hostname,port:u.port||80,path:u.pathname+u.search,agent:false,headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Key':key,'Sec-WebSocket-Version':'13'}});
    req.on('upgrade',(res,tcp,head)=>{
      if(res.statusCode!==101||res.headers['sec-websocket-accept']!==acceptKey(key)){ tcp.destroy(); return reject(new Error('the server did not complete the handshake')); }
      const sock=makeSocket(tcp,{client:true}); if(head&&head.length) sock.push(head); resolve(sock);
    });
    req.on('response',res=>{ const e=new Error('no upgrade: HTTP '+res.statusCode); e.status=res.statusCode; res.resume(); req.destroy(); reject(e); });
    req.on('error',reject); req.end();
  });
}

module.exports={encodeFrame,createDecoder,acceptKey,attach,connect,OP,MAX_PAYLOAD};
