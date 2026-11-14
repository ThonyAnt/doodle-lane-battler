// Render still frames of animation clips to a PNG, using a headless browser on anim-lab.html.
//   node tools/strip.js <clip[,clip2,...]> [frames=8] [out.png] [extra query, e.g. "t0=0.1&t1=0.3&len=140&cols=4"]
// Example: node tools/strip.js blade1,blade2,blade3 18 anim/out/combo.png
// Also checks every clip file loads and prints each clip's duration and marks.
const {execFileSync}=require('child_process'), fs=require('fs'), path=require('path'), os=require('os');
const root=path.join(__dirname,'..'), [clip,framesArg,outArg,extra]=process.argv.slice(2);
if(!clip){ console.error('usage: node tools/strip.js <clip[,clip...]> [frames] [out.png] [extra query]'); process.exit(1); }

// Load the clip files in Node first, so syntax errors and bad keys show up as readable messages.
global.window=global;
for(const f of ['core','example','locomotion','blade','bow','gun','spear','hammer','fist','staff','hurl','ultimate']){
  const file=path.join(root,'anim',f+'.js'); if(!fs.existsSync(file)) continue;
  try{ require(file); }catch(e){ console.error('ERROR in anim/'+f+'.js: '+e.message); process.exit(1); }
}
const names=clip.split(',');
for(const n of names){
  const c=global.ANIM.clips[n];
  if(!c){ console.error('No such clip: '+n+'. Known: '+Object.keys(global.ANIM.clips).join(', ')); process.exit(1); }
  console.log(n+': dur '+c.dur+' s, '+c.keys.length+' keys'+(c.loop?', loop':'')+(c.marks.length?', marks '+c.marks.map(m=>m.type+'@'+m.t).join(' '):'')+(c.trail.length?', trail '+JSON.stringify(c.trail):''));
}

const frames=Math.max(1,+framesArg||8), q=new URLSearchParams(extra||''), cols=+q.get('cols')||Math.min(frames,6), rows=Math.ceil(frames/cols);
const out=path.resolve(outArg||path.join(root,'anim','out',names.join('+')+'.png'));
fs.mkdirSync(path.dirname(out),{recursive:true});
const browser=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!browser){ console.error('No Edge or Chrome found for screenshots.'); process.exit(1); }
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'animlab-'));
const url='file:///'+path.join(root,'anim-lab.html').replace(/\\/g,'/')+'?clip='+encodeURIComponent(clip)+'&strip='+frames+(extra?'&'+extra:'');
try{
  execFileSync(browser,['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--user-data-dir='+profile,
    '--window-size='+(cols*250)+','+(rows*250+26),'--virtual-time-budget=1500','--screenshot='+out,url],{stdio:'ignore',timeout:60000});
}finally{ try{ fs.rmSync(profile,{recursive:true,force:true}); }catch(e){} }
console.log(fs.existsSync(out)?'wrote '+out:'screenshot failed');
