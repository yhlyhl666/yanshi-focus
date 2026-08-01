import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  CirclePlus,
  Clock3,
  Flame,
  ListTodo,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  SkipForward,
  Target,
  Trash2,
  X,
} from 'lucide-react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, DEFAULT_SETTINGS, SUBJECTS } from './src/constants';
import { defaultState, loadState, saveState } from './src/storage';
import type {
  AppTab,
  PersistedState,
  Settings,
  StudySession,
  StudyTask,
  SubjectId,
  TimerMode,
  ExamType,
} from './src/types';
import {
  buildRecentWeek,
  calculateStreak,
  clamp,
  examDaysLeft,
  formatClock,
  formatMinutes,
  getDayKey,
  parseDayKey,
  reduceSessionMinutes,
  suggestedExamDate,
} from './src/utils';

type SessionDraft = { date: string; subject: SubjectId; minutes: number };
type TaskDraft = { title: string; subject: SubjectId; estimate: number };

const TAB_ITEMS = [
  { id: 'focus' as const, label: '专注', icon: Clock3 },
  { id: 'tasks' as const, label: '任务', icon: ListTodo },
  { id: 'stats' as const, label: '统计', icon: BarChart3 },
  { id: 'settings' as const, label: '设置', icon: SettingsIcon },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function cancelTimerNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

async function scheduleTimerNotifications(seconds: number, mode: TimerMode) {
  const permission = await Notifications.getPermissionsAsync();
  const status = permission.granted ? permission.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  await cancelTimerNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: mode === 'focus' ? '本轮专注时间到' : '休息时间到',
      body: mode === 'focus' ? '回到研时，手动确认后才会计入统计。' : '回到研时，手动确认结束休息。',
      sound: 'default',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, seconds) },
  });
}

function subjectById(id: SubjectId) {
  return SUBJECTS.find((subject) => subject.id === id) ?? SUBJECTS[0];
}

function AppShell() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<AppTab>('focus');
  const [data, setData] = useState<PersistedState>(() => defaultState());
  const [remaining, setRemaining] = useState(DEFAULT_SETTINGS.focus * 60);
  const [taskModal, setTaskModal] = useState(false);
  const [sessionModal, setSessionModal] = useState<'add' | 'reduce' | null>(null);
  const completionRef = useRef<number | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let mounted = true;
    loadState().then((saved) => {
      if (!mounted) return;
      const restored = saved.timer.running && saved.timer.endAt
        ? Math.max(0, Math.ceil((saved.timer.endAt - Date.now()) / 1000))
        : saved.timer.remaining;
      const expired = Boolean(saved.timer.running && saved.timer.endAt && restored <= 0);
      const next = expired
        ? { ...saved, timer: { ...saved.timer, running: false, awaitingCompletion: true, remaining: 0, endAt: null } }
        : saved;
      setData(next);
      setRemaining(expired || next.timer.awaitingCompletion ? 0 : restored > 0 ? restored : saved.settings.focus * 60);
      setHydrated(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      saveState({ ...data, timer: { ...data.timer, remaining } }).catch(() => undefined);
    }, 120);
    return () => clearTimeout(timer);
  }, [data, hydrated, remaining]);

  const markStageReady = useCallback((endedAt: number) => {
    if (completionRef.current === endedAt) return;
    completionRef.current = endedAt;
    cancelTimerNotifications().catch(() => undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setRemaining(0);
    setData((current) => ({
      ...current,
      timer: { ...current.timer, running: false, awaitingCompletion: true, remaining: 0, endAt: null },
    }));
  }, []);

  const confirmStageCompletion = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setData((current) => {
      if (!current.timer.awaitingCompletion) return current;
      const wasFocus = current.timer.mode === 'focus';
      const nextMode: TimerMode = wasFocus ? 'break' : 'focus';
      const nextSeconds = (nextMode === 'focus' ? current.settings.focus : current.settings.shortBreak) * 60;
      const autoRun = wasFocus && current.settings.autoBreak;
      if (autoRun) scheduleTimerNotifications(nextSeconds, nextMode).catch(() => undefined);
      setRemaining(nextSeconds);
      return {
        ...current,
        sessions: wasFocus
          ? [...current.sessions, {
              id: Date.now(),
              date: getDayKey(),
              subject: current.timer.selectedSubject,
              taskId: current.timer.selectedTask,
              minutes: current.settings.focus,
            }]
          : current.sessions,
        timer: {
          ...current.timer,
          mode: nextMode,
          running: autoRun,
          awaitingCompletion: false,
          remaining: nextSeconds,
          endAt: autoRun ? Date.now() + nextSeconds * 1000 : null,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !data.timer.running || !data.timer.endAt) return;
    const endedAt = data.timer.endAt;
    const update = () => {
      const next = Math.max(0, Math.ceil((endedAt - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) markStageReady(endedAt);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [data.timer.endAt, data.timer.running, hydrated, markStageReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !data.timer.running || !data.timer.endAt) return;
      const next = Math.max(0, Math.ceil((data.timer.endAt - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) markStageReady(data.timer.endAt);
    });
    return () => subscription.remove();
  }, [data.timer.endAt, data.timer.running, markStageReady]);

  const duration = (data.timer.mode === 'focus' ? data.settings.focus : data.settings.shortBreak) * 60;
  const examDays = examDaysLeft(data.settings.examDate);

  const setTimer = useCallback((patch: Partial<PersistedState['timer']>) => {
    setData((current) => ({ ...current, timer: { ...current.timer, ...patch } }));
  }, []);

  const toggleTimer = useCallback(() => {
    if (data.timer.awaitingCompletion) {
      confirmStageCompletion();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setData((current) => {
      if (current.timer.running) {
        cancelTimerNotifications().catch(() => undefined);
        return { ...current, timer: { ...current.timer, running: false, remaining, endAt: null } };
      }
      completionRef.current = null;
      scheduleTimerNotifications(remaining, current.timer.mode).catch(() => undefined);
      return {
        ...current,
        timer: { ...current.timer, running: true, awaitingCompletion: false, remaining, endAt: Date.now() + remaining * 1000 },
      };
    });
  }, [confirmStageCompletion, data.timer.awaitingCompletion, remaining]);

  const resetTimer = useCallback(() => {
    const apply = () => {
      cancelTimerNotifications().catch(() => undefined);
      setRemaining(duration);
      setTimer({ running: false, awaitingCompletion: false, remaining: duration, endAt: null });
    };
    if (data.timer.running && data.settings.strictMode) {
      Alert.alert('放弃本轮专注？', '严格模式下，重置不会保存当前进度。', [
        { text: '继续专注', style: 'cancel' },
        { text: '确认重置', style: 'destructive', onPress: apply },
      ]);
      return;
    }
    apply();
  }, [data.settings.strictMode, data.timer.running, duration, setTimer]);

  const switchMode = useCallback((mode: TimerMode) => {
    cancelTimerNotifications().catch(() => undefined);
    const seconds = (mode === 'focus' ? data.settings.focus : data.settings.shortBreak) * 60;
    setRemaining(seconds);
    setTimer({ mode, running: false, awaitingCompletion: false, remaining: seconds, endAt: null });
  }, [data.settings.focus, data.settings.shortBreak, setTimer]);

  const skipMode = useCallback(() => {
    const next: TimerMode = data.timer.mode === 'focus' ? 'break' : 'focus';
    if (data.timer.running && data.settings.strictMode) {
      Alert.alert('跳过当前阶段？', '严格模式已开启，本轮进度不会保存。', [
        { text: '取消', style: 'cancel' },
        { text: '确认跳过', style: 'destructive', onPress: () => switchMode(next) },
      ]);
      return;
    }
    switchMode(next);
  }, [data.settings.strictMode, data.timer.mode, data.timer.running, switchMode]);

  const addTask = useCallback((draft: TaskDraft) => {
    const task: StudyTask = { ...draft, id: Date.now(), completed: false };
    setData((current) => ({
      ...current,
      tasks: [...current.tasks, task],
      timer: { ...current.timer, selectedTask: task.id, selectedSubject: task.subject },
    }));
    setTaskModal(false);
  }, []);

  const toggleTask = useCallback((id: number) => {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task),
    }));
  }, []);

  const deleteTask = useCallback((id: number) => {
    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
      timer: { ...current.timer, selectedTask: current.timer.selectedTask === id ? null : current.timer.selectedTask },
    }));
  }, []);

  const addSession = useCallback((draft: SessionDraft) => {
    setData((current) => ({
      ...current,
      sessions: [...current.sessions, { ...draft, id: Date.now(), taskId: null, manual: true }],
    }));
    setSessionModal(null);
  }, []);

  const reduceSession = useCallback((draft: SessionDraft) => {
    setData((current) => ({
      ...current,
      sessions: reduceSessionMinutes(current.sessions, draft.date, draft.subject, draft.minutes),
    }));
    setSessionModal(null);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, []);

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loading}>
        <BookOpen color={COLORS.primary} size={34} />
        <Text style={styles.loadingBrand}>研时</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <NativeStatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {tab === 'focus' ? (
          <FocusScreen
            examDays={examDays}
            mode={data.timer.mode}
            remaining={remaining}
            duration={duration}
            running={data.timer.running}
            awaitingCompletion={data.timer.awaitingCompletion}
            tasks={data.tasks}
            sessions={data.sessions}
            selectedSubject={data.timer.selectedSubject}
            selectedTask={data.timer.selectedTask}
            dailyGoal={data.settings.dailyGoal}
            onMode={switchMode}
            onToggle={toggleTimer}
            onReset={resetTimer}
            onSkip={skipMode}
            onSubject={(selectedSubject) => setTimer({ selectedSubject })}
            onTask={(selectedTask) => setTimer({ selectedTask })}
            onAddTask={() => setTaskModal(true)}
          />
        ) : null}
        {tab === 'tasks' ? (
          <TasksScreen
            tasks={data.tasks}
            onAdd={() => setTaskModal(true)}
            onToggle={toggleTask}
            onDelete={(id) => Alert.alert('删除任务？', '这不会删除已经产生的专注记录。', [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: () => deleteTask(id) },
            ])}
          />
        ) : null}
        {tab === 'stats' ? (
          <StatsScreen
            sessions={data.sessions}
            onAdd={() => setSessionModal('add')}
            onReduce={() => setSessionModal('reduce')}
            onUpdate={(id, minutes) => setData((current) => ({
              ...current,
              sessions: current.sessions.map((session) => session.id === id ? { ...session, minutes } : session),
            }))}
            onDelete={(id) => setData((current) => ({
              ...current,
              sessions: current.sessions.filter((session) => session.id !== id),
            }))}
          />
        ) : null}
        {tab === 'settings' ? (
          <SettingsScreen settings={data.settings} onChange={updateSettings} onApply={resetTimer} />
        ) : null}
      </SafeAreaView>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <Pressable key={item.id} style={styles.tabButton} onPress={() => setTab(item.id)}>
              <View style={[styles.tabIcon, active && styles.tabIconActive]}>
                <Icon size={21} color={active ? COLORS.primaryDark : COLORS.muted} strokeWidth={active ? 2.4 : 2} />
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <TaskModal visible={taskModal} onClose={() => setTaskModal(false)} onSubmit={addTask} />
      <SessionModal
        mode={sessionModal}
        sessions={data.sessions}
        onClose={() => setSessionModal(null)}
        onSubmit={sessionModal === 'reduce' ? reduceSession : addSession}
      />
    </View>
  );
}

type FocusScreenProps = {
  examDays: number;
  mode: TimerMode;
  remaining: number;
  duration: number;
  running: boolean;
  awaitingCompletion: boolean;
  tasks: StudyTask[];
  sessions: StudySession[];
  selectedSubject: SubjectId;
  selectedTask: number | null;
  dailyGoal: number;
  onMode: (mode: TimerMode) => void;
  onToggle: () => void;
  onReset: () => void;
  onSkip: () => void;
  onSubject: (subject: SubjectId) => void;
  onTask: (id: number | null) => void;
  onAddTask: () => void;
};

function FocusScreen(props: FocusScreenProps) {
  const today = getDayKey();
  const todayMinutes = useMemo(() => props.sessions
    .filter((session) => session.date === today)
    .reduce((sum, session) => sum + session.minutes, 0), [props.sessions, today]);
  const week = useMemo(() => buildRecentWeek(props.sessions), [props.sessions]);
  const maxWeek = Math.max(60, ...week.map((day) => day.minutes));
  const streak = useMemo(() => calculateStreak(props.sessions), [props.sessions]);
  const subject = subjectById(props.selectedSubject);
  const progress = props.duration ? clamp((props.duration - props.remaining) / props.duration, 0, 1) : 0;
  const activeTasks = props.tasks.filter((task) => !task.completed);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.brandEyebrow}>研时</Text>
          <Text style={styles.pageHeading}>今日专注</Text>
        </View>
        <View style={styles.countdownBadge}>
          <Target size={17} color={COLORS.primaryDark} />
          <View>
            <Text style={styles.countdownLabel}>距离初试</Text>
            <Text style={styles.countdownValue}>{props.examDays}<Text style={styles.countdownUnit}> 天</Text></Text>
          </View>
        </View>
      </View>

      <View style={styles.segmented}>
        <Pressable style={[styles.segmentButton, props.mode === 'focus' && styles.segmentButtonActive]} onPress={() => props.onMode('focus')}>
          <Text style={[styles.segmentText, props.mode === 'focus' && styles.segmentTextActive]}>专注</Text>
        </Pressable>
        <Pressable style={[styles.segmentButton, props.mode === 'break' && styles.segmentButtonActive]} onPress={() => props.onMode('break')}>
          <Text style={[styles.segmentText, props.mode === 'break' && styles.segmentTextActive]}>休息</Text>
        </Pressable>
      </View>

      <View style={styles.timerCard}>
        <TimerRing progress={progress} color={subject.color}>
          <Text style={[styles.timerState, props.awaitingCompletion && styles.timerStateReady]}>
            {props.awaitingCompletion ? '时间到 · 等待确认' : props.running ? '正在专注' : props.mode === 'focus' ? '准备开始' : '放松一下'}
          </Text>
          <Text style={styles.timerDigits}>{formatClock(props.remaining)}</Text>
          <View style={styles.timerSubjectRow}>
            <View style={[styles.subjectDot, { backgroundColor: subject.color }]} />
            <Text style={styles.timerSubject}>{subject.name}</Text>
          </View>
        </TimerRing>
        <View style={styles.timerActions}>
          <IconButton label="重置" onPress={props.onReset}><RotateCcw size={21} color={COLORS.text} /></IconButton>
          <Pressable style={styles.primaryTimerButton} onPress={props.onToggle}>
            {props.awaitingCompletion ? <Check size={24} color="#FFFFFF" strokeWidth={3} /> : props.running ? <Pause size={24} color="#FFFFFF" fill="#FFFFFF" /> : <Play size={24} color="#FFFFFF" fill="#FFFFFF" />}
            <Text style={styles.primaryTimerText}>{props.awaitingCompletion ? '确认完成' : props.running ? '暂停' : '开始专注'}</Text>
          </Pressable>
          <IconButton label="跳过" onPress={props.onSkip}><SkipForward size={21} color={COLORS.text} /></IconButton>
        </View>
      </View>

      <SectionTitle title="选择科目" />
      <View style={styles.subjectGrid}>
        {SUBJECTS.map((item) => {
          const active = props.selectedSubject === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.subjectChip, active && { borderColor: item.color, backgroundColor: `${item.color}12` }]}
              onPress={() => props.onSubject(item.id)}
            >
              <View style={[styles.subjectDot, { backgroundColor: item.color }]} />
              <Text style={[styles.subjectChipText, active && styles.subjectChipTextActive]}>{item.name}</Text>
              {active ? <Check size={16} color={item.color} strokeWidth={2.7} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionTitleRow}>
        <SectionTitle title="关联任务" />
        <Pressable style={styles.inlineAction} onPress={props.onAddTask}>
          <Plus size={16} color={COLORS.primary} />
          <Text style={styles.inlineActionText}>新建</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskPicker}>
        <Pressable style={[styles.taskPickerCard, props.selectedTask === null && styles.taskPickerCardActive]} onPress={() => props.onTask(null)}>
          <Text style={styles.taskPickerSubject}>自由专注</Text>
          <Text style={styles.taskPickerTitle}>不关联具体任务</Text>
        </Pressable>
        {activeTasks.map((task) => {
          const item = subjectById(task.subject);
          const active = task.id === props.selectedTask;
          return (
            <Pressable key={task.id} style={[styles.taskPickerCard, active && styles.taskPickerCardActive]} onPress={() => props.onTask(task.id)}>
              <Text style={[styles.taskPickerSubject, { color: item.color }]}>{item.name} · {task.estimate} 个番茄钟</Text>
              <Text style={styles.taskPickerTitle} numberOfLines={2}>{task.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionTitle title="今日进度" />
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View>
            <Text style={styles.summaryLabel}>已专注</Text>
            <Text style={styles.summaryValue}>{formatMinutes(todayMinutes)}</Text>
          </View>
          <View style={styles.streakBadge}><Flame size={17} color={COLORS.warning} /><Text style={styles.streakText}>连续 {streak} 天</Text></View>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${clamp(todayMinutes / props.dailyGoal * 100, 0, 100)}%` }]} /></View>
        <Text style={styles.progressCaption}>每日目标 {formatMinutes(props.dailyGoal)} · 已完成 {Math.round(clamp(todayMinutes / props.dailyGoal * 100, 0, 100))}%</Text>
        <MiniBars data={week} max={maxWeek} />
      </View>
    </ScrollView>
  );
}

function TasksScreen({ tasks, onAdd, onToggle, onDelete }: {
  tasks: StudyTask[];
  onAdd: () => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const pending = tasks.filter((task) => !task.completed);
  const completed = tasks.filter((task) => task.completed);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <PageHeader title="学习任务" subtitle={`${pending.length} 项待完成`} actionLabel="新建" onAction={onAdd} />
      <SectionTitle title="进行中" />
      <View style={styles.listCard}>
        {pending.length ? pending.map((task, index) => (
          <TaskRow key={task.id} task={task} last={index === pending.length - 1} onToggle={onToggle} onDelete={onDelete} />
        )) : <EmptyState title="今天的任务已经完成" subtitle="休息一下，或者新建下一项复习任务" />}
      </View>
      <SectionTitle title={`已完成 · ${completed.length}`} />
      <View style={styles.listCard}>
        {completed.length ? completed.map((task, index) => (
          <TaskRow key={task.id} task={task} last={index === completed.length - 1} onToggle={onToggle} onDelete={onDelete} />
        )) : <EmptyState title="还没有完成的任务" subtitle="完成后会自动归档到这里" />}
      </View>
    </ScrollView>
  );
}

function TaskRow({ task, last, onToggle, onDelete }: { task: StudyTask; last: boolean; onToggle: (id: number) => void; onDelete: (id: number) => void }) {
  const subject = subjectById(task.subject);
  return (
    <View style={[styles.taskRow, !last && styles.rowDivider]}>
      <Pressable style={[styles.checkButton, task.completed && { backgroundColor: subject.color, borderColor: subject.color }]} onPress={() => onToggle(task.id)}>
        {task.completed ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
      </Pressable>
      <View style={styles.taskRowContent}>
        <Text style={[styles.taskRowTitle, task.completed && styles.taskRowTitleDone]}>{task.title}</Text>
        <View style={styles.taskMeta}><View style={[styles.subjectDot, { backgroundColor: subject.color }]} /><Text style={styles.taskMetaText}>{subject.name} · 预计 {task.estimate} 个番茄钟</Text></View>
      </View>
      <Pressable style={styles.smallIconButton} onPress={() => onDelete(task.id)}><Trash2 size={18} color={COLORS.muted} /></Pressable>
    </View>
  );
}

function StatsScreen({ sessions, onAdd, onReduce, onUpdate, onDelete }: {
  sessions: StudySession[];
  onAdd: () => void;
  onReduce: () => void;
  onUpdate: (id: number, minutes: number) => void;
  onDelete: (id: number) => void;
}) {
  const [range, setRange] = useState<'week' | 'all'>('week');
  const [editing, setEditing] = useState<StudySession | null>(null);
  const total = sessions.reduce((sum, session) => sum + session.minutes, 0);
  const activeDays = new Set(sessions.map((session) => session.date)).size;
  const week = useMemo(() => buildRecentWeek(sessions), [sessions]);
  const weekKeys = new Set(week.map((item) => item.key));
  const visible = range === 'week' ? sessions.filter((session) => weekKeys.has(session.date)) : sessions;
  const visibleTotal = visible.reduce((sum, session) => sum + session.minutes, 0);
  const distribution = SUBJECTS.map((subject) => ({
    ...subject,
    minutes: visible.filter((session) => session.subject === subject.id).reduce((sum, session) => sum + session.minutes, 0),
  }));
  const maxWeek = Math.max(60, ...week.map((item) => item.minutes));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <PageHeader title="数据统计" subtitle="从投入时间，看见复习节奏" />
      <View style={styles.statsActions}>
        <Pressable style={styles.secondaryButton} onPress={onReduce}><Minus size={17} color={COLORS.text} /><Text style={styles.secondaryButtonText}>减少时长</Text></Pressable>
        <Pressable style={styles.primaryButton} onPress={onAdd}><CirclePlus size={18} color="#FFFFFF" /><Text style={styles.primaryButtonText}>补录时长</Text></Pressable>
      </View>
      <View style={styles.metricGrid}>
        <Metric label="累计次数" value={`${sessions.length}`} unit="次" />
        <Metric label="累计时长" value={formatMinutes(total)} />
        <Metric label="活跃日均" value={formatMinutes(activeDays ? Math.round(total / activeDays) : 0)} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View><Text style={styles.cardTitle}>科目分布</Text><Text style={styles.cardSubtitle}>{range === 'week' ? '最近 7 天' : '全部记录'}</Text></View>
          <View style={styles.smallSegmented}>
            <Pressable style={[styles.smallSegmentButton, range === 'week' && styles.smallSegmentActive]} onPress={() => setRange('week')}><Text style={[styles.smallSegmentText, range === 'week' && styles.smallSegmentTextActive]}>本周</Text></Pressable>
            <Pressable style={[styles.smallSegmentButton, range === 'all' && styles.smallSegmentActive]} onPress={() => setRange('all')}><Text style={[styles.smallSegmentText, range === 'all' && styles.smallSegmentTextActive]}>累计</Text></Pressable>
          </View>
        </View>
        {visibleTotal ? (
          <View style={styles.distributionLayout}>
            <DonutChart data={distribution} total={visibleTotal} />
            <View style={styles.legend}>
              {distribution.map((item) => (
                <View style={styles.legendRow} key={item.id}>
                  <View style={[styles.subjectDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendName}>{item.name}</Text>
                  <Text style={styles.legendValue}>{item.minutes} 分</Text>
                  <Text style={styles.legendPercent}>{Math.round(item.minutes / visibleTotal * 100)}%</Text>
                </View>
              ))}
            </View>
          </View>
        ) : <EmptyState title="还没有专注记录" subtitle="完成一次专注或手动补录后，图表会自动更新" />}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>最近 7 天</Text>
        <Text style={styles.cardSubtitle}>每日专注时长 · 分钟</Text>
        <LargeBars data={week} max={maxWeek} />
      </View>

      <SectionTitle title="各科累计" />
      <View style={styles.card}>
        {SUBJECTS.map((subject, index) => {
          const minutes = sessions.filter((session) => session.subject === subject.id).reduce((sum, session) => sum + session.minutes, 0);
          return (
            <View key={subject.id} style={[styles.subjectTotalRow, index < SUBJECTS.length - 1 && styles.rowDivider]}>
              <View style={styles.subjectTotalHead}><View style={[styles.subjectDot, { backgroundColor: subject.color }]} /><Text style={styles.subjectTotalName}>{subject.name}</Text><Text style={styles.subjectTotalValue}>{formatMinutes(minutes)}</Text></View>
              <View style={styles.subjectTotalTrack}><View style={[styles.subjectTotalFill, { width: `${total ? minutes / total * 100 : 0}%`, backgroundColor: subject.color }]} /></View>
            </View>
          );
        })}
      </View>

      <SectionTitle title="专注记录" />
      <View style={styles.listCard}>
        {sessions.length ? [...sessions].reverse().slice(0, 30).map((session, index, list) => {
          const subject = subjectById(session.subject);
          return (
            <View key={session.id} style={[styles.sessionRow, index < list.length - 1 && styles.rowDivider]}>
              <View style={[styles.sessionIcon, { backgroundColor: `${subject.color}18` }]}><Clock3 size={18} color={subject.color} /></View>
              <View style={styles.sessionContent}><Text style={styles.sessionTitle}>{subject.name} · {session.minutes} 分钟</Text><Text style={styles.sessionDate}>{session.date}{session.manual ? ' · 手动记录' : ''}</Text></View>
              <Pressable style={styles.smallIconButton} onPress={() => setEditing(session)}><Pencil size={17} color={COLORS.muted} /></Pressable>
              <Pressable style={styles.smallIconButton} onPress={() => Alert.alert('删除记录？', '统计图表会立即同步更新。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => onDelete(session.id) }])}><Trash2 size={17} color={COLORS.muted} /></Pressable>
            </View>
          );
        }) : <EmptyState title="暂无专注记录" subtitle="开始第一轮专注吧" />}
      </View>
      <EditSessionModal session={editing} onClose={() => setEditing(null)} onSubmit={(id, minutes) => { onUpdate(id, minutes); setEditing(null); }} />
    </ScrollView>
  );
}

function SettingsScreen({ settings, onChange, onApply }: { settings: Settings; onChange: (patch: Partial<Settings>) => void; onApply: () => void }) {
  const [datePicker, setDatePicker] = useState(false);
  const [applied, setApplied] = useState(false);
  const [webDate, setWebDate] = useState(settings.examDate);
  const currentYear = new Date().getFullYear();
  useEffect(() => setWebDate(settings.examDate), [settings.examDate]);
  const chooseExamType = (examType: ExamType) => onChange({ examType, examDate: examType === 'custom' ? settings.examDate : suggestedExamDate(examType, settings.examYear) });
  const chooseExamYear = (examYear: number) => onChange({ examYear, examDate: settings.examType === 'custom' ? settings.examDate : suggestedExamDate(settings.examType, examYear) });
  const apply = () => {
    onApply();
    setApplied(true);
    setTimeout(() => setApplied(false), 1800);
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <PageHeader title="专注设置" subtitle="调整属于你的复习节奏" />
      <SectionTitle title="计时长度" />
      <View style={styles.listCard}>
        <StepperRow label="专注时长" value={settings.focus} min={1} max={180} onChange={(focus) => onChange({ focus })} />
        <StepperRow label="短休息" value={settings.shortBreak} min={1} max={60} onChange={(shortBreak) => onChange({ shortBreak })} />
        <StepperRow label="每日目标" value={settings.dailyGoal} min={30} max={960} step={30} onChange={(dailyGoal) => onChange({ dailyGoal })} last />
      </View>
      <SectionTitle title="考试目标日期" />
      <View style={styles.card}>
        <Text style={styles.settingHint}>用于首页倒计时。系统日期是预计值，官方公布后可以直接修改。</Text>
        <View style={styles.examTypeRow}>
          {([['postgraduate', '考研'], ['civilService', '国考'], ['custom', '自定义']] as Array<[ExamType, string]>).map(([type, label]) => (
            <Pressable key={type} style={[styles.examTypeButton, settings.examType === type && styles.examTypeButtonActive]} onPress={() => chooseExamType(type)}>
              <Text style={[styles.examTypeText, settings.examType === type && styles.examTypeTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {settings.examType !== 'custom' ? <StepperRow label={settings.examType === 'postgraduate' ? '考研届次' : '国考年份'} value={settings.examYear} min={currentYear} max={currentYear + 6} onChange={chooseExamYear} /> : null}
        {Platform.OS === 'web' ? (
          <View style={styles.dateButton}>
            <View style={styles.dateIcon}><CalendarDays size={20} color={COLORS.primary} /></View>
            <View style={styles.dateContent}>
              <Text style={styles.dateLabel}>{settings.examType === 'custom' ? '自定义日期' : '预计考试日期'}</Text>
              {createElement('input', {
                type: 'date',
                value: webDate,
                min: getDayKey(),
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  const value = event.currentTarget.value;
                  setWebDate(value);
                  if (value) onChange({ examDate: value });
                },
                style: { width: '100%', marginTop: 3, padding: 0, border: 0, outline: 0, color: COLORS.ink, background: 'transparent', fontSize: 14, fontWeight: 600 },
              })}
            </View>
          </View>
        ) : (
          <Pressable style={styles.dateButton} onPress={() => setDatePicker(true)}>
            <View style={styles.dateIcon}><CalendarDays size={20} color={COLORS.primary} /></View>
            <View style={styles.dateContent}><Text style={styles.dateLabel}>{settings.examType === 'custom' ? '自定义日期' : '预计考试日期'}</Text><Text style={styles.dateValue}>{settings.examDate}</Text></View>
            <ChevronDown size={18} color={COLORS.muted} />
          </Pressable>
        )}
        {settings.examType !== 'custom' ? <Pressable style={styles.presetButton} onPress={() => onChange({ examDate: suggestedExamDate(settings.examType, settings.examYear) })}><Target size={17} color={COLORS.primary} /><Text style={styles.presetText}>恢复系统预计日期</Text></Pressable> : null}
      </View>
      <SectionTitle title="行为" />
      <View style={styles.listCard}>
        <SwitchRow label="自动开始休息" description="专注结束后自动进入休息阶段" value={settings.autoBreak} onChange={(autoBreak) => onChange({ autoBreak })} />
        <SwitchRow label="严格模式" description="重置或跳过时需要再次确认" value={settings.strictMode} onChange={(strictMode) => onChange({ strictMode })} last />
      </View>
      <Pressable style={styles.applyButton} onPress={apply}><Text style={styles.applyButtonText}>{applied ? '已应用并重置计时器' : '应用计时设置'}</Text></Pressable>
      <Text style={styles.privacyNote}>任务、设置和专注记录仅保存在当前设备。当前版本没有账号系统和云同步。</Text>
      {datePicker ? (
        <DateTimePicker
          value={parseDayKey(settings.examDate)}
          mode="date"
          minimumDate={new Date()}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, date) => {
            if (Platform.OS !== 'ios') setDatePicker(false);
            if (date) onChange({ examDate: getDayKey(date) });
          }}
        />
      ) : null}
      {datePicker && Platform.OS === 'ios' ? <Pressable style={styles.dateDoneButton} onPress={() => setDatePicker(false)}><Text style={styles.dateDoneText}>完成</Text></Pressable> : null}
    </ScrollView>
  );
}

function TimerRing({ progress, color, children }: { progress: number; color: string; children: React.ReactNode }) {
  const size = 244;
  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={COLORS.surfaceMuted} strokeWidth={13} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={13} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
        </G>
      </Svg>
      {children}
    </View>
  );
}

function DonutChart({ data, total }: { data: Array<{ id: SubjectId; color: string; minutes: number }>; total: number }) {
  const size = 148;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={COLORS.surfaceMuted} strokeWidth={18} fill="none" />
          {data.filter((item) => item.minutes > 0).map((item) => {
            const length = item.minutes / total * circumference;
            const dashOffset = -offset;
            offset += length;
            return <Circle key={item.id} cx={size / 2} cy={size / 2} r={radius} stroke={item.color} strokeWidth={18} fill="none" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset} />;
          })}
        </G>
      </Svg>
      <View style={styles.donutCenter}><Text style={styles.donutLabel}>总计</Text><Text style={styles.donutValue}>{total}</Text><Text style={styles.donutUnit}>分钟</Text></View>
    </View>
  );
}

function MiniBars({ data, max }: { data: ReturnType<typeof buildRecentWeek>; max: number }) {
  return (
    <View style={styles.miniChart}>
      {data.map((item) => (
        <View style={styles.miniBarColumn} key={item.key}>
          <View style={styles.miniBarTrack}><View style={[styles.miniBarFill, { height: `${item.minutes / max * 100}%` }, item.today && styles.miniBarToday]} /></View>
          <Text style={[styles.miniBarLabel, item.today && styles.miniBarLabelToday]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function LargeBars({ data, max }: { data: ReturnType<typeof buildRecentWeek>; max: number }) {
  return (
    <View style={styles.largeChart}>
      {data.map((item) => (
        <View style={styles.largeBarColumn} key={item.key}>
          <Text style={styles.largeBarValue}>{item.minutes || ''}</Text>
          <View style={styles.largeBarTrack}><View style={[styles.largeBarFill, { height: `${item.minutes / max * 100}%` }, item.today && styles.largeBarToday]} /></View>
          <Text style={[styles.largeBarLabel, item.today && styles.miniBarLabelToday]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function TaskModal({ visible, onClose, onSubmit }: { visible: boolean; onClose: () => void; onSubmit: (draft: TaskDraft) => void }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<SubjectId>('math');
  const [estimate, setEstimate] = useState(2);
  useEffect(() => { if (visible) { setTitle(''); setSubject('math'); setEstimate(2); } }, [visible]);
  return (
    <BottomModal visible={visible} title="新建学习任务" subtitle="一个任务最好能在 1-3 个番茄钟内完成" onClose={onClose}>
      <Text style={styles.inputLabel}>任务内容</Text>
      <TextInput style={styles.textInput} placeholder="例如：完成数学真题第 3 章" placeholderTextColor={COLORS.muted} value={title} onChangeText={setTitle} autoFocus />
      <Text style={styles.inputLabel}>科目</Text>
      <SubjectSelector value={subject} onChange={setSubject} />
      <View style={styles.modalStepperRow}><Text style={styles.inputLabel}>预计番茄钟</Text><Stepper value={estimate} min={1} max={12} onChange={setEstimate} /></View>
      <Pressable style={[styles.modalPrimary, !title.trim() && styles.disabledButton]} disabled={!title.trim()} onPress={() => onSubmit({ title: title.trim(), subject, estimate })}><Text style={styles.modalPrimaryText}>添加任务</Text></Pressable>
    </BottomModal>
  );
}

function SessionModal({ mode, sessions, onClose, onSubmit }: { mode: 'add' | 'reduce' | null; sessions: StudySession[]; onClose: () => void; onSubmit: (draft: SessionDraft) => void }) {
  const [date, setDate] = useState(getDayKey());
  const [subject, setSubject] = useState<SubjectId>('math');
  const [minutes, setMinutes] = useState(30);
  const [showDate, setShowDate] = useState(false);
  useEffect(() => { if (mode) { setDate(getDayKey()); setSubject('math'); setMinutes(30); setShowDate(false); } }, [mode]);
  const available = sessions.filter((session) => session.date === date && session.subject === subject).reduce((sum, session) => sum + session.minutes, 0);
  const valid = mode === 'reduce' ? available > 0 && minutes <= available : minutes > 0;
  return (
    <BottomModal visible={mode !== null} title={mode === 'reduce' ? '减少专注时长' : '补录专注时长'} subtitle={mode === 'reduce' ? `当前最多可减少 ${available} 分钟` : '保存后会同步到累计数据和全部图表'} onClose={onClose}>
      <Text style={styles.inputLabel}>日期</Text>
      <Pressable style={styles.textInput} onPress={() => setShowDate(true)}><Text style={styles.inputValue}>{date}</Text><CalendarDays size={18} color={COLORS.muted} /></Pressable>
      {showDate ? <DateTimePicker value={parseDayKey(date)} mode="date" maximumDate={new Date()} display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={(_, value) => { if (Platform.OS !== 'ios') setShowDate(false); if (value) setDate(getDayKey(value)); }} /> : null}
      {showDate && Platform.OS === 'ios' ? <Pressable style={styles.dateDoneButton} onPress={() => setShowDate(false)}><Text style={styles.dateDoneText}>完成</Text></Pressable> : null}
      <Text style={styles.inputLabel}>科目</Text>
      <SubjectSelector value={subject} onChange={setSubject} />
      <View style={styles.modalStepperRow}><Text style={styles.inputLabel}>{mode === 'reduce' ? '减少分钟' : '专注分钟'}</Text><Stepper value={minutes} min={1} max={mode === 'reduce' ? Math.max(1, available) : 1440} step={5} onChange={setMinutes} /></View>
      {!valid && mode === 'reduce' ? <Text style={styles.warningText}>该日期和科目没有可减少的记录。</Text> : null}
      <Pressable style={[styles.modalPrimary, !valid && styles.disabledButton]} disabled={!valid} onPress={() => onSubmit({ date, subject, minutes })}><Text style={styles.modalPrimaryText}>{mode === 'reduce' ? '确认减少' : '保存记录'}</Text></Pressable>
    </BottomModal>
  );
}

function EditSessionModal({ session, onClose, onSubmit }: { session: StudySession | null; onClose: () => void; onSubmit: (id: number, minutes: number) => void }) {
  const [minutes, setMinutes] = useState(30);
  useEffect(() => { if (session) setMinutes(session.minutes); }, [session]);
  return (
    <BottomModal visible={session !== null} title="修改专注记录" subtitle="修改后统计图表会立即同步" onClose={onClose}>
      <View style={styles.modalStepperRow}><Text style={styles.inputLabel}>专注分钟</Text><Stepper value={minutes} min={1} max={1440} step={5} onChange={setMinutes} /></View>
      <Pressable style={styles.modalPrimary} onPress={() => session && onSubmit(session.id, minutes)}><Text style={styles.modalPrimaryText}>保存修改</Text></Pressable>
    </BottomModal>
  );
}

function BottomModal({ visible, title, subtitle, onClose, children }: { visible: boolean; title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}><View style={styles.modalHeaderText}><Text style={styles.modalTitle}>{title}</Text><Text style={styles.modalSubtitle}>{subtitle}</Text></View><Pressable style={styles.modalClose} onPress={onClose}><X size={20} color={COLORS.text} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SubjectSelector({ value, onChange }: { value: SubjectId; onChange: (value: SubjectId) => void }) {
  return <View style={styles.modalSubjectGrid}>{SUBJECTS.map((subject) => <Pressable key={subject.id} style={[styles.modalSubject, value === subject.id && { borderColor: subject.color, backgroundColor: `${subject.color}12` }]} onPress={() => onChange(subject.id)}><View style={[styles.subjectDot, { backgroundColor: subject.color }]} /><Text style={styles.modalSubjectText}>{subject.name}</Text></Pressable>)}</View>;
}

function Stepper({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <View style={styles.stepper}><Pressable style={styles.stepperButton} onPress={() => onChange(clamp(value - step, min, max))}><Minus size={17} color={COLORS.text} /></Pressable><Text style={styles.stepperValue}>{value}</Text><Pressable style={styles.stepperButton} onPress={() => onChange(clamp(value + step, min, max))}><Plus size={17} color={COLORS.text} /></Pressable></View>;
}

function StepperRow({ label, value, min, max, step, onChange, last = false }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; last?: boolean }) {
  return <View style={[styles.settingRow, !last && styles.rowDivider]}><View><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingValue}>{value} 分钟</Text></View><Stepper value={value} min={min} max={max} step={step} onChange={onChange} /></View>;
}

function SwitchRow({ label, description, value, onChange, last = false }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void; last?: boolean }) {
  return <View style={[styles.settingRow, !last && styles.rowDivider]}><View style={styles.switchCopy}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingDescription}>{description}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: '#CBD2CC', true: COLORS.primary }} thumbColor="#FFFFFF" /></View>;
}

function PageHeader({ title, subtitle, actionLabel, onAction }: { title: string; subtitle: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={styles.pageHeader}><View><Text style={styles.pageHeading}>{title}</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View>{actionLabel && onAction ? <Pressable style={styles.headerAction} onPress={onAction}><Plus size={17} color="#FFFFFF" /><Text style={styles.headerActionText}>{actionLabel}</Text></Pressable> : null}</View>;
}

function SectionTitle({ title }: { title: string }) { return <Text style={styles.sectionTitle}>{title}</Text>; }

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) { return <Pressable style={styles.iconAction} onPress={onPress}>{children}<Text style={styles.iconActionLabel}>{label}</Text></Pressable>; }

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}{unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}</Text></View>; }

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) { return <View style={styles.emptyState}><View style={styles.emptyIcon}><Check size={20} color={COLORS.primary} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptySubtitle}>{subtitle}</Text></View>; }

export default function App() {
  return <SafeAreaProvider><AppShell /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, gap: 10 },
  loadingBrand: { fontSize: 23, fontWeight: '700', color: COLORS.ink },
  screen: { flex: 1 },
  screenContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 118 },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brandEyebrow: { color: COLORS.primary, fontSize: 13, fontWeight: '700', marginBottom: 3 },
  pageHeading: { color: COLORS.ink, fontSize: 27, fontWeight: '700' },
  pageSubtitle: { color: COLORS.muted, fontSize: 13, marginTop: 5 },
  countdownBadge: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: COLORS.primarySoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  countdownLabel: { color: COLORS.text, fontSize: 10 },
  countdownValue: { color: COLORS.primaryDark, fontSize: 18, fontWeight: '700', lineHeight: 20 },
  countdownUnit: { fontSize: 11, fontWeight: '600' },
  segmented: { flexDirection: 'row', alignSelf: 'center', width: 218, height: 40, padding: 3, backgroundColor: '#E5E9E3', borderRadius: 8, marginBottom: 14 },
  segmentButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  segmentButtonActive: { backgroundColor: '#FFFFFF' },
  segmentText: { color: COLORS.muted, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: COLORS.ink },
  timerCard: { backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.line, paddingVertical: 20, alignItems: 'center' },
  timerState: { color: COLORS.muted, fontSize: 13, marginBottom: 5 },
  timerStateReady: { color: COLORS.primaryDark, fontWeight: '700' },
  timerDigits: { color: COLORS.ink, fontSize: 49, lineHeight: 57, fontVariant: ['tabular-nums'], fontWeight: '600', letterSpacing: 0 },
  timerSubjectRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  subjectDot: { width: 8, height: 8, borderRadius: 4 },
  timerSubject: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  timerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 17, marginTop: 16 },
  iconAction: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconActionLabel: { color: COLORS.muted, fontSize: 10 },
  primaryTimerButton: { minWidth: 148, height: 52, borderRadius: 7, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryTimerText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  sectionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 11 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 9 },
  inlineActionText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  subjectChip: { width: '48.7%', minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, borderRadius: 7, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface },
  subjectChipText: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  subjectChipTextActive: { color: COLORS.ink },
  taskPicker: { gap: 10, paddingRight: 18 },
  taskPickerCard: { width: 210, minHeight: 83, borderRadius: 7, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, padding: 13 },
  taskPickerCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  taskPickerSubject: { color: COLORS.primary, fontSize: 11, fontWeight: '700', marginBottom: 7 },
  taskPickerTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  summaryCard: { borderRadius: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, padding: 16 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { color: COLORS.muted, fontSize: 12, marginBottom: 4 },
  summaryValue: { color: COLORS.ink, fontSize: 20, fontWeight: '700' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFF4DF', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 7 },
  streakText: { color: '#94631A', fontSize: 12, fontWeight: '600' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: COLORS.surfaceMuted, overflow: 'hidden', marginTop: 16 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.primary },
  progressCaption: { color: COLORS.muted, fontSize: 11, marginTop: 7 },
  miniChart: { height: 82, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 17 },
  miniBarColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  miniBarTrack: { width: 13, height: 56, borderRadius: 3, backgroundColor: COLORS.surfaceMuted, overflow: 'hidden', justifyContent: 'flex-end' },
  miniBarFill: { width: '100%', minHeight: 2, backgroundColor: '#9DB2A9' },
  miniBarToday: { backgroundColor: COLORS.primary },
  miniBarLabel: { color: COLORS.muted, fontSize: 10 },
  miniBarLabelToday: { color: COLORS.primaryDark, fontWeight: '700' },
  pageHeader: { minHeight: 67, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, borderRadius: 7, paddingHorizontal: 13, paddingVertical: 10 },
  headerActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  listCard: { backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.line, overflow: 'hidden' },
  taskRow: { minHeight: 84, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line },
  checkButton: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#AAB5AF', alignItems: 'center', justifyContent: 'center' },
  taskRowContent: { flex: 1 },
  taskRowTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  taskRowTitleDone: { color: COLORS.muted, textDecorationLine: 'line-through' },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  taskMetaText: { color: COLORS.muted, fontSize: 11 },
  smallIconButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  statsActions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  secondaryButton: { flex: 1, height: 44, borderRadius: 7, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryButtonText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  primaryButton: { flex: 1, height: 44, borderRadius: 7, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  metricGrid: { flexDirection: 'row', gap: 8, marginBottom: 13 },
  metric: { flex: 1, minHeight: 87, backgroundColor: COLORS.surface, borderRadius: 7, borderWidth: 1, borderColor: COLORS.line, padding: 12, justifyContent: 'space-between' },
  metricLabel: { color: COLORS.muted, fontSize: 11 },
  metricValue: { color: COLORS.ink, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  metricUnit: { fontSize: 11, fontWeight: '500', color: COLORS.muted },
  card: { backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.line, padding: 16, marginBottom: 13 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '700' },
  cardSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  smallSegmented: { flexDirection: 'row', borderRadius: 6, backgroundColor: COLORS.surfaceMuted, padding: 2 },
  smallSegmentButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 5 },
  smallSegmentActive: { backgroundColor: '#FFFFFF' },
  smallSegmentText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  smallSegmentTextActive: { color: COLORS.ink },
  distributionLayout: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 13 },
  donutWrap: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  donutLabel: { color: COLORS.muted, fontSize: 10 },
  donutValue: { color: COLORS.ink, fontSize: 22, fontWeight: '700', lineHeight: 25 },
  donutUnit: { color: COLORS.muted, fontSize: 9 },
  legend: { flex: 1, gap: 9 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendName: { flex: 1, color: COLORS.text, fontSize: 11 },
  legendValue: { color: COLORS.ink, fontSize: 10, fontWeight: '600' },
  legendPercent: { width: 30, textAlign: 'right', color: COLORS.muted, fontSize: 10 },
  largeChart: { height: 171, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 },
  largeBarColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  largeBarValue: { color: COLORS.muted, fontSize: 9, height: 13 },
  largeBarTrack: { width: 22, height: 125, borderRadius: 4, backgroundColor: COLORS.surfaceMuted, overflow: 'hidden', justifyContent: 'flex-end' },
  largeBarFill: { width: '100%', minHeight: 2, backgroundColor: '#A7B7B0' },
  largeBarToday: { backgroundColor: COLORS.primary },
  largeBarLabel: { color: COLORS.muted, fontSize: 10 },
  subjectTotalRow: { paddingVertical: 13 },
  subjectTotalHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  subjectTotalName: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '600' },
  subjectTotalValue: { color: COLORS.ink, fontSize: 12, fontWeight: '600' },
  subjectTotalTrack: { height: 5, borderRadius: 3, backgroundColor: COLORS.surfaceMuted, overflow: 'hidden', marginTop: 9 },
  subjectTotalFill: { height: '100%', borderRadius: 3 },
  sessionRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  sessionIcon: { width: 37, height: 37, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  sessionContent: { flex: 1, marginLeft: 10 },
  sessionTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '600' },
  sessionDate: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  settingHint: { color: COLORS.muted, fontSize: 12, marginBottom: 14 },
  examTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  examTypeButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surfaceMuted },
  examTypeButtonActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  examTypeText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  examTypeTextActive: { color: COLORS.primaryDark },
  settingRow: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingLabel: { color: COLORS.ink, fontSize: 14, fontWeight: '600' },
  settingValue: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  settingDescription: { color: COLORS.muted, fontSize: 11, marginTop: 4, lineHeight: 16 },
  switchCopy: { flex: 1 },
  stepper: { height: 36, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 6, overflow: 'hidden' },
  stepperButton: { width: 38, height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceMuted },
  stepperValue: { minWidth: 42, textAlign: 'center', color: COLORS.ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dateButton: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 7, paddingHorizontal: 12 },
  dateIcon: { width: 36, height: 36, borderRadius: 7, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dateContent: { flex: 1, marginLeft: 10 },
  dateLabel: { color: COLORS.muted, fontSize: 10 },
  dateValue: { color: COLORS.ink, fontSize: 14, fontWeight: '600', marginTop: 3 },
  presetButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingVertical: 9 },
  presetText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  applyButton: { height: 48, backgroundColor: COLORS.primary, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  applyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  privacyNote: { color: COLORS.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginHorizontal: 15, marginTop: 13 },
  dateDoneButton: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8 },
  dateDoneText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  emptyState: { minHeight: 138, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25, paddingVertical: 20 },
  emptyIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  emptyTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { color: COLORS.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 4 },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 66, paddingTop: 7, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  tabIcon: { width: 42, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: COLORS.primarySoft },
  tabLabel: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  tabLabelActive: { color: COLORS.primaryDark, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(18, 27, 23, 0.42)' },
  modalSheet: { maxHeight: '91%', backgroundColor: COLORS.surface, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 34 },
  modalHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#CDD3CE', alignSelf: 'center', marginBottom: 14 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  modalHeaderText: { flex: 1 },
  modalTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '700' },
  modalSubtitle: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  modalClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  inputLabel: { color: COLORS.text, fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 6 },
  textInput: { minHeight: 48, borderWidth: 1, borderColor: COLORS.line, borderRadius: 7, backgroundColor: COLORS.surface, paddingHorizontal: 13, color: COLORS.ink, fontSize: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputValue: { color: COLORS.ink, fontSize: 14 },
  modalSubjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 13 },
  modalSubject: { width: '48.8%', height: 42, borderWidth: 1, borderColor: COLORS.line, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11 },
  modalSubjectText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  modalStepperRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  modalPrimary: { height: 48, borderRadius: 7, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  modalPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  warningText: { color: COLORS.danger, fontSize: 11, marginTop: 4 },
});
