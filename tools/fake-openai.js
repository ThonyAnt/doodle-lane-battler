// A stand-in for the OpenAI chat completions endpoint, for tests and for trying RuleForge by hand without a key.
//   const fake=await require('./fake-openai.js').start(replies, opts)      -> {url, bodies, close}
//     replies  what POST /chat/completions answers with, in turn: text, {wait:ms, text} for a late answer, 'HANG' for
//              none at all, {status:500} for an error, or a function (body) => any of these
//     opts.then  what to answer once the replies have run out (as above); without it, an error 500
//     url      what to give the server as OPENAI_BASE_URL;  bodies  every request body received, parsed
//   Each text is wrapped as {choices:[{message:{content}}]}, the way the real endpoint answers.
// Run on its own it plays a model that knows one joke:   node tools/fake-openai.js [port, default 3192]
//   a rule request gets "Return Serve" for the first melee item against something thrown, and a second rule for the
//   other player; a drawing gets called a sword. Start the game with OPENAI_API_KEY=test OPENAI_BASE_URL=<the url>.
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

// The one-joke model. It reads which pairs the prompt says a rule can be written for, and answers for those.
function canned(body){
  const msgs=(body&&body.messages)||[], last=msgs[msgs.length-1]||{};
  if(Array.isArray(last.content)) return JSON.stringify({name:'Sword',kind:'melee',style:'blade',element:'none',power:5,range:5,speed:5,traits:['swift','guard']});      // a drawing to read
  const text=String(last.content||''), pair=(on,side)=>{ const m=new RegExp(on+' [^;]*?a=('+(side||'blue|red')+')\\.([01]) b=(blue|red)\\.([01])').exec(text); return m&&{a:m[1]+'.'+m[2],b:m[3]+'.'+m[4]}; };
  const rules=[], swat=pair('swat');
  if(swat) rules.push({name:'Return Serve',blurb:'The racket swats the ball straight back.',a:swat.a,b:swat.b,on:'swat',cooldown:0.4,code:"if (shot.speed > 100) { shot.reflect(1.2); say('RETURN!'); }"});
  const other=swat?(swat.a.startsWith('blue')?'red':'blue'):'', hit=pair('strike',other)||pair('strike');
  if(hit) rules.push({name:'Bounce Back',blurb:'Every third hit lands with a boing.',a:hit.a,b:hit.b,on:'strike',cooldown:1,code:"mem.n += 1; if (mem.n % 3 == 0) { hit.scale(1.3); push(foe, me.face * 300, 200); say('BOING!'); } else { spark(foe.x, foe.y + 60); }"});
  if(!rules.length){ const m=/^(blue)\.([01]) /m.exec(text), n=/^(red)\.([01]) /m.exec(text); if(m&&n) rules.push({name:'Stare Down',blurb:'Standing close, the two glare at each other.',a:m[1]+'.'+m[2],b:n[1]+'.'+n[2],on:'near',cooldown:3,code:"if (dist < 120) { spark(foe.x, foe.y + 80); say('GRRR'); }"}); }
  return JSON.stringify({rules});
}

module.exports={start,canned};
if(require.main===module){
  const port=+process.argv[2]||3192;
  start([],{then:canned,port}).then(f=>console.log('Stand-in model on '+f.url+'\nStart the game with:  OPENAI_API_KEY=test OPENAI_BASE_URL='+f.url+' node server.js'),e=>{ console.error('could not start: '+e.message); process.exit(1); });
}
