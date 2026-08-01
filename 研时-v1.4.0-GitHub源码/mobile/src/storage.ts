import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, DEFAULT_TASKS, STORAGE_KEY } from './constants';
import type { PersistedState } from './types';

export const defaultState = (): PersistedState => ({
  tasks: DEFAULT_TASKS,
  sessions: [],
  settings: DEFAULT_SETTINGS,
  timer: {
    mode: 'focus',
    running: false,
    awaitingCompletion: false,
    remaining: DEFAULT_SETTINGS.focus * 60,
    selectedSubject: 'math',
    selectedTask: 1,
    endAt: null,
  },
});

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const saved = JSON.parse(raw) as Partial<PersistedState>;
    const settings = {
      ...DEFAULT_SETTINGS,
      ...saved.settings,
      examType: saved.settings?.examType ?? DEFAULT_SETTINGS.examType,
      examYear: saved.settings?.examYear ?? DEFAULT_SETTINGS.examYear,
    };
    if (!saved.settings?.examDate || saved.settings.examDate === '2026-12-20') {
      settings.examDate = DEFAULT_SETTINGS.examDate;
    }
    const fallback = defaultState();
    return {
      tasks: Array.isArray(saved.tasks) ? saved.tasks : fallback.tasks,
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      settings,
      timer: { ...fallback.timer, ...saved.timer },
    };
  } catch {
    return defaultState();
  }
}

export async function saveState(state: PersistedState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
