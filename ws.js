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

module.exports={encodeFrame,createDecoder,OP,MAX_PAYLOAD};
