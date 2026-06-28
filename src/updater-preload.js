// Мост между окном обновления (updater.html) и основным процессом.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("updaterAPI", {
  onProgress: (cb) => ipcRenderer.on("update-progress", (_e, percent) => cb(percent)),
  onReady: (cb) => ipcRenderer.on("update-ready", (_e, version) => cb(version)),
  onError: (cb) => ipcRenderer.on("update-error", () => cb()),
  restart: () => ipcRenderer.send("update-restart"),
  close: () => ipcRenderer.send("update-close"),
});
