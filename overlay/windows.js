// Reads where the other apps' windows are, so the fighters can stand on them. Windows only.
// Everything here is read-only: it never moves, focuses or changes another window, and it never reads window titles.
// If the native library is missing (run `npm install`) or this is not Windows, load() returns null and the overlay
// simply runs without window terrain.
let api=null;
function load(){
  if(api!==null) return api||null;
  api=false;
  if(process.platform!=='win32') return null;
  try{
    const koffi=require('koffi'), user32=koffi.load('user32.dll'), dwm=koffi.load('dwmapi.dll');
    const RECT=koffi.struct('DD_RECT',{left:'long',top:'long',right:'long',bottom:'long'});
    api={
      top:user32.func('uintptr_t __stdcall GetTopWindow(uintptr_t hWnd)'),
      next:user32.func('uintptr_t __stdcall GetWindow(uintptr_t hWnd, uint32_t uCmd)'),
      visible:user32.func('int __stdcall IsWindowVisible(uintptr_t hWnd)'),
      iconic:user32.func('int __stdcall IsIconic(uintptr_t hWnd)'),
      titleLen:user32.func('int __stdcall GetWindowTextLengthW(uintptr_t hWnd)'),
      exStyle:user32.func('long __stdcall GetWindowLongW(uintptr_t hWnd, int nIndex)'),
      className:user32.func('int __stdcall GetClassNameW(uintptr_t hWnd, _Out_ uint16_t *buf, int max)'),
      pid:user32.func('uint32_t __stdcall GetWindowThreadProcessId(uintptr_t hWnd, _Out_ uint32_t *pid)'),
      frame:dwm.func('long __stdcall DwmGetWindowAttribute(uintptr_t hWnd, uint32_t attr, _Out_ DD_RECT *out, uint32_t size)'),
      cloaked:dwm.func('long __stdcall DwmGetWindowAttribute(uintptr_t hWnd, uint32_t attr, _Out_ int *out, uint32_t size)')
    };
  }catch(e){ console.error('Window terrain is off: '+e.message); api=false; }
  return api||null;
}
const SKIP_CLASS=new Set(['Progman','WorkerW','Shell_TrayWnd','Shell_SecondaryTrayWnd','Windows.UI.Core.CoreWindow']);
const WS_EX_TOOLWINDOW=0x80, WS_EX_TRANSPARENT=0x20, WS_EX_NOACTIVATE=0x08000000;

// Ordinary app windows from front to back, as {id, l, t, r, b} in physical screen pixels.
function listWindows(ownPid){
  const a=load(); if(!a) return null;
  const out=[], buf=Buffer.alloc(512);
  for(let h=a.top(0), n=0; h&&n<400; h=a.next(h,2), n++){
    if(!a.visible(h)||a.iconic(h)||a.titleLen(h)<=0) continue;
    const ex=a.exStyle(h,-20)>>>0; if(ex&(WS_EX_TOOLWINDOW|WS_EX_TRANSPARENT|WS_EX_NOACTIVATE)) continue;
    const pid=[0]; a.pid(h,pid); if(pid[0]===ownPid) continue;
    const hidden=[0]; if(a.cloaked(h,14,hidden,4)===0&&hidden[0]) continue;          // on another virtual desktop, or a suspended app
    const len=a.className(h,buf,255); if(SKIP_CLASS.has(buf.toString('utf16le',0,len*2))) continue;
    const r={}; if(a.frame(h,9,r,16)!==0) continue;                                    // the visible frame, without the invisible resize border
    if(r.right-r.left<120||r.bottom-r.top<60) continue;
    out.push({id:String(h),l:r.left,t:r.top,r:r.right,b:r.bottom});
    if(out.length>=40) break;
  }
  return out;
}

// The parts of each window's top edge that are actually visible (not covered by a window in front of it), as
// {id, wx, x0, x1, y} in the overlay window's own coordinates (CSS pixels from its top-left corner).
// wx is the window's left edge, so a fighter can be carried along when the window is dragged.
function topEdges(wins,scale,area){
  const rects=wins.map(w=>({id:w.id,l:w.l/scale-area.x,t:w.t/scale-area.y,r:w.r/scale-area.x,b:w.b/scale-area.y}));
  const out=[];
  rects.forEach((w,i)=>{
    const y=w.t; if(y<8||y>area.height-24) return;                 // maximised, or too close to the floor to matter
    let parts=[[Math.max(0,w.l),Math.min(area.width,w.r)]];
    for(let j=0;j<i&&parts.length;j++){
      const o=rects[j]; if(!(o.t<y&&o.b>y)) continue;
      parts=parts.flatMap(([a,b])=>o.r<=a||o.l>=b?[[a,b]]:[[a,Math.min(b,o.l)],[Math.max(a,o.r),b]]).filter(([a,b])=>b-a>=40);
    }
    for(const [a,b] of parts) if(b-a>=40) out.push({id:w.id,wx:Math.round(w.l),x0:Math.round(a),x1:Math.round(b),y:Math.round(y)});
  });
  return out.slice(0,32);
}
module.exports={load,listWindows,topEdges};
