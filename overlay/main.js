// Doodle Duel desktop overlay: the fighters play on top of your real desktop.
// Run from the project folder:  npm run overlay
//
// A transparent, frameless, always-on-top window covers the screen's work area (everything above the taskbar) and
// shows the game page in desktop mode (duel.html?desk=1). While a fight is on, the window lets every click through to
// whatever is underneath; it only takes the mouse while the menu or the sketchbook is showing.
//   Ctrl+Alt+D  open or close the menu (also brings the keyboard back to the game)
//   Ctrl+Alt+Q  quit
const {app,BrowserWindow,globalShortcut,ipcMain,screen}=require('electron');
const path=require('path'), http=require('http'), fs=require('fs');
const PORT=+process.env.PORT||3000;
// --selftest=out.png renders one frame of a practice fight off-screen, saves it and quits (used to check the build).
const selftest=(process.argv.find(a=>a.startsWith('--selftest='))||'').slice(11);

function serverUp(){
  return new Promise(done=>{
    const req=http.get({host:'127.0.0.1',port:PORT,path:'/info',timeout:800},res=>{ res.resume(); done(res.statusCode===200); });
    req.on('error',()=>done(false)); req.on('timeout',()=>{ req.destroy(); done(false); });
  });
}
async function ensureServer(){
  if(await serverUp()) return;                         // a game server is already running: use it
  require(path.join(__dirname,'..','server.js'));      // otherwise run it inside this app
  for(let i=0;i<40&&!(await serverUp());i++) await new Promise(r=>setTimeout(r,100));
}

app.whenReady().then(async()=>{
  await ensureServer();
  const area=screen.getPrimaryDisplay().workArea;
  const win=new BrowserWindow({
    x:area.x,y:area.y,width:area.width,height:area.height,
    transparent:true,frame:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,
    hasShadow:false,alwaysOnTop:true,show:false,backgroundColor:'#00000000',title:'Doodle Duel',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}
  });
  win.setAlwaysOnTop(true,'screen-saver');
  win.setMenuBarVisibility(false);

  ipcMain.on('desk-interactive',(e,on)=>{ if(win.isDestroyed()) return; win.setIgnoreMouseEvents(!on,{forward:true}); if(on) win.focus(); });
  ipcMain.on('desk-focus',()=>{ if(!win.isDestroyed()) win.focus(); });
  ipcMain.on('desk-quit',()=>app.quit());

  await win.loadURL('http://localhost:'+PORT+'/duel?desk=1');

  if(selftest){
    // Start a practice fight with stock items, step it to mid-swing, and save what the window would show.
    const info=await win.webContents.executeJavaScript(`(async()=>{
      document.getElementById('modePractice').click();
      const d=desk[0]; d.pen='fire'; takeStock(d,'sword'); await new Promise(r=>setTimeout(r,100));
      const S=sim; sim=null; let T=performance.now()+5000;
      const adv=n=>{ for(let j=0;j<n;j++){ S.step(1/60); accept(S.snapshot()); T+=16.67; syncUI(); deskSync(); render(T); } };
      adv(5); S.f[1].x=S.f[0].x+110; inp[0].a++; S.setInput(0,inp[0]);
      let n=0; while(n++<60){ adv(1); const a=view.f[0].act; if(a&&a.t>=0.14) break; }
      return {arenaWidth:ARENA_W,canvas:[cv.width,cv.height],phase:view.phase,act:view.f[0].act&&view.f[0].act.m,menu:document.body.classList.contains('menu'),host:!!window.overlayHost};
    })()`);
    console.log('selftest',JSON.stringify(info));
    const img=await win.webContents.capturePage();
    fs.writeFileSync(selftest,img.toPNG()); console.log('selftest wrote',selftest,img.getSize());
    app.quit(); return;
  }

  win.show(); win.focus();
  globalShortcut.register('Control+Alt+D',()=>{ if(win.isDestroyed()) return; win.show(); win.focus(); win.webContents.send('desk-menu'); });
  globalShortcut.register('Control+Alt+Q',()=>app.quit());
  win.on('closed',()=>app.quit());
});
app.on('will-quit',()=>globalShortcut.unregisterAll());
app.on('window-all-closed',()=>app.quit());
