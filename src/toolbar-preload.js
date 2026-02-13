const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  togglePin: () => ipcRenderer.invoke('toolbar-toggle-pin'),
  getPinState: () => ipcRenderer.invoke('toolbar-get-pin'),
  openSettings: () => ipcRenderer.invoke('toolbar-open-settings'),
  quitApp: () => ipcRenderer.invoke('toolbar-quit'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  switchPage: (index) => ipcRenderer.invoke('toolbar-switch-page', index),
  refreshPage: () => ipcRenderer.invoke('toolbar-refresh-page'),
  onUpdatePages: (callback) => ipcRenderer.on('update-pages', callback)
});