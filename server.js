// Doodle Duel server: serves the game and hands everything under /duel to duel-server.js (drawings read with OpenAI,
// online rooms). The old lane battler that used to live at / was removed; / now goes to /duel.
// Run:  put your key in the .env file next to this script, then:  node server.js   (Node 18+, no dependencies)
// Settings (.env or environment): OPENAI_API_KEY, OPENAI_MODEL (default gpt-6-luna), PORT (default 3000), OPENAI_BASE_URL.
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');

// Load KEY=value lines from a .env file next to this script (real environment variables win).
try{ for(const line of fs.readFileSync(path.join(__dirname,'.env'),'utf8').split(/\r?\n/)){
  const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i); if(!m||line.trim().startsWith('#')) continue;
  const v=m[2].replace(/^(['"])(.*)\1$/,'$2'); if(v&&process.env[m[1]]===undefined) process.env[m[1]]=v; } }catch(e){}
const KEY=process.env.OPENAI_API_KEY, MODEL=process.env.OPENAI_MODEL||'gpt-6-luna';
const BASE=(process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,''), PORT=+process.env.PORT||3000;

function lanUrl(){
  for(const list of Object.values(os.networkInterfaces())) for(const a of list||[])
    if(a.family==='IPv4'&&!a.internal) return 'http://'+a.address+':'+PORT;
  return null;
}

/* ---------- http ---------- */
function readBody(req,limit){
  return new Promise((resolve,reject)=>{
    const chunks=[]; let size=0;
    req.on('data',c=>{ size+=c.length; if(size>limit){ reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end',()=>resolve(Buffer.concat(chunks))); req.on('error',reject);
  });
}
const duel=require('./duel-server.js')({readBody,KEY,MODEL,BASE});
const FILES={'/qrcode.js':['qrcode.js','text/javascript; charset=utf-8']};
const server=http.createServer(async (req,res)=>{
  const send=(code,obj)=>{ res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); };
  const url=new URL(req.url,'http://x');
  try{
    if(await duel(req,res,url)) return;
    if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){ res.writeHead(302,{Location:'/duel'+url.search}); return res.end(); }
    if(req.method==='GET'&&FILES[url.pathname]){
      const [file,type]=FILES[url.pathname];
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'}); return fs.createReadStream(path.join(__dirname,file)).pipe(res);
    }
    if(req.method==='GET'&&url.pathname==='/info') return send(200,{reader:KEY?'OpenAI':'local guess (no key on the server)',lanUrl:lanUrl(),brains:duel.brains()});

    send(404,{error:'not found'});
  }catch(e){ console.error(req.method,url.pathname,'failed:',e.message); if(!res.headersSent) send(500,{error:'Server error.'}); else res.end(); }
});
// Duel rooms can also be reached by WebSocket (/duel/ws). NOWS=1 leaves that off, to try a network that drops upgrades.
if(process.env.NOWS!=='1') duel.sockets(server);
server.listen(PORT,()=>{
  console.log('Doodle Duel on http://localhost:'+PORT+'/duel');
  const lan=lanUrl(); if(lan) console.log('Other devices on the same Wi-Fi: '+lan);
  console.log('Drawings read by: '+(KEY?'OpenAI '+MODEL:'local guess (no OPENAI_API_KEY in .env)'));
});
