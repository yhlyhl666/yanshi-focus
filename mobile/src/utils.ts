import type { ExamType, StudySession, SubjectId } from './types';

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getDayKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDayKey = (value: string) => new Date(`${value}T12:00:00`);

export const formatClock = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
};

export const formatMinutes = (minutes: number) => {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe} 分钟`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
};

export const examDaysLeft = (date: string) => {
  const target = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
};

const POSTGRADUATE_DATES: Record<number, string> = {
  2026: '2025-12-20',
  2027: '2026-12-19',
  2028: '2027-12-25',
  2029: '2028-12-23',
  2030: '2029-12-22',
};

const CIVIL_SERVICE_DATES: Record<number, string> = {
  2026: '2025-11-30',
  2027: '2026-11-29',
  2028: '2027-11-28',
  2029: '2028-12-03',
  2030: '2029-12-02',
};

export const suggestedExamDate = (type: ExamType, year: number) => {
  if (type === 'custom') return '';
  const dates = type === 'postgraduate' ? POSTGRADUATE_DATES : CIVIL_SERVICE_DATES;
  if (dates[year]) return dates[year];
  const month = type === 'postgraduate' ? 11 : 10;
  const date = new Date(year - (type === 'postgraduate' ? 1 : 0), month, 30);
  while (date.getDay() !== 0 && date.getDay() !== 6) date.setDate(date.getDate() - 1);
  return getDayKey(date);
};

export const calculateStreak = (sessions: StudySession[]) => {
  const activeDays = new Set(sessions.map((session) => session.date));
  if (!activeDays.size) return 0;
  const cursor = new Date();
  if (!activeDays.has(getDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activeDays.has(getDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export const buildRecentWeek = (sessions: StudySession[]) =>
  Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    const key = getDayKey(date);
    return {
      key,
      label: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
      minutes: sessions
        .filter((session) => session.date === key)
        .reduce((sum, session) => sum + session.minutes, 0),
      today: key === getDayKey(),
    };
  });

export const reduceSessionMinutes = (
  sessions: StudySession[],
  date: string,
  subject: SubjectId,
  minutes: number,
) => {
  let remaining = minutes;
  return [...sessions]
    .reverse()
    .map((session) => {
      if (remaining <= 0 || session.date !== date || session.subject !== subject) return session;
      const deduction = Math.min(session.minutes, remaining);
      remaining -= deduction;
      return { ...session, minutes: session.minutes - deduction };
    })
    .reverse()
    .filter((session) => session.minutes > 0);
};
