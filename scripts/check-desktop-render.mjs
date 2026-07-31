import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const executable = process.env.DESKTOP_EXE || path.resolve('release', 'win-unpacked', '研时.exe')
const port = 9335
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yanshi-render-check-'))
const screenshotPath = path.resolve('work', 'desktop-render-check.png')
const child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`], {
  cwd: path.dirname(executable),
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
})

let socket
let nextId = 1
const pending = new Map()

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function findPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await delay(250)
  }
  throw new Error('Electron debugging page did not become available')
}

function command(method, params = {}) {
  const id = nextId
  nextId += 1
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

try {
  const page = await findPage()
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const request = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  await command('Page.enable')
  await command('Runtime.enable')
  const evaluation = await command('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const deadline = Date.now() + 8000;
      const inspect = () => {
        const root = document.getElementById('root');
        const result = {
          childCount: root?.childElementCount || 0,
          text: document.body?.innerText || '',
          url: location.href
        };
        if (result.childCount > 0 || Date.now() >= deadline) resolve(result);
        else setTimeout(inspect, 100);
      };
      inspect();
    })`,
    awaitPromise: true,
    returnByValue: true,
  })
  const rendered = evaluation.result.value
  const screenshot = await command('Page.captureScreenshot', { format: 'png' })
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))

  const interactionEvaluation = await command('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const clickButton = (label) => {
        const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === label);
        button?.click();
        return Boolean(button);
      };
      const settingsOpened = clickButton('专注设置');
      setTimeout(() => {
        const examDate = document.querySelector('.date-setting input[type="date"]')?.value;
        const applyClicked = clickButton('应用计时设置');
        setTimeout(() => {
          const applyConfirmed = document.body.innerText.includes('已应用，计时器已重置');
          const statsOpened = clickButton('数据统计');
          setTimeout(() => {
            const reduceClicked = clickButton('减少时长');
            setTimeout(() => {
              const reduceModalOpened = document.body.innerText.includes('减少专注时长');
              document.querySelector('.modal .icon-button.small')?.click();
              const manualClicked = clickButton('补录时长');
              setTimeout(() => resolve({
                settingsOpened,
                examDate,
                applyClicked,
                applyConfirmed,
                statsOpened,
                reduceClicked,
                reduceModalOpened,
                manualClicked,
                manualModalOpened: document.body.innerText.includes('补录专注时长')
              }), 100);
            }, 100);
          }, 100);
        }, 100);
      }, 100);
    })`,
    awaitPromise: true,
    returnByValue: true,
  })
  const interactions = interactionEvaluation.result.value

  const passed = rendered.childCount > 0
    && rendered.text.includes('今天也要稳稳向前')
    && interactions.settingsOpened
    && interactions.examDate === '2027-12-25'
    && interactions.applyClicked
    && interactions.applyConfirmed
    && interactions.statsOpened
    && interactions.reduceClicked
    && interactions.reduceModalOpened
    && interactions.manualClicked
    && interactions.manualModalOpened
  console.log({ executable, screenshotPath, rendered: { ...rendered, text: rendered.text.slice(0, 180) }, interactions })
  if (!passed) throw new Error('Desktop renderer or core settings/statistics interactions failed')
  console.log('Desktop render check passed')
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: nextId, method: 'Browser.close', params: {} }))
  }
  socket?.close()
  await delay(500)
  if (!child.killed) child.kill()
  await fs.rm(profileDir, { recursive: true, force: true })
}
