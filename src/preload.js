const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mathTutor", {
  solve: (payload) => ipcRenderer.invoke("solve-math-problem", payload)
});
