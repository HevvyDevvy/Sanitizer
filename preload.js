const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadProfiles: () => ipcRenderer.invoke('profiles:load'),
  saveProfiles: (profiles) => ipcRenderer.invoke('profiles:save', profiles),
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  chooseTestFile: () => ipcRenderer.invoke('dialog:chooseTestFile'),
  runScan: (rootDir, profileName) => ipcRenderer.invoke('scan:run', { rootDir, profileName }),
  applyFindings: (findings) => ipcRenderer.invoke('scan:apply', findings),
  exportBundle: (profiles) => ipcRenderer.invoke('export:bundle', { profiles })
});
