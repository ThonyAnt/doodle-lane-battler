// A stand-in for the OpenAI chat completions endpoint, for tests and for trying the drawing reader by hand without a key.
//   const fake=await require('./fake-openai.js').start(replies, opts)      -> {url, bodies, close}
//     replies  what POST /chat/completions answers with, in turn: text, {wait:ms, text} for a late answer, 'HANG' for
//              none at all, {status:500} for an error, or a function (body) => any of these
//     opts.then  what to answer once the replies have run out (as above); without it, an error 500
//     url      what to give the server as OPENAI_BASE_URL;  bodies  every request body received, parsed
//   Each text is wrapped as {choices:[{message:{content}}]}, the way the real endpoint answers.
// Run on its own it plays a reader that calls every drawing a sword and scores it by the label typed (see canned):
//   node tools/fake-openai.js [port, default 3192]
// Start the game with   OPENAI_API_KEY=test OPENAI_BASE_URL=<the url> node server.js
const http=require('http');

function start(replies,opts){
  const queue=(replies||[]).slice(), bodies=[], open=new Set();
  const server=http.createServer((req,res)=>{
    const chunks=[]; req.on('data',c=>chunks.push(c)); req.on('error',()=>{});
    req.on('end',()=>{
      let body=null; try{ body=JSON.parse(Buffer.concat(chunks).toString('utf8')); }catch(e){}
      const json=(code,obj)=>{ if(res.destroyed) return; res.writeHead(code,{'Content-Type':'application/json'}); res.end(JSON.stringify(obj)); };
      if(req.method!=='POST'||!/\/chat\/completions$/.test(req.url.split('?')[0])) return json(404,{error:{message:'the stand-in only knows /chat/completions'}});
      bodies.push(body);
      let r=queue.length?queue.shift():opts&&opts.then;
      if(typeof r==='function') r=r(body);
      if(r==='HANG') return;                                    // never answers; the connection closes with the server
      if(r===undefined||r===null||(typeof r==='object'&&r.status)) return json((r&&r.status)||500,{error:{message:'the stand-in has no reply for this'}});
      const text=typeof r==='object'?r.text:r, wait=typeof r==='object'?+r.wait||0:0;
      setTimeout(()=>json(200,{choices:[{message:{role:'assistant',content:text}}]}),wait);
    });
  });
  server.on('connection',s=>{ open.add(s); s.on('close',()=>open.delete(s)); });
  return new Promise((resolve,reject)=>{
    server.on('error',reject);
    server.listen((opts&&opts.port)||0,'127.0.0.1',()=>resolve({url:'http://127.0.0.1:'+server.address().port,bodies,
      close:()=>new Promise(done=>{ for(const s of open) s.destroy(); server.close(()=>done()); })}));
  });
}

// The stand-in reader. A drawing gets called a sword and, like the real reader, a creativity score, a line saying why,
// and abilities. What it answers follows the label the player typed, so every path can be tried by hand:
//   a label with "plain"   a score of 2 and no abilities
//   a label with "broken"  a score of 8, one good script and one that does not parse (so the server asks for it to be mended)
//   a label with "lazy"    a score of 9 and no abilities at all (the server fills in built-in ones)
//   a label with "slow"    the same as the default, 11 seconds late (the server gives up and reads the drawing itself)
//   anything else          a score of 8 and two abilities, one script and one block used as it is
// A request to mend a script (a system message that says so, no picture) gets a working one back.
function canned(body){
  const msgs=(body&&body.messages)||[], last=msgs[msgs.length-1]||{}, first=msgs[0]||{};
  if(!Array.isArray(last.content)){
    if(/fix one ability/i.test(String(first.content||''))) return JSON.stringify({name:'Mended',blurb:'Every second hit marks the foe.',on:'hit',cooldown:1,code:"mem.n += 1; if (mem.n >= 2) { mem.n = 0; status('mark'); say('MENDED'); }"});
    return JSON.stringify({});
  }
  const text=String((last.content.find(c=>c&&c.type==='text')||{}).text||''), label=(/labelled (?:the drawing|it): "([^"]*)"/.exec(text)||[])[1]||'', has=w=>label.toLowerCase().includes(w);
  const base={sees:'a long line with a short line across it',name:label||'Sword',kind:'melee',style:'blade',element:'none',power:5,range:5,speed:5,traits:['swift','guard']};
  const good={name:'Second Cut',blurb:'Every second hit lands harder, with a ring.',on:'hit',cooldown:0.5,code:"mem.n += 1; if (mem.n >= 2) { mem.n = 0; hit.scale(1.2); ring(foe.x, foe.y + 50); say('SECOND CUT'); }"};
  let more;
  if(!/SCORE THE DRAWING|CREATIVITY AND ABILITIES/i.test(text)) more={};      // the server was started with ABILITIES=0: it did not ask
  else if(has('plain')) more={creativity:2,why:'A plain sword: add an idea to earn abilities.',abilities:[]};
  else if(has('broken')) more={creativity:8,why:'A clear idea with detail.',abilities:[good,{name:'Oops',blurb:'This one does not parse.',on:'hit',cooldown:1,code:"if (foe.hp < { status('mark'); }"}]};
  else if(has('lazy')) more={creativity:9,why:'Inventive, but the reader wrote nothing.',abilities:[]};
  else more={creativity:8,why:'A clear idea with detail.',abilities:[good,{name:'Open Wound',blurb:'Hits pull healing orbs out of the foe.',block:'lifesteal'}]};
  const out=JSON.stringify(Object.assign(base,more));
  return has('slow')?{wait:11000,text:out}:out;
}

module.exports={start,canned};
if(require.main===module){
  const port=+process.argv[2]||3192;
  start([],{then:canned,port}).then(f=>console.log('Stand-in model on '+f.url+'\nStart the game with:  OPENAI_API_KEY=test OPENAI_BASE_URL='+f.url+' node server.js'),e=>{ console.error('could not start: '+e.message); process.exit(1); });
}
