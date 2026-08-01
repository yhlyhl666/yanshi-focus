import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  CirclePlus,
  Clock3,
  Coffee,
  Database,
  Footprints,
  Headphones,
  History,
  ListTodo,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings,
  SkipForward,
  Target,
  Trash2,
  Undo2,
  Wind,
  X,
} from 'lucide-react'
import studyDesk from './assets/study-desk.jpg'
import petSprite from './assets/yanshi-cat-sprite.png'

const SUBJECTS = [
  { id: 'math', name: '数学', color: 'var(--color-subject-math)' },
  { id: 'english', name: '英语', color: 'var(--color-subject-english)' },
  { id: 'politics', name: '政治', color: 'var(--color-subject-politics)' },
  { id: 'major', name: '专业课', color: 'var(--color-subject-major)' },
]

const NAV_ITEMS = [
  { id: 'today', label: '今日专注', mobileLabel: '今日', icon: Clock3 },
  { id: 'tasks', label: '学习任务', mobileLabel: '任务', icon: ListTodo },
  { id: 'stats', label: '数据统计', mobileLabel: '统计', icon: BarChart3 },
  { id: 'settings', label: '专注设置', mobileLabel: '设置', icon: Settings },
]

const DEFAULT_TASKS = [
  { id: 1, title: '高等数学：极限与连续', subject: 'math', estimate: 3, energy: 4, completed: false },
  { id: 2, title: '英语阅读真题 2012 Text 1', subject: 'english', estimate: 2, energy: 3, completed: false },
  { id: 3, title: '政治：马克思主义基本原理', subject: 'politics', estimate: 2, energy: 2, completed: true },
]

const DEFAULT_SETTINGS = {
  focus: 50,
  shortBreak: 10,
  longBreak: 20,
  dailyGoal: 300,
  examDate: '2027-12-25',
  autoBreak: false,
  strictMode: false,
}

const DAILY_ENERGY_CAPACITY = 10

const RELIEF_ACTIVITIES = [
  { id: 'stretch', label: '拉伸肩颈', detail: '离开座位活动一下', minutes: 8, relief: 1, icon: Wind },
  { id: 'music', label: '听几首歌', detail: '把注意力从任务上移开', minutes: 10, relief: 1, icon: Headphones },
  { id: 'walk', label: '出去走走', detail: '晒晒太阳或透透气', minutes: 15, relief: 2, icon: Footprints },
  { id: 'watch', label: '看点喜欢的内容', detail: '给自己一个有边界的小娱乐', minutes: 15, relief: 1, icon: Clapperboard },
  { id: 'snack', label: '吃点东西', detail: '补充水分和能量', minutes: 15, relief: 1, icon: Coffee },
  { id: 'nap', label: '小睡一下', detail: '短暂闭眼，避免越休息越累', minutes: 20, relief: 2, icon: Moon },
]

const normalizeCustomRecovery = (activity, index = 0) => {
  if (!activity || typeof activity !== 'object') return null
  const label = String(activity.label || '').trim().slice(0, 20)
  const minutes = Math.min(180, Math.max(1, Math.round(Number(activity.minutes))))
  const relief = Math.min(3, Math.max(1, Math.round(Number(activity.relief))))
  if (!label || !Number.isFinite(minutes) || !Number.isFinite(relief)) return null
  return {
    id: String(activity.id || `custom-${Date.now()}-${index}`),
    label,
    detail: '我的自定义放松',
    minutes,
    relief,
    custom: true,
  }
}

const PET_EVENTS = {
  focus: { tone: 'steady', mood: 'focus', label: '妙脆角猫认真起来了', message: '这一轮只做眼前这一件事，我陪你守住专注。' },
  paused: { tone: 'full', mood: 'tired', label: '先喘口气', message: '暂停不是放弃，整理一下再回来就好。' },
  sessionDone: { tone: 'light', mood: 'celebrate', label: '这一轮完成啦', message: '妙脆角猫举爪庆祝，喝口水再决定下一步。' },
  taskDone: { tone: 'steady', mood: 'celebrate', label: '又完成一件', message: '任务被稳稳拿下，今天的压力也轻了一点。' },
  recovered: { tone: 'rest', mood: 'relaxed', label: '压力降下来啦', message: '放松不是偷懒，是给下一轮专注留力气。' },
}

const getTaskEnergy = (task) => Math.min(5, Math.max(1, Number(task?.energy ?? task?.estimate ?? 1)))

const getEnergyStatus = (load, openTaskCount) => {
  if (!openTaskCount) return { id: 'rest', tone: 'rest', label: '清空啦', message: '今天的任务已经完成，放心去休息吧。', mood: 'relaxed' }
  if (load >= DAILY_ENERGY_CAPACITY) return { id: 'overload', tone: 'overload', label: '超载', message: '今天可能已经装不下这么多事情了。', mood: 'overload' }
  if (load >= 7) return { id: 'full', tone: 'full', label: '偏满', message: '先完成最重要的一件，再决定要不要加任务。', mood: 'tired' }
  if (load >= 4) return { id: 'steady', tone: 'steady', label: '舒适区', message: '今天节奏刚刚好，稳稳推进就行。', mood: 'ready' }
  return { id: 'light', tone: 'light', label: '轻负荷', message: '精力还有余量，可以从小任务开始。', mood: 'ready' }
}

const getDayKey = (date = new Date()) => {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

const load = (key, fallback) => {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

const formatClock = (seconds) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
  const secs = Math.max(0, seconds % 60).toString().padStart(2, '0')
  return `${mins}:${secs}`
}

const formatMinutes = (minutes) => {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`
}

const startOfWeek = (date) => {
  const result = new Date(date)
  const day = result.getDay() || 7
  result.setDate(result.getDate() - day + 1)
  result.setHours(0, 0, 0, 0)
  return result
}

const shiftPeriod = (date, period, amount) => {
  const result = new Date(date)
  if (period === 'day') result.setDate(result.getDate() + amount)
  if (period === 'week') result.setDate(result.getDate() + amount * 7)
  if (period === 'month') result.setMonth(result.getMonth() + amount)
  return result
}

const periodLabel = (date, period) => {
  if (period === 'day') return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  if (period === 'month') return `${date.getFullYear()}年${date.getMonth() + 1}月`
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`
}

const filterSessionsByPeriod = (sessions, date, period) => {
  if (period === 'day') return sessions.filter((item) => item.date === getDayKey(date))
  if (period === 'month') {
    const prefix = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`
    return sessions.filter((item) => item.date.startsWith(prefix))
  }
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return sessions.filter((item) => {
    const sessionDate = new Date(`${item.date}T12:00:00`)
    return sessionDate >= start && sessionDate < end
  })
}

const calculateStreak = (sessions) => {
  const days = new Set(sessions.map((item) => item.date))
  if (!days.size) return 0
  const cursor = new Date()
  if (!days.has(getDayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(getDayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function useEscapeClose(onClose) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
}

function App() {
  const [view, setView] = useState('today')
  const [tasks, setTasks] = useState(() => {
    const savedTasks = load('yanshi.tasks', DEFAULT_TASKS)
    return Array.isArray(savedTasks) ? savedTasks.map((task) => ({ ...task, energy: getTaskEnergy(task) })) : DEFAULT_TASKS
  })
  const [sessions, setSessions] = useState(() => load('yanshi.sessions', []))
  const [recoveryLogs, setRecoveryLogs] = useState(() => {
    const saved = load('yanshi.recovery', [])
    return Array.isArray(saved) ? saved : []
  })
  const [customRecoveryActivities, setCustomRecoveryActivities] = useState(() => {
    const saved = load('yanshi.customRecovery.v1', [])
    return Array.isArray(saved) ? saved.map(normalizeCustomRecovery).filter(Boolean) : []
  })
  const [settings, setSettings] = useState(() => {
    const saved = load('yanshi.settings', {})
    const next = { ...DEFAULT_SETTINGS, ...saved }
    // Upgrade the original placeholder date to the 28th cohort's expected exam date.
    if (!saved.examDate || saved.examDate === '2026-12-20') next.examDate = DEFAULT_SETTINGS.examDate
    return next
  })
  const restoredTimer = useRef(load('yanshi.timer', null)).current
  const restoredRemaining = restoredTimer?.running && restoredTimer?.endAt
    ? Math.max(0, Math.ceil((restoredTimer.endAt - Date.now()) / 1000))
    : restoredTimer?.remaining
  const [mode, setMode] = useState(restoredTimer?.mode || 'focus')
  const [selectedSubject, setSelectedSubject] = useState(restoredTimer?.selectedSubject || 'math')
  const [selectedTask, setSelectedTask] = useState(restoredTimer?.selectedTask ?? 1)
  const [remaining, setRemaining] = useState(restoredRemaining > 0 ? restoredRemaining : settings.focus * 60)
  const [running, setRunning] = useState(Boolean(restoredTimer?.running && restoredRemaining > 0))
  const [showAdd, setShowAdd] = useState(false)
  const [subjectMenu, setSubjectMenu] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [showRecoveryHistory, setShowRecoveryHistory] = useState(false)
  const [editingEnergyTask, setEditingEnergyTask] = useState(null)
  const [petEvent, setPetEvent] = useState(null)
  const [undoDelete, setUndoDelete] = useState(null)
  const endAtRef = useRef(restoredTimer?.endAt || null)

  const duration = (mode === 'focus' ? settings.focus : settings.shortBreak) * 60
  const subject = SUBJECTS.find((item) => item.id === selectedSubject) || SUBJECTS[0]
  const activeTask = tasks.find((task) => task.id === selectedTask)

  useEffect(() => localStorage.setItem('yanshi.tasks', JSON.stringify(tasks)), [tasks])
  useEffect(() => localStorage.setItem('yanshi.sessions', JSON.stringify(sessions)), [sessions])
  useEffect(() => localStorage.setItem('yanshi.recovery', JSON.stringify(recoveryLogs)), [recoveryLogs])
  useEffect(() => localStorage.setItem('yanshi.customRecovery.v1', JSON.stringify(customRecoveryActivities)), [customRecoveryActivities])
  useEffect(() => localStorage.setItem('yanshi.settings', JSON.stringify(settings)), [settings])
  useEffect(() => {
    localStorage.setItem('yanshi.timer', JSON.stringify({
      mode,
      running,
      remaining,
      selectedSubject,
      selectedTask,
      endAt: running ? endAtRef.current || Date.now() + remaining * 1000 : null,
    }))
  }, [mode, running, remaining, selectedSubject, selectedTask])

  useEffect(() => {
    if (!running) return
    endAtRef.current = Date.now() + remaining * 1000
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      setRemaining(next)
      if (next === 0) {
        window.clearInterval(timer)
        setRunning(false)
        if (mode === 'focus') {
          setSessions((current) => [...current, {
            id: Date.now(),
            date: getDayKey(),
            subject: selectedSubject,
            taskId: selectedTask,
            minutes: settings.focus,
          }])
          showPetEvent(PET_EVENTS.sessionDone)
        } else {
          showPetEvent(PET_EVENTS.recovered)
        }
        playBell()
        if (mode === 'focus' && settings.autoBreak) {
          window.setTimeout(() => {
            setMode('break')
            setRemaining(settings.shortBreak * 60)
            setRunning(true)
          }, 400)
        }
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    document.title = running ? `${formatClock(remaining)} · ${subject.name}` : '研时 · 考研专注计时器'
  }, [remaining, running, subject.name])

  useEffect(() => {
    window.yanshiDesktop?.setFocusActive(running)
    return () => window.yanshiDesktop?.setFocusActive(false)
  }, [running])

  useEffect(() => {
    if (!undoDelete) return
    const timeout = window.setTimeout(() => setUndoDelete(null), 7000)
    return () => window.clearTimeout(timeout)
  }, [undoDelete])

  useEffect(() => {
    if (!petEvent) return
    const timeout = window.setTimeout(() => setPetEvent(null), 8000)
    return () => window.clearTimeout(timeout)
  }, [petEvent])

  const todaySessions = useMemo(() => sessions.filter((item) => item.date === getDayKey()), [sessions])
  const todayMinutes = todaySessions.reduce((sum, item) => sum + item.minutes, 0)
  const completedToday = tasks.filter((task) => task.completed).length
  const examTime = new Date(`${settings.examDate || DEFAULT_SETTINGS.examDate}T00:00:00`).getTime()
  const examDays = Number.isFinite(examTime) ? Math.max(0, Math.ceil((examTime - Date.now()) / 86400000)) : 0
  const streak = calculateStreak(sessions)

  const weekData = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - 6 + index)
      const key = getDayKey(date)
      return {
        key,
        label: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
        minutes: sessions.filter((item) => item.date === key).reduce((sum, item) => sum + item.minutes, 0),
        today: key === getDayKey(),
      }
    })
  }, [sessions])

  function playBell() {
    try {
      const ctx = new AudioContext()
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.frequency.value = 660
      gain.gain.setValueAtTime(0.16, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1)
      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 1.1)
    } catch {}
  }

  function showPetEvent(event) {
    setPetEvent({ ...event, eventId: Date.now() })
  }

  function toggleTimer() {
    const nextRunning = !running
    setRunning(nextRunning)
    if (mode === 'focus') showPetEvent(nextRunning ? PET_EVENTS.focus : PET_EVENTS.paused)
    if (mode === 'break') showPetEvent(PET_EVENTS.recovered)
  }

  function selectMode(nextMode) {
    if (running && settings.strictMode && !window.confirm('严格模式已开启，确定要中断本轮专注吗？')) return
    setMode(nextMode)
    setRunning(false)
    setRemaining((nextMode === 'focus' ? settings.focus : settings.shortBreak) * 60)
  }

  function resetTimer() {
    if (running && settings.strictMode && !window.confirm('重置会放弃本轮记录，仍然继续吗？')) return false
    setRunning(false)
    setRemaining(duration)
    return true
  }

  function skipTimer() {
    if (running && settings.strictMode && !window.confirm('严格模式已开启，确定跳过当前阶段吗？')) return
    setRunning(false)
    const nextMode = mode === 'focus' ? 'break' : 'focus'
    setMode(nextMode)
    setRemaining((nextMode === 'focus' ? settings.focus : settings.shortBreak) * 60)
  }

  function setFocusDuration(minutes) {
    if (running || mode !== 'focus') return
    setSettings((current) => ({ ...current, focus: minutes }))
    setRemaining(minutes * 60)
  }

  function toggleTask(id) {
    const target = tasks.find((task) => task.id === id)
    if (!target) return
    const willComplete = !target.completed
    setTasks((current) => current.map((task) => task.id === id
      ? { ...task, completed: willComplete, completedAt: willComplete ? Date.now() : null }
      : task))
    if (willComplete) showPetEvent(PET_EVENTS.taskDone)
  }

  function deleteTask(id) {
    setTasks((current) => {
      const index = current.findIndex((task) => task.id === id)
      if (index < 0) return current
      setUndoDelete({ task: current[index], index })
      return current.filter((task) => task.id !== id)
    })
    if (selectedTask === id) setSelectedTask(null)
  }

  function restoreDeletedTask() {
    if (!undoDelete) return
    setTasks((current) => {
      const next = [...current]
      next.splice(Math.min(undoDelete.index, next.length), 0, undoDelete.task)
      return next
    })
    setUndoDelete(null)
  }

  function addTask(task) {
    const next = { ...task, id: Date.now(), completed: false }
    setTasks((current) => [...current, next])
    setSelectedTask(next.id)
    setShowAdd(false)
  }

  function updateTaskEnergy(id, energy) {
    const nextEnergy = Math.min(5, Math.max(1, Number(energy)))
    setTasks((current) => current.map((task) => task.id === id ? { ...task, energy: nextEnergy } : task))
    setEditingEnergyTask(null)
  }

  function completeRecovery(activity) {
    setRecoveryLogs((current) => [...current, {
      id: Date.now(),
      date: getDayKey(),
      activityId: activity.id,
      label: activity.label,
      minutes: activity.minutes,
      relief: activity.relief,
    }])
    setShowRecovery(false)
    showPetEvent(PET_EVENTS.recovered)
  }

  function removeRecoveryLog(id) {
    setRecoveryLogs((current) => current.filter((log) => log.id !== id))
  }

  function restoreRecoveryLog(log) {
    setRecoveryLogs((current) => current.some((item) => item.id === log.id) ? current : [...current, log])
  }

  function createCustomRecovery(activity) {
    const normalized = normalizeCustomRecovery(activity)
    if (!normalized) return
    setCustomRecoveryActivities((current) => [...current, normalized])
  }

  function deleteCustomRecovery(id) {
    setCustomRecoveryActivities((current) => current.filter((activity) => activity.id !== id))
  }

  function restoreCustomRecovery(activity) {
    setCustomRecoveryActivities((current) => current.some((item) => item.id === activity.id) ? current : [...current, activity])
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} examDays={examDays} />
      <main className="main" id="main-content">
        <Header view={view} examDays={examDays} streak={streak} tasks={tasks} sessions={sessions} />
        {view === 'today' && (
          <Dashboard
            mode={mode}
            selectMode={selectMode}
            remaining={remaining}
            duration={duration}
            running={running}
            setRunning={setRunning}
            resetTimer={resetTimer}
            skipTimer={skipTimer}
            subject={subject}
            selectedSubject={selectedSubject}
            setSelectedSubject={setSelectedSubject}
            subjectMenu={subjectMenu}
            setSubjectMenu={setSubjectMenu}
            activeTask={activeTask}
            tasks={tasks}
            selectedTask={selectedTask}
            setSelectedTask={setSelectedTask}
            todayMinutes={todayMinutes}
            completedToday={completedToday}
            weekData={weekData}
            dailyGoal={settings.dailyGoal}
            focusDuration={settings.focus}
            setFocusDuration={setFocusDuration}
            setImmersive={setImmersive}
            toggleTimer={toggleTimer}
            toggleTask={toggleTask}
            setShowAdd={setShowAdd}
            setView={setView}
            recoveryLogs={recoveryLogs}
            petEvent={petEvent}
            setShowRecovery={setShowRecovery}
            setShowRecoveryHistory={setShowRecoveryHistory}
          />
        )}
        {view === 'tasks' && <TasksView tasks={tasks} toggleTask={toggleTask} deleteTask={deleteTask} setShowAdd={setShowAdd} onEditEnergy={setEditingEnergyTask} />}
        {view === 'stats' && <StatsView sessions={sessions} setSessions={setSessions} />}
        {view === 'settings' && <SettingsView settings={settings} setSettings={setSettings} resetTimer={resetTimer} />}
      </main>
      <MobileNav view={view} setView={setView} />
      {showAdd && <AddTaskModal onClose={() => setShowAdd(false)} onAdd={addTask} />}
      {showRecovery && <RecoveryModal customActivities={customRecoveryActivities} onCreateCustom={createCustomRecovery} onDeleteCustom={deleteCustomRecovery} onRestoreCustom={restoreCustomRecovery} onClose={() => setShowRecovery(false)} onComplete={completeRecovery} />}
      {showRecoveryHistory && <RecoveryHistoryModal recoveryLogs={recoveryLogs} tasks={tasks} onRemove={removeRecoveryLog} onRestore={restoreRecoveryLog} onClose={() => setShowRecoveryHistory(false)} onAddRecovery={() => { setShowRecoveryHistory(false); setShowRecovery(true) }} />}
      {editingEnergyTask && <EditTaskEnergyModal task={editingEnergyTask} onClose={() => setEditingEnergyTask(null)} onSave={updateTaskEnergy} />}
      {immersive && <FocusOverlay remaining={remaining} running={running} toggleTimer={toggleTimer} subject={subject} task={activeTask} onClose={() => setImmersive(false)} />}
      {undoDelete && <UndoToast task={undoDelete.task} onUndo={restoreDeletedTask} onDismiss={() => setUndoDelete(null)} />}
    </div>
  )
}

function Sidebar({ view, setView, examDays }) {
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><BookOpen size={20} /></span><span>研时</span></div>
      <nav aria-label="主导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return <button key={item.id} aria-current={view === item.id ? 'page' : undefined} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}><Icon size={19} /><span>{item.label}</span></button>
        })}
      </nav>
      <div className="exam-card">
        <div className="exam-icon"><Target size={18} /></div>
        <div><span>距离初试</span><strong>{examDays}<small> 天</small></strong></div>
      </div>
      <div className="sidebar-meta"><Database size={15} /><span>数据保存在本机</span><small>v1.4.0</small></div>
    </aside>
  )
}

function Header({ view, examDays, streak, tasks, sessions }) {
  const now = new Date()
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)
  const openTasks = tasks.filter((task) => !task.completed).length
  const totalMinutes = sessions.reduce((sum, item) => sum + item.minutes, 0)
  const titles = {
    today: ['今日专注', dateLabel],
    tasks: ['学习任务', `${openTasks} 项待完成`],
    stats: ['数据统计', `累计记录 ${formatMinutes(totalMinutes)}`],
    settings: ['专注设置', '计时、目标与考试日期'],
  }
  const [title, detail] = titles[view] || titles.today
  return (
    <header className="topbar">
      <div className="topbar-title"><h1>{title}</h1><p>{detail}</p></div>
      <div className="header-status" aria-label={`连续专注 ${streak} 天，距离初试 ${examDays} 天`}>
        <span>连续专注 <strong>{streak} 天</strong></span>
        <i aria-hidden="true" />
        <span>初试倒计时 <strong>{examDays} 天</strong></span>
      </div>
      <div className="mobile-days">初试 <strong>{examDays}</strong> 天</div>
    </header>
  )
}

function Dashboard(props) {
  const {
    mode, selectMode, remaining, duration, running, resetTimer, skipTimer,
    subject, selectedSubject, setSelectedSubject, subjectMenu, setSubjectMenu,
    activeTask, tasks, selectedTask, setSelectedTask, todayMinutes, completedToday,
    weekData, toggleTask, setShowAdd, setView,
    dailyGoal, focusDuration, setFocusDuration, setImmersive, toggleTimer,
    recoveryLogs, petEvent, setShowRecovery, setShowRecoveryHistory,
  } = props
  const progress = duration ? Math.min(1, Math.max(0, (duration - remaining) / duration)) : 0
  const ringStyle = { '--progress': `${progress * 360}deg`, '--subject': subject.color }
  const subjectMenuRef = useRef(null)
  const openTasks = tasks.filter((task) => !task.completed)
  const energyLoad = openTasks.reduce((sum, task) => sum + getTaskEnergy(task), 0)
  const recoveryPoints = recoveryLogs
    .filter((item) => item.date === getDayKey())
    .reduce((sum, item) => sum + Number(item.relief || 0), 0)
  const appliedRelief = Math.min(energyLoad, recoveryPoints)
  const pressureValue = Math.max(0, energyLoad - appliedRelief)
  const energyStatus = getEnergyStatus(pressureValue, openTasks.length)
  const petStatus = petEvent
    || (running && mode === 'focus' ? PET_EVENTS.focus : null)
    || (mode === 'break' ? PET_EVENTS.recovered : null)
    || energyStatus

  useEffect(() => {
    if (!subjectMenu) return
    const handlePointerDown = (event) => {
      if (!subjectMenuRef.current?.contains(event.target)) setSubjectMenu(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSubjectMenu(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [subjectMenu, setSubjectMenu])

  return (
    <div className="dashboard-grid">
      <section className="timer-panel">
        <div className="timer-top">
          <div className="mode-switch" role="tablist" aria-label="计时模式">
            <button role="tab" aria-selected={mode === 'focus'} className={mode === 'focus' ? 'active' : ''} onClick={() => selectMode('focus')}>专注</button>
            <button role="tab" aria-selected={mode === 'break'} className={mode === 'break' ? 'active' : ''} onClick={() => selectMode('break')}>休息</button>
          </div>
          <button className="immersive-button" title="进入沉浸模式" aria-label="进入沉浸模式" onClick={() => setImmersive(true)}><Maximize2 size={18} /></button>
        </div>
        <div className="timer-ring" style={ringStyle}>
          <div className="timer-inner">
            <span className="timer-status">{running ? '正在专注' : mode === 'focus' ? '准备开始' : '放松一下'}</span>
            <strong>{formatClock(remaining)}</strong>
            <span className="timer-subject"><i style={{ background: subject.color }} />{subject.name}</span>
          </div>
        </div>
        <div className="timer-actions">
          <button className="icon-button" title="重置计时" aria-label="重置计时" onClick={resetTimer}><RotateCcw size={20} /></button>
          <button className="primary-timer" onClick={toggleTimer}>{running ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}<span>{running ? '暂停' : '开始专注'}</span></button>
          <button className="icon-button" title="跳过当前阶段" aria-label="跳过当前阶段" onClick={skipTimer}><SkipForward size={20} /></button>
        </div>
        {mode === 'focus' && <div className="duration-options" aria-label="专注时长">{[25, 45, 60, 90].map((minutes) => <button key={minutes} disabled={running} className={focusDuration === minutes ? 'active' : ''} onClick={() => setFocusDuration(minutes)}>{minutes}</button>)}</div>}
        <div className="timer-selectors">
          <div className="select-wrap" ref={subjectMenuRef}>
            <span>专注科目</span>
            <button className="select-button" aria-haspopup="menu" aria-expanded={subjectMenu} onClick={() => setSubjectMenu(!subjectMenu)}><i style={{ background: subject.color }} />{subject.name}<ChevronDown size={16} /></button>
            {subjectMenu && <div className="select-menu" role="menu" aria-label="选择专注科目">{SUBJECTS.map((item) => <button role="menuitemradio" aria-checked={selectedSubject === item.id} key={item.id} onClick={() => { setSelectedSubject(item.id); setSubjectMenu(false) }} className={selectedSubject === item.id ? 'selected' : ''}><i style={{ background: item.color }} />{item.name}{selectedSubject === item.id && <Check size={15} />}</button>)}</div>}
          </div>
          <label className="select-wrap"><span>关联任务</span><select value={selectedTask || ''} onChange={(event) => setSelectedTask(Number(event.target.value))}><option value="">不关联任务</option>{tasks.filter((task) => !task.completed).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        </div>
        {activeTask && <div className="current-task"><span>本轮目标</span><strong>{activeTask.title}</strong></div>}
      </section>

      <aside className="right-column">
        <div className="metrics-row">
          <Metric icon={Clock3} label="今日专注" value={formatMinutes(todayMinutes)} tone="red" />
          <Metric icon={Check} label="完成任务" value={`${completedToday} 项`} tone="green" />
        </div>
        <PetStatusPanel
          status={petStatus}
          pressureValue={pressureValue}
          energyLoad={energyLoad}
          relief={appliedRelief}
          taskCount={openTasks.length}
          onAdjust={() => setView('tasks')}
          onRelax={() => setShowRecovery(true)}
          onViewRecovery={() => setShowRecoveryHistory(true)}
        />
        <section className="panel goal-panel">
          <div><span>今日目标</span><strong>{Math.min(todayMinutes, dailyGoal)} / {dailyGoal} 分钟</strong></div>
          <div className="goal-track"><span style={{ width: `${Math.min(100, todayMinutes / dailyGoal * 100)}%` }} /></div>
        </section>
        <section className="panel week-panel">
          <div className="panel-heading"><div><h2>本周专注</h2><p>过去 7 天</p></div><button onClick={() => setView('stats')}>查看统计</button></div>
          <WeekChart data={weekData} />
        </section>
        <section className="panel task-panel">
          <div className="panel-heading"><div><h2>今日任务</h2><p>{tasks.filter((task) => task.completed).length}/{tasks.length} 已完成</p></div><button className="add-icon" title="添加任务" aria-label="添加任务" onClick={() => setShowAdd(true)}><Plus size={19} /></button></div>
          <div className="task-list compact">
            {tasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} toggleTask={toggleTask} />)}
            {!tasks.length && <EmptyState text="还没有任务，先添加一个吧" />}
          </div>
        </section>
      </aside>
    </div>
  )
}

function PetStatusPanel({ status, pressureValue, energyLoad, relief, taskCount, onAdjust, onRelax, onViewRecovery }) {
  const percentage = Math.min(100, pressureValue / DAILY_ENERGY_CAPACITY * 100)
  return (
    <section className={`pet-status-panel status-${status.tone || status.id}`} aria-labelledby="today-status-title">
      <div className="pet-status-top">
        <PetIllustration mood={status.mood} />
        <div className="pet-status-copy">
          <span className="eyebrow">今日状态</span>
          <h2 id="today-status-title">{status.label}</h2>
          <p>{status.message}</p>
        </div>
      </div>
      <div className="energy-summary">
        <div className="energy-summary-head"><span>今日压力</span><strong>{pressureValue} / {DAILY_ENERGY_CAPACITY}</strong></div>
        <div className="energy-track" role="progressbar" aria-label="今日压力" aria-valuemin="0" aria-valuemax={DAILY_ENERGY_CAPACITY} aria-valuenow={Math.min(DAILY_ENERGY_CAPACITY, pressureValue)}><span style={{ width: `${percentage}%` }} /></div>
        <div className="pressure-detail"><span>任务负荷 {energyLoad}</span><i aria-hidden="true" /><span>已减压 {relief}</span><i aria-hidden="true" /><span>{taskCount ? `${taskCount} 项待办` : '没有待办'}</span></div>
        <div className="pressure-actions"><button className="history-button" type="button" onClick={onViewRecovery}><History size={15} />查看记录</button><button type="button" onClick={onAdjust}>调整任务</button><button className="relief-button" type="button" onClick={onRelax}>放松减压</button></div>
      </div>
    </section>
  )
}

function PetIllustration({ mood }) {
  const moodLabel = { ready: '准备陪你学习', focus: '认真专注', celebrate: '开心庆祝', relaxed: '放松休息', tired: '有点疲惫', overload: '压力太大哭了' }[mood] || '准备陪你学习'
  const positions = {
    ready: '5.8% 5.5%',
    focus: '50.4% 7.2%',
    celebrate: '96.2% 6.3%',
    relaxed: '5.3% 97.5%',
    tired: '49.9% 98%',
    overload: '96.7% 99.4%',
  }
  return (
    <div className={`pet-illustration pet-${mood || 'ready'}`} role="img" aria-label={`妙脆角猫：${moodLabel}`}>
      <span style={{ backgroundImage: `url(${petSprite})`, backgroundPosition: positions[mood] || positions.ready }} />
    </div>
  )
}

function Metric({ icon: Icon, label, value, tone }) {
  return <div className="metric"><div className={`metric-icon ${tone}`}><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong></div></div>
}

function WeekChart({ data }) {
  const max = Math.max(60, ...data.map((item) => item.minutes))
  return <div className="week-chart">{data.map((item) => <div className={`bar-col ${item.today ? 'today' : ''}`} key={item.key}><span className="bar-value">{item.minutes ? `${item.minutes}m` : ''}</span><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(item.minutes ? 10 : 0, item.minutes / max * 100)}%` }} /></div><span>{item.label}</span></div>)}</div>
}

function TaskRow({ task, toggleTask, onDelete, onEditEnergy }) {
  const subject = SUBJECTS.find((item) => item.id === task.subject) || SUBJECTS[0]
  return (
    <div className={`task-row ${task.completed ? 'done' : ''}`}>
      <button className="check-button" style={{ '--task-color': subject.color }} onClick={() => toggleTask(task.id)} aria-label={task.completed ? '标记未完成' : '标记完成'}>{task.completed && <Check size={14} strokeWidth={3} />}</button>
      <div className="task-copy"><strong>{task.title}</strong><span><i style={{ background: subject.color }} />{subject.name} · {task.estimate} 个番茄钟 · 精力 {getTaskEnergy(task)}</span></div>
      {(onEditEnergy || onDelete) && <div className="task-row-actions">
        {onEditEnergy && <button className="edit-task-button" title="编辑精力值" aria-label={`编辑任务精力值：${task.title}`} onClick={() => onEditEnergy(task)}><Pencil size={16} /></button>}
        {onDelete && <button className="delete-button" title="删除任务" aria-label={`删除任务：${task.title}`} onClick={() => onDelete(task.id)}><Trash2 size={17} /></button>}
      </div>}
    </div>
  )
}

function TasksView({ tasks, toggleTask, deleteTask, setShowAdd, onEditEnergy }) {
  const open = tasks.filter((task) => !task.completed)
  const done = tasks.filter((task) => task.completed)
  return (
    <div className="page-view">
      <div className="page-toolbar"><span>{open.length} 项进行中，{done.length} 项已完成</span><button className="primary-button" onClick={() => setShowAdd(true)}><CirclePlus size={18} />新建任务</button></div>
      <section className="wide-panel"><div className="section-label">进行中 <span>{open.length}</span></div><div className="task-list">{open.map((task) => <TaskRow key={task.id} task={task} toggleTask={toggleTask} onDelete={deleteTask} onEditEnergy={onEditEnergy} />)}{!open.length && <EmptyState text="今天的待办已经全部完成" />}</div></section>
      <section className="wide-panel muted-panel"><div className="section-label">已完成 <span>{done.length}</span></div><div className="task-list">{done.map((task) => <TaskRow key={task.id} task={task} toggleTask={toggleTask} onDelete={deleteTask} onEditEnergy={onEditEnergy} />)}</div></section>
    </div>
  )
}

function StatsView({ sessions, setSessions }) {
  const [period, setPeriod] = useState('day')
  const [cursor, setCursor] = useState(() => new Date())
  const [showRecords, setShowRecords] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draftMinutes, setDraftMinutes] = useState('')
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [showReduceEntry, setShowReduceEntry] = useState(false)
  const totalMinutes = sessions.reduce((sum, item) => sum + item.minutes, 0)
  const activeDays = new Set(sessions.map((item) => item.date)).size
  const averageMinutes = activeDays ? Math.round(totalMinutes / activeDays) : 0
  const periodSessions = filterSessionsByPeriod(sessions, cursor, period)
  const periodMinutes = periodSessions.reduce((sum, item) => sum + item.minutes, 0)
  const distribution = SUBJECTS.map((subject) => ({
    ...subject,
    minutes: periodSessions.filter((item) => item.subject === subject.id).reduce((sum, item) => sum + item.minutes, 0),
  })).filter((item) => item.minutes > 0)
  const subjectTotals = SUBJECTS.map((subject) => ({
    ...subject,
    minutes: sessions.filter((item) => item.subject === subject.id).reduce((sum, item) => sum + item.minutes, 0),
  }))
  const monthSessions = filterSessionsByPeriod(sessions, cursor, 'month')
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const monthBars = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), index + 1)
    return {
      day: index + 1,
      minutes: monthSessions.filter((item) => item.date === getDayKey(date)).reduce((sum, item) => sum + item.minutes, 0),
    }
  })
  const monthMax = Math.max(60, ...monthBars.map((item) => item.minutes))

  function changePeriod(nextPeriod) {
    setPeriod(nextPeriod)
    setCursor(new Date())
    setShowRecords(false)
  }

  function beginEdit(session) {
    setEditingId(session.id)
    setDraftMinutes(String(session.minutes))
  }

  function cancelEdit() {
    setEditingId(null)
    setDraftMinutes('')
  }

  function saveMinutes(sessionId) {
    const minutes = Math.round(Number(draftMinutes))
    if (!Number.isFinite(minutes) || minutes < 1) return
    setSessions((current) => current.map((entry) => entry.id === sessionId ? { ...entry, minutes: Math.min(1440, minutes) } : entry))
    cancelEdit()
  }

  function reduceMinutes({ date, subject, minutes }) {
    setSessions((current) => {
      let left = minutes
      const next = [...current].reverse().map((entry) => {
        if (left <= 0 || entry.date !== date || entry.subject !== subject) return entry
        const deduction = Math.min(entry.minutes, left)
        left -= deduction
        return { ...entry, minutes: entry.minutes - deduction }
      }).reverse()
      return next.filter((entry) => entry.minutes > 0)
    })
    setShowReduceEntry(false)
  }

  return (
    <div className="page-view stats-view">
      <div className="page-toolbar"><span>记录调整会同步到科目分布和每日图表</span><div className="page-title-actions"><button className="secondary-button" onClick={() => setShowReduceEntry(true)} title="减少已有专注时长"><Minus size={17} />减少时长</button><button className="primary-button" onClick={() => setShowManualEntry(true)} title="补录专注时长"><CirclePlus size={18} />补录时长</button></div></div>

      <section className="wide-panel cumulative-panel">
        <div className="stats-section-title"><div><h3>累计专注</h3><p>所有已完成的专注记录</p></div></div>
        <div className="cumulative-grid">
          <div><span>次数</span><strong>{sessions.length}</strong><small>次</small></div>
          <div><span>总时长</span><strong>{formatMinutes(totalMinutes)}</strong></div>
          <div><span>活跃日均</span><strong>{formatMinutes(averageMinutes)}</strong></div>
        </div>
        <div className="subject-total-grid" aria-label="各科历史累计时长">
          {subjectTotals.map((subject) => <div key={subject.id}>
            <div className="subject-total-head"><span><i style={{ background: subject.color }} />{subject.name}</span><strong>{formatMinutes(subject.minutes)}</strong></div>
            <div className="subject-total-track"><span style={{ width: `${totalMinutes ? subject.minutes / totalMinutes * 100 : 0}%`, background: subject.color }} /></div>
            <small>{totalMinutes ? `${Math.round(subject.minutes / totalMinutes * 100)}%` : '暂无记录'}</small>
          </div>)}
        </div>
      </section>

      <section className="wide-panel period-summary">
        <div className="period-heading">
          <div><h3>{period === 'day' ? '当日专注' : period === 'week' ? '本周专注' : '本月专注'}</h3><p>{periodLabel(cursor, period)}</p></div>
          <div className="date-arrows"><button aria-label="上一周期" onClick={() => setCursor((current) => shiftPeriod(current, period, -1))}><ChevronLeft size={20} /></button><button aria-label="下一周期" onClick={() => setCursor((current) => shiftPeriod(current, period, 1))}><ChevronRight size={20} /></button></div>
        </div>
        <div className="period-numbers"><div><span>次数</span><strong>{periodSessions.length}<small> 次</small></strong></div><div><span>时长</span><strong>{formatMinutes(periodMinutes)}</strong></div></div>
      </section>

      <section className="wide-panel distribution-panel">
        <div className="period-heading">
          <div><h3>专注时长分布</h3><p>{periodLabel(cursor, period)}</p></div>
          <div className="date-arrows"><button aria-label="上一周期分布" onClick={() => setCursor((current) => shiftPeriod(current, period, -1))}><ChevronLeft size={20} /></button><button aria-label="下一周期分布" onClick={() => setCursor((current) => shiftPeriod(current, period, 1))}><ChevronRight size={20} /></button></div>
        </div>
        <div className="period-tabs" role="tablist" aria-label="统计周期">
          {[['day', '日'], ['week', '周'], ['month', '月']].map(([id, label]) => <button key={id} role="tab" aria-selected={period === id} className={period === id ? 'active' : ''} onClick={() => changePeriod(id)}>{label}</button>)}
        </div>
        {periodMinutes > 0 ? <>
          <div className="distribution-layout">
            <DonutChart data={distribution} total={periodMinutes} />
            <div className="distribution-legend">{distribution.map((item) => <div key={item.id}><span className="legend-name"><i style={{ background: item.color }} />{item.name}</span><strong>{formatMinutes(item.minutes)}</strong><span>{Math.round(item.minutes / periodMinutes * 100)}%</span></div>)}</div>
          </div>
          <button className="records-button" onClick={() => setShowRecords(!showRecords)}>{showRecords ? '收起专注记录' : '查看专注记录'}</button>
          {showRecords && <div className="session-records">{[...periodSessions].reverse().map((session) => {
            const item = SUBJECTS.find((subject) => subject.id === session.subject) || SUBJECTS[0]
            const editing = editingId === session.id
            return <div key={session.id} className={editing ? 'editing' : ''}>
              <span><i style={{ background: item.color }} />{item.name}</span>
              <strong>{session.date}</strong>
              {editing ? <div className="record-edit"><input aria-label="修改专注分钟数" type="number" min="1" max="1440" value={draftMinutes} onChange={(event) => setDraftMinutes(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveMinutes(session.id); if (event.key === 'Escape') cancelEdit() }} /><span>分钟</span></div> : <em>{session.minutes} 分钟</em>}
              <div className="record-actions">
                {editing ? <button aria-label="保存修改" title="保存修改" onClick={() => saveMinutes(session.id)}><Check size={15} /></button> : <button aria-label={`编辑${session.date}${item.name}时长`} title="编辑时长" onClick={() => beginEdit(session)}><Pencil size={14} /></button>}
                <button aria-label={`删除${session.date}${item.name}记录`} title="删除记录" onClick={() => { if (window.confirm('确定删除这条专注记录吗？')) setSessions((current) => current.filter((entry) => entry.id !== session.id)) }}><Trash2 size={15} /></button>
              </div>
            </div>
          })}</div>}
        </> : <StatsEmpty />}
      </section>

      <section className="wide-panel month-panel">
        <div className="period-heading"><div><h3>本月每日专注</h3><p>{cursor.getFullYear()}年{cursor.getMonth() + 1}月 · 单位：分钟</p></div></div>
        {monthSessions.length ? <MonthBars data={monthBars} max={monthMax} /> : <StatsEmpty compact />}
      </section>
      {showManualEntry && <ManualSessionModal onClose={() => setShowManualEntry(false)} onAdd={(session) => { setSessions((current) => [...current, { ...session, id: Date.now() }]); setShowManualEntry(false) }} />}
      {showReduceEntry && <ReduceSessionModal sessions={sessions} onClose={() => setShowReduceEntry(false)} onReduce={reduceMinutes} />}
    </div>
  )
}

function DonutChart({ data, total }) {
  const radius = 72
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="donut-wrap">
      <svg className="donut-chart" viewBox="0 0 180 180" role="img" aria-label={`科目专注时长分布，总计${formatMinutes(total)}`}>
        <title>科目专注时长分布</title>
        <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--color-chart-track)" strokeWidth="25" />
        {data.map((item) => {
          const length = item.minutes / total * circumference
          const dashOffset = -offset
          offset += length
          return <circle key={item.id} cx="90" cy="90" r={radius} fill="none" stroke={item.color} strokeWidth="25" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset} transform="rotate(-90 90 90)" />
        })}
      </svg>
      <div><span>总计</span><strong>{formatMinutes(total)}</strong></div>
    </div>
  )
}

function MonthBars({ data, max }) {
  return (
    <div className="month-chart" role="img" aria-label="本月每日专注时长柱状图">
      <div className="month-grid-lines"><span>最高 {max} 分</span><span>{Math.round(max / 2)} 分</span><span>0 分</span></div>
      <div className="month-bars">{data.map((item) => <div className="month-bar-col" key={item.day} title={`${item.day}日：${item.minutes}分钟`}><span className="month-bar-value">{item.minutes || ''}</span><div><i style={{ height: `${item.minutes / max * 100}%` }} /></div><small>{item.day === 1 || item.day % 5 === 0 || item.day === data.length ? item.day : ''}</small></div>)}</div>
    </div>
  )
}

function StatsEmpty({ compact = false }) {
  return <div className={`stats-empty ${compact ? 'compact' : ''}`}><Clock3 size={22} /><strong>这个周期还没有专注记录</strong><span>完成一次专注后，数据会自动计入这里</span></div>
}

function SettingsView({ settings, setSettings, resetTimer }) {
  const [applied, setApplied] = useState(false)

  function updateNumber(key, value) {
    setSettings((current) => ({ ...current, [key]: Math.max(1, Number(value)) }))
  }

  function applySettings() {
    if (resetTimer() === false) return
    setApplied(true)
    window.setTimeout(() => setApplied(false), 1800)
  }

  return (
    <div className="page-view settings-view">
      <section className="wide-panel setting-section"><div><h3>计时长度</h3><p>修改后请返回计时页重置计时器</p></div><div className="setting-grid"><label>专注时长<div><input type="number" min="1" max="180" value={settings.focus} onChange={(e) => updateNumber('focus', e.target.value)} /><span>分钟</span></div></label><label>短休息<div><input type="number" min="1" max="60" value={settings.shortBreak} onChange={(e) => updateNumber('shortBreak', e.target.value)} /><span>分钟</span></div></label><label>每日目标<div><input type="number" min="1" max="960" value={settings.dailyGoal} onChange={(e) => updateNumber('dailyGoal', e.target.value)} /><span>分钟</span></div></label></div></section>
       <section className="wide-panel setting-section"><div><h3>考研日期</h3><p>用于首页显示初试倒计时，28 届可先使用预计日期</p></div><div className="date-setting"><label>目标日期<input type="date" value={settings.examDate} onChange={(e) => setSettings((current) => ({ ...current, examDate: e.target.value }))} /></label><div className="setting-presets"><button type="button" onClick={() => setSettings((current) => ({ ...current, examDate: '2027-12-25' }))}>28 届预计：2027-12-25</button><button type="button" onClick={() => setSettings((current) => ({ ...current, examDate: getDayKey() }))}>从今天开始</button></div></div></section>
      <section className="wide-panel setting-section"><div><h3>自动开始休息</h3><p>专注结束后自动切换到休息阶段</p></div><button role="switch" aria-checked={settings.autoBreak} className={`toggle ${settings.autoBreak ? 'on' : ''}`} onClick={() => setSettings((current) => ({ ...current, autoBreak: !current.autoBreak }))} aria-label="自动开始休息"><span /></button></section>
      <section className="wide-panel setting-section"><div><h3>严格模式</h3><p>中途重置、跳过或切换模式时需要再次确认</p></div><button role="switch" aria-checked={settings.strictMode} className={`toggle ${settings.strictMode ? 'on' : ''}`} onClick={() => setSettings((current) => ({ ...current, strictMode: !current.strictMode }))} aria-label="严格模式"><span /></button></section>
       <div className="settings-apply"><button className="secondary-button" onClick={applySettings}>应用计时设置</button>{applied && <span role="status">已应用，计时器已重置</span>}</div>
    </div>
  )
}

function ReduceSessionModal({ sessions, onClose, onReduce }) {
  const [date, setDate] = useState(getDayKey())
  const [subject, setSubject] = useState('math')
  const [minutes, setMinutes] = useState(30)
  const available = sessions.filter((entry) => entry.date === date && entry.subject === subject).reduce((sum, entry) => sum + entry.minutes, 0)
  const requested = Math.round(Number(minutes))
  const canSubmit = available > 0 && Number.isFinite(requested) && requested >= 1 && requested <= available
  useEscapeClose(onClose)

  function submit(event) {
    event.preventDefault()
    if (!date || !canSubmit) return
    onReduce({ date, subject, minutes: requested })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="reduce-session-title" onSubmit={submit}>
        <div className="modal-head"><div><h2 id="reduce-session-title">减少专注时长</h2><p>从指定日期和科目的最近记录开始扣减，最多可减少 {available} 分钟</p></div><button type="button" className="icon-button small" aria-label="关闭减少时长窗口" onClick={onClose}><X size={19} /></button></div>
        <label>日期<input autoFocus type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <div className="form-row"><label>科目<select value={subject} onChange={(event) => setSubject(event.target.value)}>{SUBJECTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>减少时长<input type="number" min="1" max={Math.max(1, available)} value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label></div>
        {!available && <p className="modal-warning">当前日期和科目没有可减少的记录，请先补录或选择其他日期。</p>}
        {available > 0 && requested > available && <p className="modal-warning">减少时长不能超过当前已有的 {available} 分钟。</p>}
        <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={!canSubmit}>确认减少</button></div>
      </form>
    </div>
  )
}

function ManualSessionModal({ onClose, onAdd }) {
  const [date, setDate] = useState(getDayKey())
  const [subject, setSubject] = useState('math')
  const [minutes, setMinutes] = useState(60)
  useEscapeClose(onClose)

  function submit(event) {
    event.preventDefault()
    const value = Math.round(Number(minutes))
    if (!date || !Number.isFinite(value) || value < 1) return
    onAdd({ date, subject, minutes: Math.min(1440, value), taskId: null, manual: true })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="manual-session-title" onSubmit={submit}>
        <div className="modal-head"><div><h2 id="manual-session-title">补录专注时长</h2><p>补录后会立即计入总时长、科目分布和每日柱状图</p></div><button type="button" className="icon-button small" aria-label="关闭补录窗口" onClick={onClose}><X size={19} /></button></div>
        <label>日期<input autoFocus type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <div className="form-row"><label>科目<select value={subject} onChange={(event) => setSubject(event.target.value)}>{SUBJECTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>专注时长<input type="number" min="1" max="1440" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label></div>
        <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存记录</button></div>
      </form>
    </div>
  )
}

function EnergyPicker({ energy, onChange }) {
  return (
    <fieldset className="energy-picker">
      <legend>预计精力消耗</legend>
      <div role="radiogroup" aria-label="预计精力消耗">
        <span className="energy-helper">1 轻松 · 5 很费力</span>
        <div className="energy-options">{[1, 2, 3, 4, 5].map((value) => <button type="button" role="radio" aria-checked={energy === value} className={energy === value ? 'active' : ''} key={value} onClick={() => onChange(value)}>{value}</button>)}</div>
      </div>
    </fieldset>
  )
}

function EditTaskEnergyModal({ task, onClose, onSave }) {
  const [energy, setEnergy] = useState(() => getTaskEnergy(task))
  useEscapeClose(onClose)
  function submit(event) {
    event.preventDefault()
    onSave(task.id, energy)
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="edit-energy-title" onSubmit={submit}>
        <div className="modal-head"><div><h2 id="edit-energy-title">调整任务精力</h2><p>{task.title}</p></div><button type="button" className="icon-button small" aria-label="关闭精力编辑窗口" onClick={onClose}><X size={19} /></button></div>
        <EnergyPicker energy={energy} onChange={setEnergy} />
        <p className="form-note">调整后，首页的任务负荷和压力值会立即重新计算。</p>
        <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存精力值</button></div>
      </form>
    </div>
  )
}

function RecoveryModal({ customActivities, onCreateCustom, onDeleteCustom, onRestoreCustom, onClose, onComplete }) {
  const activities = [...RELIEF_ACTIVITIES, ...customActivities]
  const [selectedId, setSelectedId] = useState(RELIEF_ACTIVITIES[0].id)
  const [showCustomEditor, setShowCustomEditor] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [customMinutes, setCustomMinutes] = useState('15')
  const [customRelief, setCustomRelief] = useState('1')
  const [touched, setTouched] = useState({})
  const [deletedActivity, setDeletedActivity] = useState(null)
  useEscapeClose(onClose)

  useEffect(() => {
    if (!deletedActivity) return
    const timeout = window.setTimeout(() => setDeletedActivity(null), 10000)
    return () => window.clearTimeout(timeout)
  }, [deletedActivity])

  const selected = activities.find((item) => item.id === selectedId) || RELIEF_ACTIVITIES[0]
  const parsedMinutes = Math.round(Number(customMinutes))
  const parsedRelief = Math.round(Number(customRelief))
  const customErrors = {
    label: customLabel.trim() ? '' : '请填写活动名称。',
    minutes: Number.isFinite(parsedMinutes) && parsedMinutes >= 1 && parsedMinutes <= 180 ? '' : '时长应为 1–180 分钟。',
    relief: Number.isFinite(parsedRelief) && parsedRelief >= 1 && parsedRelief <= 3 ? '' : '减压值应为 1–3。',
  }
  const canSaveCustom = !customErrors.label && !customErrors.minutes && !customErrors.relief

  function submit(event) {
    event.preventDefault()
    if (showCustomEditor) return
    onComplete(selected)
  }

  function saveCustom() {
    setTouched({ label: true, minutes: true, relief: true })
    if (!canSaveCustom) return
    const activity = {
      id: `custom-${Date.now()}`,
      label: customLabel.trim(),
      minutes: parsedMinutes,
      relief: parsedRelief,
      custom: true,
    }
    onCreateCustom(activity)
    setSelectedId(activity.id)
    setShowCustomEditor(false)
    setCustomLabel('')
    setCustomMinutes('15')
    setCustomRelief('1')
    setTouched({})
  }

  function deleteCustom(activity) {
    onDeleteCustom(activity.id)
    setDeletedActivity(activity)
    if (selectedId === activity.id) setSelectedId(RELIEF_ACTIVITIES[0].id)
  }

  function restoreDeleted() {
    if (!deletedActivity) return
    onRestoreCustom(deletedActivity)
    setSelectedId(deletedActivity.id)
    setDeletedActivity(null)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal recovery-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title" onSubmit={submit}>
        <div className="modal-head"><div><h2 id="recovery-title">给大脑松松绑</h2><p>只记录真正完成的放松，减压值在今天有效。</p></div><button type="button" className="icon-button small" aria-label="关闭放松减压窗口" onClick={onClose}><X size={19} /></button></div>
        <fieldset className="recovery-picker">
          <legend>选择刚刚完成的放松</legend>
          <div className="recovery-options" role="radiogroup" aria-label="放松活动">
            {activities.map((activity) => {
              const Icon = activity.icon || CirclePlus
              const inputId = `recovery-${activity.id}`
              return (
                <div className={`recovery-option-shell ${activity.custom ? 'custom' : ''}`} key={activity.id}>
                  <input className="recovery-choice-input" id={inputId} type="radio" name="recovery-activity" value={activity.id} checked={selectedId === activity.id} onChange={() => setSelectedId(activity.id)} />
                  <label className="recovery-option" htmlFor={inputId}><span className="recovery-icon"><Icon size={20} /></span><span className="recovery-copy"><strong>{activity.label}</strong><small>{activity.detail}</small></span><span className="recovery-value">{activity.minutes} 分钟<em>-{activity.relief} 压力</em></span></label>
                  {activity.custom && <button type="button" className="recovery-option-delete" title="删除自定义选项" aria-label={`删除自定义放松：${activity.label}`} onClick={() => deleteCustom(activity)}><Trash2 size={16} /></button>}
                </div>
              )
            })}
          </div>
          <button type="button" className="recovery-add-custom" aria-expanded={showCustomEditor} aria-controls="custom-recovery-editor" onClick={() => setShowCustomEditor((current) => !current)}><CirclePlus size={18} /><span>{showCustomEditor ? '收起自定义' : '新增自定义放松'}</span></button>
        </fieldset>
        {showCustomEditor && (
          <fieldset id="custom-recovery-editor" className="custom-recovery-editor" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveCustom() } }}>
            <legend>新选项</legend>
            <div className="custom-recovery-fields">
              <label>活动名称<input autoFocus maxLength="20" value={customLabel} aria-invalid={Boolean(touched.label && customErrors.label)} aria-describedby="custom-label-help" onBlur={() => setTouched((current) => ({ ...current, label: true }))} onChange={(event) => setCustomLabel(event.target.value)} /><small id="custom-label-help" className={touched.label && customErrors.label ? 'field-error' : ''}>{touched.label && customErrors.label ? customErrors.label : '例如：跑步、洗澡、打游戏'}</small></label>
              <label>活动时长<input type="number" min="1" max="180" value={customMinutes} aria-invalid={Boolean(touched.minutes && customErrors.minutes)} aria-describedby="custom-minutes-help" onBlur={() => setTouched((current) => ({ ...current, minutes: true }))} onChange={(event) => setCustomMinutes(event.target.value)} /><small id="custom-minutes-help" className={touched.minutes && customErrors.minutes ? 'field-error' : ''}>{touched.minutes && customErrors.minutes ? customErrors.minutes : '1–180 分钟'}</small></label>
              <label>减压值<select value={customRelief} aria-describedby="custom-relief-help" onChange={(event) => setCustomRelief(event.target.value)}><option value="1">减少 1 点</option><option value="2">减少 2 点</option><option value="3">减少 3 点</option></select><small id="custom-relief-help">按实际放松效果选择</small></label>
            </div>
            <div className="custom-recovery-actions"><button type="button" className="text-button" onClick={() => setShowCustomEditor(false)}>取消</button><button type="button" className="secondary-button" disabled={!canSaveCustom} onClick={saveCustom}>保存选项</button></div>
          </fieldset>
        )}
        {deletedActivity && <div className="custom-recovery-undo" role="status" aria-live="polite"><span>已删除“{deletedActivity.label}”</span><button type="button" onClick={restoreDeleted}><Undo2 size={15} />撤销</button></div>}
        <div className="recovery-summary"><span>本次减压</span><strong>-{selected.relief}</strong></div>
        <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>稍后再说</button><button className="primary-button" type="submit" disabled={showCustomEditor}>完成并减压</button></div>
      </form>
    </div>
  )
}

function RecoveryHistoryModal({ recoveryLogs, tasks, onRemove, onRestore, onClose, onAddRecovery }) {
  const [removedLog, setRemovedLog] = useState(null)
  useEscapeClose(onClose)

  useEffect(() => {
    if (!removedLog) return
    const timeout = window.setTimeout(() => setRemovedLog(null), 10000)
    return () => window.clearTimeout(timeout)
  }, [removedLog])

  const todayLogs = recoveryLogs
    .filter((log) => log.date === getDayKey())
    .sort((a, b) => Number(b.id) - Number(a.id))
  const energyLoad = tasks
    .filter((task) => !task.completed)
    .reduce((sum, task) => sum + getTaskEnergy(task), 0)
  const recordedRelief = todayLogs.reduce((sum, log) => sum + Number(log.relief || 0), 0)
  const appliedRelief = Math.min(energyLoad, recordedRelief)
  const pressureValue = Math.max(0, energyLoad - appliedRelief)

  function removeLog(log) {
    onRemove(log.id)
    setRemovedLog(log)
  }

  function restoreLog() {
    if (!removedLog) return
    onRestore(removedLog)
    setRemovedLog(null)
  }

  function formatLogTime(log) {
    const timestamp = Number(log.id)
    if (!Number.isFinite(timestamp) || timestamp < 1000000000000) return '今天'
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp))
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal recovery-history-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-history-title">
        <div className="modal-head"><div><h2 id="recovery-history-title">今日减压记录</h2><p>撤销后，该次减压会立即从今日压力中移除。</p></div><button type="button" className="icon-button small" aria-label="关闭今日减压记录" onClick={onClose}><X size={19} /></button></div>
        <div className="recovery-history-equation" aria-label={`任务负荷 ${energyLoad}，已抵扣减压 ${appliedRelief}，当前压力 ${pressureValue}`}>
          <span><small>任务负荷</small><strong>{energyLoad}</strong></span><Minus size={17} aria-hidden="true" /><span><small>已抵扣减压</small><strong>{appliedRelief}</strong></span><span className="equation-mark" aria-hidden="true">=</span><span><small>当前压力</small><strong>{pressureValue}</strong></span>
        </div>
        {todayLogs.length ? (
          <div className="recovery-history-list" aria-label="今日减压记录列表">
            {todayLogs.map((log) => (
              <div className="recovery-history-row" key={log.id}>
                <span className="recovery-log-icon" aria-hidden="true"><History size={18} /></span>
                <span className="recovery-log-copy"><strong>{log.label}</strong><small>{formatLogTime(log)} · {log.minutes} 分钟</small></span>
                <strong className="recovery-log-value">-{Number(log.relief || 0)}</strong>
                <button type="button" onClick={() => removeLog(log)}>撤销</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="recovery-history-empty"><History size={24} /><strong>今天还没有减压记录</strong><p>完成一项真实的放松后，记录会出现在这里。</p><button type="button" className="secondary-button" onClick={onAddRecovery}>去放松减压</button></div>
        )}
        {removedLog && <div className="custom-recovery-undo" role="status" aria-live="polite"><span>已撤销“{removedLog.label}”</span><button type="button" onClick={restoreLog}><Undo2 size={15} />恢复</button></div>}
        <div className="recovery-history-foot"><span>今日共 {todayLogs.length} 条，记录减压 {recordedRelief} 点</span><button type="button" className="text-button" onClick={onClose}>关闭</button></div>
      </section>
    </div>
  )
}

function AddTaskModal({ onClose, onAdd }) {
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('math')
  const [estimate, setEstimate] = useState(2)
  const [energy, setEnergy] = useState(3)
  useEscapeClose(onClose)
  function submit(event) {
    event.preventDefault()
    if (!title.trim()) return
    onAdd({ title: title.trim(), subject, estimate: Number(estimate), energy: Number(energy) })
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="add-task-title" onSubmit={submit}>
        <div className="modal-head"><div><h2 id="add-task-title">新建学习任务</h2><p>一个任务最好能在 1–3 个番茄钟内完成</p></div><button type="button" className="icon-button small" aria-label="关闭新建任务窗口" onClick={onClose}><X size={19} /></button></div>
        <label>任务内容<input autoFocus placeholder="例如：完成数学真题第 3 章" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="form-row"><label>科目<select value={subject} onChange={(e) => setSubject(e.target.value)}>{SUBJECTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>预计番茄钟<input type="number" min="1" max="12" value={estimate} onChange={(e) => setEstimate(e.target.value)} /></label></div>
        <EnergyPicker energy={energy} onChange={setEnergy} />
        <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">添加任务</button></div>
      </form>
    </div>
  )
}

function MobileNav({ view, setView }) {
  return <nav className="mobile-nav" aria-label="移动端主导航">{NAV_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><Icon size={20} /><span>{item.mobileLabel}</span></button> })}</nav>
}

function FocusOverlay({ remaining, running, toggleTimer, subject, task, onClose }) {
  useEscapeClose(onClose)
  return (
    <div className="focus-overlay" role="dialog" aria-modal="true" aria-label="沉浸专注模式" style={{ '--focus-image': `url(${studyDesk})` }}>
      <button className="focus-exit" title="退出沉浸模式" aria-label="退出沉浸模式" onClick={onClose}><Minimize2 size={21} /></button>
      <div className="focus-content">
        <span className="focus-kicker"><i style={{ background: subject.color }} />{subject.name}</span>
        <strong>{formatClock(remaining)}</strong>
        <p>{task?.title || '只做眼前这一件事'}</p>
        <button className="focus-control" onClick={toggleTimer}>{running ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}<span>{running ? '暂停' : '继续专注'}</span></button>
      </div>
    </div>
  )
}

function EmptyState({ text }) {
  return <div className="empty-state"><Check size={20} /><span>{text}</span></div>
}

function UndoToast({ task, onUndo, onDismiss }) {
  useEscapeClose(onDismiss)
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>已删除“{task.title}”</span>
      <button onClick={onUndo}><Undo2 size={16} />撤销</button>
      <button className="toast-dismiss" aria-label="关闭撤销提示" onClick={onDismiss}><X size={16} /></button>
    </div>
  )
}

export default App
