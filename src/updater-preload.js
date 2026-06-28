// Мост между окном обновления (updater.html) и основным процессом.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("updaterAPI", {
  notifyReady: () => ipcRenderer.send("updater-ready"),
  onAvailable: (cb) => ipcRenderer.on("update-available", (_e, version) => cb(version)),
  onProgress: (cb) => ipcRenderer.on("update-progress", (_e, percent) => cb(percent)),
  onReady: (cb) => ipcRenderer.on("update-ready", (_e, version) => cb(version)),
  onError: (cb) => ipcRenderer.on("update-error", () => cb()),
  download: () => ipcRenderer.send("update-download"),
  restart: () => ipcRenderer.send("update-restart"),
});
