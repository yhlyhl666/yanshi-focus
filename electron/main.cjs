const { app, BrowserWindow, ipcMain, powerSaveBlocker, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
}

app.setAppUserModelId('com.yanshi.focus')

let mainWindow = null
let focusBlockerId = null

function statePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function readWindowState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'))
  } catch {
    return { width: 1360, height: 860 }
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isMinimized() || mainWindow.isMaximized()) return
  try {
    fs.writeFileSync(statePath(), JSON.stringify(mainWindow.getBounds()))
  } catch {}
}

function createWindow() {
  const saved = readWindowState()
  mainWindow = new BrowserWindow({
    ...saved,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f5f1',
    title: '研时',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', saveWindowState)
  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL()
    if (url !== current && /^https?:\/\//i.test(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
}

ipcMain.on('focus-active', (_event, active) => {
  if (active && focusBlockerId === null) {
    focusBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  }
  if (!active && focusBlockerId !== null) {
    if (powerSaveBlocker.isStarted(focusBlockerId)) powerSaveBlocker.stop(focusBlockerId)
    focusBlockerId = null
  }
})

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (focusBlockerId !== null && powerSaveBlocker.isStarted(focusBlockerId)) {
    powerSaveBlocker.stop(focusBlockerId)
  }
})
