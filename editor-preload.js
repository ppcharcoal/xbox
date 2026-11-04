'use strict';
// Bridge for the controls editor window (editor.html). It can only read and save
// the control profiles; nothing else from the app is exposed.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xboxPlay', {
  load: () => ipcRenderer.invoke('mappings:get'),
  save: (data) => ipcRenderer.invoke('mappings:save', data),
  onChanged: (callback) => {
    ipcRenderer.on('mappings:changed', (_event, data) => callback(data));
  },
});
