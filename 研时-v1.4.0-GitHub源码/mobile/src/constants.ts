import type { Settings, StudyTask, Subject } from './types';

export const SUBJECTS: Subject[] = [
  { id: 'math', name: '数学', color: '#D65D4A' },
  { id: 'english', name: '英语', color: '#2F806F' },
  { id: 'politics', name: '政治', color: '#C98B2D' },
  { id: 'major', name: '专业课', color: '#536FA3' },
];

export const DEFAULT_TASKS: StudyTask[] = [
  { id: 1, title: '高等数学：极限与连续', subject: 'math', estimate: 3, completed: false },
  { id: 2, title: '英语阅读真题 2012 Text 1', subject: 'english', estimate: 2, completed: false },
  { id: 3, title: '政治：马克思主义基本原理', subject: 'politics', estimate: 2, completed: true },
];

export const DEFAULT_SETTINGS: Settings = {
  focus: 50,
  shortBreak: 10,
  longBreak: 20,
  dailyGoal: 300,
  examDate: '2027-12-25',
  examType: 'postgraduate',
  examYear: 2028,
  autoBreak: false,
  strictMode: false,
};

export const STORAGE_KEY = 'yanshi.mobile.v1';

export const COLORS = {
  background: '#F4F5F1',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1EB',
  ink: '#1C2823',
  text: '#405049',
  muted: '#7B8881',
  line: '#DEE4DD',
  primary: '#2E7566',
  primaryDark: '#205A4E',
  primarySoft: '#DDECE7',
  danger: '#B84E43',
  warning: '#C98B2D',
};
