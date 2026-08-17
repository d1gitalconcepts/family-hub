// Pure date/rotation logic for the School Schedule feature — no React,
// no Supabase. Keeping the "push the whole schedule on a snow day"
// mechanic in one small, testable place instead of scattered across
// components.

const WEEKDAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Local-date YYYY-MM-DD — deliberately not Date#toISOString(), which is
// UTC and rolls back a day for any timezone behind UTC.
export function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateStr(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "Is this one of the configured weekdays this kid has school at all",
// ignoring snow days/holidays — just the recurring weekly pattern.
function isConfiguredSchoolWeekday(date, schedule) {
  const days = schedule?.school_days_of_week?.length ? schedule.school_days_of_week : [1, 2, 3, 4, 5];
  return days.includes(date.getDay());
}

// Is `date` an actual school day once the shared snow-day/holiday
// calendar is accounted for. `exceptionsByDate` is keyed by dateStr().
export function isSchoolDay(date, schedule, exceptionsByDate) {
  if (!isConfiguredSchoolWeekday(date, schedule)) return false;
  const ex = exceptionsByDate?.[dateStr(date)];
  if (ex && ex.school_closed) return false;
  return true;
}

// Core "push" mechanic. The day-key for `date` is however many real
// school days have elapsed since the rotation anchor, cycling through
// schedule.day_letters. A day that isn't a real school day (weekend,
// holiday, snow day) is simply never counted — so cancelling one day
// shifts every day-letter after it by one, with no manual re-numbering.
//
// Returns null if there's no school that day, or the schedule isn't
// configured (fully) yet.
export function getDayKey(date, schedule, exceptionsByDate) {
  if (!schedule) return null;
  if (!isSchoolDay(date, schedule, exceptionsByDate)) return null;

  if (schedule.schedule_type === 'weekly') {
    return WEEKDAY_KEYS[date.getDay()];
  }

  const letters = schedule.day_letters?.length ? schedule.day_letters : ['A', 'B', 'C', 'D'];
  const anchorDate = parseDateStr(schedule.rotation_anchor_date);
  if (!anchorDate || date < anchorDate) return null;
  const anchorIdx = Math.max(0, letters.indexOf(schedule.rotation_anchor_letter || letters[0]));

  // Count real school days strictly between the anchor and `date` — that
  // count is the rotation offset from the anchor's letter.
  let offset = 0;
  const cursor = new Date(anchorDate);
  const target = dateStr(date);
  let guard = 0;
  while (dateStr(cursor) !== target && guard < 3650) {
    cursor.setDate(cursor.getDate() + 1);
    if (isSchoolDay(cursor, schedule, exceptionsByDate)) offset++;
    guard++;
  }
  const idx = (anchorIdx + offset) % letters.length;
  return letters[idx];
}

// Joins periods (the time template) with assignments (day-letter content)
// and the class catalog for a resolved day-key, filtered to assignments
// valid on `date`, sorted by period start time. Each result is
// { period, assignment, class }.
export function getDayEntries(periods, assignments, classes, dayKey, date) {
  if (!dayKey) return [];
  const d = dateStr(date);
  const periodsById = Object.fromEntries((periods || []).map((p) => [p.id, p]));
  const classesById = Object.fromEntries((classes || []).map((c) => [c.id, c]));
  return (assignments || [])
    .filter((a) => a.day_key === dayKey)
    .filter((a) => (!a.valid_from || a.valid_from <= d) && (!a.valid_until || a.valid_until >= d))
    .map((a) => ({ assignment: a, period: periodsById[a.period_id], class: classesById[a.class_id] }))
    .filter((e) => e.period && e.class)
    .sort((a, b) => (a.period.start_time || '').localeCompare(b.period.start_time || ''));
}

// 'HH:MM' or 'HH:MM:SS' (Postgres time) -> '7:45 AM'
export function formatTime(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

// 'HH:MM' or 'HH:MM:SS' + minutes -> 'HH:MM', wrapping at midnight.
export function addMinutesToTime(t, minutes) {
  const [hStr, mStr] = (t || '00:00').split(':');
  const total = (parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + Number(minutes || 0) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Minutes between two 'HH:MM'/'HH:MM:SS' times, assuming end is same-day
// (wraps forward if end looks earlier than start, e.g. crossing midnight).
export function minutesBetween(start, end) {
  const [sh, sm] = (start || '00:00').split(':').map(Number);
  const [eh, em] = (end || '00:00').split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 1440;
  return diff;
}

export function getWeekdayStrip(date) {
  const day = date.getDay(); // 0=Sun..6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function sameDay(a, b) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
