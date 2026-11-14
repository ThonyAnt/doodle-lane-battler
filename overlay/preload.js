// Bridge between the game page and the overlay app. The page only gets these calls.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('overlayHost',{
  setInteractive:on=>ipcRenderer.send('desk-interactive',!!on),   // true: the window takes the mouse; false: clicks pass through
  focus:()=>ipcRenderer.send('desk-focus'),
  quit:()=>ipcRenderer.send('desk-quit'),
  onMenu:fn=>ipcRenderer.on('desk-menu',()=>fn()),                // the global menu shortcut was pressed
  onWindows:fn=>ipcRenderer.on('desk-windows',(e,edges)=>fn(edges)) // visible top edges of other windows, in this window's pixels
});
