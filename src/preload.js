const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程暴露安全的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取配置
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // 保存配置
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // 监听配置加载事件
  onLoadConfig: (callback) => ipcRenderer.on('load-config', callback),
  
  // 监听显示器列表加载事件
  onLoadDisplays: (callback) => ipcRenderer.on('load-displays', callback),
  
  // 移除监听器
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});