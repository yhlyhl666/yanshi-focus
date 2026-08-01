export type SubjectId = 'math' | 'english' | 'politics' | 'major';

export type AppTab = 'focus' | 'tasks' | 'stats' | 'settings';

export type TimerMode = 'focus' | 'break';

export type ExamType = 'postgraduate' | 'civilService' | 'custom';

export type Subject = {
  id: SubjectId;
  name: string;
  color: string;
};

export type StudyTask = {
  id: number;
  title: string;
  subject: SubjectId;
  estimate: number;
  completed: boolean;
};

export type StudySession = {
  id: number;
  date: string;
  subject: SubjectId;
  taskId: number | null;
  minutes: number;
  manual?: boolean;
};

export type Settings = {
  focus: number;
  shortBreak: number;
  longBreak: number;
  dailyGoal: number;
  examDate: string;
  examType: ExamType;
  examYear: number;
  autoBreak: boolean;
  strictMode: boolean;
};

export type TimerSnapshot = {
  mode: TimerMode;
  running: boolean;
  awaitingCompletion: boolean;
  remaining: number;
  selectedSubject: SubjectId;
  selectedTask: number | null;
  endAt: number | null;
};

export type PersistedState = {
  tasks: StudyTask[];
  sessions: StudySession[];
  settings: Settings;
  timer: TimerSnapshot;
};
