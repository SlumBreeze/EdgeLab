import { TimeWindow, TimeWindowFilter } from '../types';

export type { TimeWindow, TimeWindowFilter };

export const TIME_WINDOW_FILTERS: Array<{ key: TimeWindowFilter; label: string; range: string }> = [
  { key: 'ALL', label: 'All', range: 'All day' },
  { key: 'EARLY', label: 'Early', range: '<12p ET' },
  { key: 'AFTERNOON', label: 'Afternoon', range: '12–5p ET' },
  { key: 'EVENING', label: 'Evening', range: '6p–12a ET' }
];

const getEtHour = (dateStr: string): number | null => {
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return null;
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false
  }).format(date);
  const hour = parseInt(hourStr, 10);
  return Number.isFinite(hour) ? hour : null;
};

export const getTimeWindow = (dateStr: string): TimeWindow | null => {
  const hour = getEtHour(dateStr);
  if (hour === null) return null;
  if (hour < 12) return 'EARLY';
  if (hour < 18) return 'AFTERNOON';
  return 'EVENING';
};

export const getTimeWindowLabel = (window: TimeWindow | TimeWindowFilter | null): string => {
  if (window === 'ALL') return 'All';
  if (window === 'EARLY') return 'Early';
  if (window === 'AFTERNOON') return 'Afternoon';
  if (window === 'EVENING') return 'Evening';
  return 'Unknown';
};

export const isInTimeWindow = (dateStr: string, window: TimeWindowFilter): boolean => {
  if (window === 'ALL') return true;
  return getTimeWindow(dateStr) === window;
};

export const formatEtTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return '--:-- ET';
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
  return `${time} ET`;
};
