const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('yanshiDesktop', {
  isDesktop: true,
  setFocusActive(active) {
    ipcRenderer.send('focus-active', Boolean(active))
  },
})
