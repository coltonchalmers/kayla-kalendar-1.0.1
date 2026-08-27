import type { AvailabilityRule, AvailabilityOverride, Booking, TimeRestriction } from './types';

export function generateTimeSlots(
  date: Date,
  rules: AvailabilityRule[],
  overrides: AvailabilityOverride[],
  existingBookings: Booking[],
  durationMinutes: number,
  leadHours: number,
  bufferMinutes: number = 0,
  slotIncrement: number = 15,
  adminTimezone: string = 'America/New_York'
): string[] {
  const dateStr = formatDate(date);
  const dayOfWeek = date.getDay();

  const override = overrides.find(o => o.date === dateStr);
  if (override?.is_blocked) return [];

  let windows: { start: string; end: string }[] = [];

  if (override && !override.is_blocked && override.start_time && override.end_time) {
    windows = [{ start: override.start_time, end: override.end_time }];
  } else {
    windows = rules
      .filter(r => r.day_of_week === dayOfWeek && r.is_active)
      .map(r => ({ start: r.start_time, end: r.end_time }));
  }

  if (windows.length === 0) return [];

  const slots: string[] = [];
  const now = new Date();
  const leadCutoff = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

  const dayBookings = existingBookings.filter(
    b => b.date === dateStr && b.status !== 'cancelled'
  );

  for (const window of windows) {
    const startMinutes = timeToMinutes(window.start);
    const endMinutes = timeToMinutes(window.end);

    for (let m = startMinutes; m + durationMinutes <= endMinutes; m += slotIncrement) {
      const slotStart = minutesToTime(m);

      const slotDateTime = getMeetingInstantUTC(dateStr, slotStart, adminTimezone);
      if (slotDateTime < leadCutoff) continue;

      const hasConflict = dayBookings.some(b => {
        const bStart = timeToMinutes(b.start_time);
        const bEnd = timeToMinutes(b.end_time);
        return m < bEnd + bufferMinutes && m + durationMinutes + bufferMinutes > bStart;
      });

      if (!hasConflict) {
        slots.push(slotStart);
      }
    }
  }

  return slots;
}

export function generateSlotsInRange(
  date: Date,
  timeStart: string,
  timeEnd: string,
  existingBookings: Booking[],
  durationMinutes: number,
  leadHours: number,
  bufferMinutes: number = 0,
  slotIncrement: number = 15,
  adminTimezone: string = 'America/New_York'
): string[] {
  const dateStr = formatDate(date);
  const slots: string[] = [];
  const now = new Date();
  const leadCutoff = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

  const dayBookings = existingBookings.filter(
    b => b.date === dateStr && b.status !== 'cancelled'
  );

  const startMinutes = timeToMinutes(timeStart);
  const endMinutes = timeToMinutes(timeEnd);

  for (let m = startMinutes; m + durationMinutes <= endMinutes; m += slotIncrement) {
    const slotStart = minutesToTime(m);
    const slotDateTime = getMeetingInstantUTC(dateStr, slotStart, adminTimezone);
    if (slotDateTime < leadCutoff) continue;

    const hasConflict = dayBookings.some(b => {
      const bStart = timeToMinutes(b.start_time);
      const bEnd = timeToMinutes(b.end_time);
      return m < bEnd + bufferMinutes && m + durationMinutes + bufferMinutes > bStart;
    });

    if (!hasConflict) {
      slots.push(slotStart);
    }
  }

  return slots;
}

export function hasAvailability(
  date: Date,
  rules: AvailabilityRule[],
  overrides: AvailabilityOverride[]
): boolean {
  const dateStr = formatDate(date);
  const dayOfWeek = date.getDay();

  const override = overrides.find(o => o.date === dateStr);
  if (override?.is_blocked) return false;
  if (override && !override.is_blocked && override.start_time) return true;

  return rules.some(r => r.day_of_week === dayOfWeek && r.is_active);
}

export function isDateSelectable(
  date: Date,
  rules: AvailabilityRule[],
  overrides: AvailabilityOverride[],
  timeRestrictions: TimeRestriction[] | null = null,
): boolean {
  const dateStr = formatDate(date);
  const override = overrides.find(o => o.date === dateStr);
  if (override?.is_blocked) return false;

  if (timeRestrictions && timeRestrictions.length > 0) {
    const dayOfWeek = date.getDay();
    return timeRestrictions.some(r => r.day === dayOfWeek);
  }

  if (override && !override.is_blocked && override.start_time) return true;

  return rules.some(r => r.day_of_week === date.getDay() && r.is_active);
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
}

export function getMonthDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: CalendarDay[] = [];

  for (let i = 0; i < firstDay.getDay(); i++) {
    const d = new Date(year, month, i - firstDay.getDay() + 1);
    days.push({ date: d, isCurrentMonth: false });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }

  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    days.push({ date: next, isCurrentMonth: false });
  }

  return days;
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export function isPast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const targetDay = result.getDate();
  result.setMonth(result.getMonth() + months, 1);
  const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(targetDay, lastDayOfMonth));
  return result;
}

export function isBookingOutOfHours(
  booking: Booking,
  rules: AvailabilityRule[],
  overrides: AvailabilityOverride[]
): boolean {
  const dateStr = booking.date;
  const date = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = date.getDay();

  const override = overrides.find(o => o.date === dateStr);
  if (override?.is_blocked) return true;

  const startMin = timeToMinutes(booking.start_time);
  const endMin = timeToMinutes(booking.end_time);

  if (override && !override.is_blocked && override.start_time && override.end_time) {
    const oStart = timeToMinutes(override.start_time);
    const oEnd = timeToMinutes(override.end_time);
    return startMin < oStart || endMin > oEnd;
  }

  const dayRules = rules.filter(r => r.day_of_week === dayOfWeek && r.is_active);
  if (dayRules.length === 0) return true;

  return !dayRules.some(r => {
    const rStart = timeToMinutes(r.start_time);
    const rEnd = timeToMinutes(r.end_time);
    return startMin >= rStart && endMin <= rEnd;
  });
}

export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Europe/Athens', label: 'Eastern Europe (EET)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Dubai', label: 'Gulf (GST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
  { value: 'Pacific/Auckland', label: 'New Zealand (NZDT)' },
  { value: 'UTC', label: 'UTC' },
];

export function getTimezoneOptions(): { value: string; label: string }[] {
  return COMMON_TIMEZONES;
}

export function detectTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && COMMON_TIMEZONES.some(tz => tz.value === detected)) {
      return detected;
    }
    if (detected) {
      return detected;
    }
  } catch {
    // fall through
  }
  return 'America/New_York';
}

export function getTimezoneLabel(tz: string): string {
  const found = COMMON_TIMEZONES.find(t => t.value === tz);
  if (found) return found.label;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || tz;
  } catch {
    return tz;
  }
}

export function getTzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const p: Record<string, string> = {};
  parts.forEach(part => { p[part.type] = part.value; });
  const asUtc = Date.UTC(
    parseInt(p.year), parseInt(p.month) - 1, parseInt(p.day),
    parseInt(p.hour) === 24 ? 0 : parseInt(p.hour), parseInt(p.minute), parseInt(p.second)
  );
  return asUtc - date.getTime();
}

export function getMeetingInstantUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [sh, sm] = timeStr.split(':').map(Number);
  const wallClock = new Date(Date.UTC(y, m - 1, d, sh, sm));
  const offsetMs = getTzOffsetMs(wallClock, tz);
  return new Date(wallClock.getTime() - offsetMs);
}

export function convertTimeSlot(
  timeStr: string,
  dateStr: string,
  fromTz: string,
  toTz: string
): string {
  return convertTimeSlotWithDate(timeStr, dateStr, fromTz, toTz).time;
}

export function convertTimeSlotWithDate(
  timeStr: string,
  dateStr: string,
  fromTz: string,
  toTz: string
): { date: string; time: string } {
  if (fromTz === toTz) return { date: dateStr, time: timeStr };
  try {
    const utcInstant = getMeetingInstantUTC(dateStr, timeStr, fromTz);

    const toParts = new Intl.DateTimeFormat('en-US', {
      timeZone: toTz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(utcInstant);

    const p: Record<string, string> = {};
    toParts.forEach(part => { p[part.type] = part.value; });

    return {
      date: `${p.year}-${p.month}-${p.day}`,
      time: `${p.hour.padStart(2, '0')}:${p.minute}`,
    };
  } catch {
    return { date: dateStr, time: timeStr };
  }
}
