const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  togglePin: () => ipcRenderer.invoke('toolbar-toggle-pin'),
  getPinState: () => ipcRenderer.invoke('toolbar-get-pin'),
  openSettings: () => ipcRenderer.invoke('toolbar-open-settings'),
  quitApp: () => ipcRenderer.invoke('toolbar-quit'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});