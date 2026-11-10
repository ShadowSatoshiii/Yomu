'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The only things the page may ask the app to do.
contextBridge.exposeInMainWorld('yomu', {
  config: () => ipcRenderer.invoke('config'),
  issues: () => ipcRenderer.invoke('issues'),
  image: (url) => ipcRenderer.invoke('image', url),
  open: (url) => ipcRenderer.invoke('open', url),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
});
