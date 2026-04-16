import { googleGet, googlePost, googleDelete } from './google-api.js';
import { sbUpsert, sbSelect, sbDeleteStaleEvents, getConfigValue, setConfigValue } from './supabase.js';

const CAL_BASE      = 'https://www.googleapis.com/calendar/v3';
const MEAL_CAL_NAME = 'Meal Planning';
const DAY_NAMES     = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Meal Planning sync ────────────────────────────────────────────────────────

let _mealSyncRunning = false;

export async function syncMealCalendar(env, lines, config = {}) {
  if (_mealSyncRunning) return;
  _mealSyncRunning = true;

  try {
    const prepStartDay  = config.prepStartDay  ?? 4;
    const freezePast    = config.freezePastDays ?? true;
    const eventPrefix   = config.eventPrefix   ?? 'Dinner: ';
    const noteFormat    = config.noteFormat    ?? 'multiline';

    if (lines[lines.length - 1] === '…') {
      console.log('[Calendar] Skipping meal sync — note truncated.');
      return;
    }

    const calendarId = await getOrCreateMealCalendar(env);
    const weekDates  = getWeekDates(prepStartDay);
    const meals      = parseMeals(lines, weekDates, noteFormat);
    if (!Object.keys(meals).length) return;

    const dates   = Object.values(meals).map((m) => m.date).sort();
    const weekMin = dates[0];
    const weekMax = dates[dates.length - 1];

    const existRes = await googleGet(env,
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events` +
      `?timeMin=${encodeURIComponent(weekMin + 'T00:00:00-12:00')}` +
      `&timeMax=${encodeURIComponent(weekMax + 'T23:59:59+14:00')}` +
      `&singleEvents=true`
    );
    const existing = existRes?.items || [];

    const byDate = {};
    for (const e of existing) {
      const d = e.start?.date;
      if (d) { byDate[d] = byDate[d] || []; byDate[d].push(e); }
    }

    const plannedDates = new Set(dates);

    // Remove events on dates no longer in the meal plan
    const todayStr = new Date().toISOString().split('T')[0];
    for (const [d, evts] of Object.entries(byDate)) {
      if (!plannedDates.has(d)) {
        if (freezePast && d < todayStr) continue;  // never touch past dates
        await Promise.all(evts.map((e) =>
          googleDelete(env, `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${e.id}`)
        ));
        console.log(`[Calendar] Removed stale meal events on ${d}`);
      }
    }

    // For each planned meal: clean up wrong/extra, create only if missing
    for (const [, { date, meal, url }] of Object.entries(meals)) {
      if (!meal) continue;
      if (freezePast && date < todayStr) continue;  // never touch past dates
      const expected = `${eventPrefix}${meal}`;
      const dayEvts  = byDate[date] || [];
      const correct  = dayEvts.filter((e) => e.summary === expected);
      const wrong    = dayEvts.filter((e) => e.summary !== expected);

      await Promise.all([...wrong, ...correct.slice(1)].map((e) =>
        googleDelete(env, `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${e.id}`)
      ));

      if (correct.length === 0) {
        await googlePost(env,
          `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
          { summary: expected, description: url || undefined, start: { date }, end: { date } }
        );
        console.log(`[Calendar] Created ${date}: ${meal}`);
      }
    }
  } finally {
    _mealSyncRunning = false;
  }
}

async function verifyCalendarAccessible(env, calendarId) {
  try {
    await googleGet(env, `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}`);
    return true;
  } catch {
    return false;
  }
}

async function getOrCreateMealCalendar(env) {
  const cached = await getConfigValue(env, 'meal_planning_calendar_id');
  if (cached && await verifyCalendarAccessible(env, cached)) return cached;

  if (cached) {
    console.warn('[Calendar] Cached meal calendar gone, re-discovering...');
    await setConfigValue(env, 'meal_planning_calendar_id', null);
  }

  const res        = await googleGet(env, `${CAL_BASE}/users/me/calendarList`);
  const candidates = (res.items || []).filter((c) => c.summary === MEAL_CAL_NAME);
  for (const cal of candidates) {
    if (await verifyCalendarAccessible(env, cal.id)) {
      await setConfigValue(env, 'meal_planning_calendar_id', cal.id);
      console.log(`[Calendar] Found existing "${MEAL_CAL_NAME}" calendar.`);
      return cal.id;
    }
  }

  const created = await googlePost(env, `${CAL_BASE}/calendars`, { summary: MEAL_CAL_NAME });
  console.log(`[Calendar] Created "${MEAL_CAL_NAME}": ${created.id}`);
  await setConfigValue(env, 'meal_planning_calendar_id', created.id);
  return created.id;
}

function parseMeals(lines, weekDates, noteFormat) {
  const meals      = {};
  let   currentDay = null;

  if (noteFormat === 'inline') {
    for (const line of lines) {
      const trimmed  = line.trim();
      const dayMatch = DAY_NAMES.find((d) => trimmed.toLowerCase().startsWith(d.toLowerCase() + ':'));
      if (dayMatch && weekDates[dayMatch]) {
        const mealText = trimmed.slice(dayMatch.length + 1).trim();
        if (mealText && !mealText.startsWith('http')) {
          meals[dayMatch] = { date: weekDates[dayMatch], meal: mealText };
        }
      }
    }
  } else {
    // multiline (default)
    for (const line of lines) {
      const trimmed  = line.trim();
      const dayMatch = DAY_NAMES.find((d) => trimmed.startsWith(d + ':'));

      if (dayMatch && weekDates[dayMatch]) {
        currentDay        = dayMatch;
        meals[currentDay] = { date: weekDates[dayMatch], meal: null };
        continue;
      }
      if (currentDay && trimmed.startsWith('- ')) {
        const mealText = trimmed.slice(2).trim();
        if (mealText && !mealText.startsWith('http')) meals[currentDay].meal = mealText;
        continue;
      }
      if (currentDay && meals[currentDay]?.meal && trimmed.startsWith('http')) {
        meals[currentDay].url = trimmed;
      }
    }
  }
  return meals;
}

function getWeekDates(prepStartDay) {
  // prepStartDay: JS dow (0=Sun…6=Sat) when anchor shifts to next week. null = never.
  const today = new Date();
  const dow   = today.getDay();

  // Determine if today is in the "prep next week" zone
  // Week display order: Sat(6) Sun(0) Mon(1) Tue(2) Wed(3) Thu(4) Fri(5)
  const weekOrder   = [6, 0, 1, 2, 3, 4, 5];
  const todayPos    = weekOrder.indexOf(dow);
  const cutoverPos  = prepStartDay !== null && prepStartDay !== undefined
    ? weekOrder.indexOf(prepStartDay) : -1;
  const nextWeek    = cutoverPos >= 0 && todayPos >= cutoverPos;

  const daysToSat   = dow === 6 ? 0 : dow + 1;
  const saturday    = new Date(today);
  saturday.setDate(today.getDate() - daysToSat + (nextWeek ? 7 : 0));
  saturday.setHours(0, 0, 0, 0);

  const order  = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const result = {};
  order.forEach((name, i) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    result[name] = d.toISOString().split('T')[0];
  });
  return result;
}

// ── All-calendar poller ───────────────────────────────────────────────────────

// Synthetic calendar ID for birthday events intercepted from personal calendars
const BIRTHDAY_CAL_ID    = '__birthdays__';
const BIRTHDAY_CAL_NAME  = 'Birthdays';
const BIRTHDAY_CAL_COLOR = '#f06292';

export async function pollAllCalendars(env) {
  const min = new Date();
  min.setDate(min.getDate() - min.getDay() - 1); // back to last Saturday
  min.setHours(0, 0, 0, 0);
  const max = new Date(); max.setDate(max.getDate() + 14); max.setHours(23, 59, 59, 999);

  let calListRes;
  try {
    calListRes = await googleGet(env, `${CAL_BASE}/users/me/calendarList`);
  } catch (err) {
    console.warn('[CalPoller] Could not list calendars:', err.message);
    return;
  }

  const calendars    = calListRes.items || [];
  const allEvents    = [];
  const seenIds      = [];
  let   birthdayCount = 0;

  for (const cal of calendars) {
    try {
      const url = `${CAL_BASE}/calendars/${encodeURIComponent(cal.id)}/events` +
        `?timeMin=${encodeURIComponent(min.toISOString())}` +
        `&timeMax=${encodeURIComponent(max.toISOString())}` +
        `&singleEvents=true&orderBy=startTime&maxResults=250`;
      const res    = await googleGet(env, url);
      const events = res.items || [];

      for (const ev of events) {
        if (!ev.id) continue;
        seenIds.push(ev.id);

        // Intercept birthday events — Google tags them with eventType: 'birthday'
        const isBirthday = ev.eventType === 'birthday';
        if (isBirthday) birthdayCount++;

        const isAllDay = !!ev.start?.date;
        allEvents.push({
          google_id:   ev.id,
          calendar_id: isBirthday ? BIRTHDAY_CAL_ID   : cal.id,
          cal_name:    isBirthday ? BIRTHDAY_CAL_NAME  : cal.summary,
          cal_color:   isBirthday ? BIRTHDAY_CAL_COLOR : (cal.backgroundColor || '#4285f4'),
          summary:     ev.summary || '(No title)',
          description: ev.description || null,
          is_all_day:  isAllDay,
          start_at:    isAllDay ? null : ev.start?.dateTime,
          end_at:      isAllDay ? null : ev.end?.dateTime,
          start_date:  isAllDay ? ev.start?.date  : null,
          end_date:    isAllDay ? ev.end?.date     : null,
          location:    ev.location || null,
          updated_at:  new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[CalPoller] Skipping "${cal.summary}": ${err.message}`);
    }
  }

  if (allEvents.length) {
    await sbUpsert(env, 'calendar_events', allEvents);
    await sbDeleteStaleEvents(env, seenIds);
  }

  // Keep visible_calendars config in sync (add new calendars, never remove)
  try {
    const existing = await sbSelect(env, 'config', { key: 'eq.visible_calendars', select: 'value' });
    const birthdayEntry = { id: BIRTHDAY_CAL_ID, name: BIRTHDAY_CAL_NAME, color: BIRTHDAY_CAL_COLOR, visible: true };

    if (!existing.length) {
      const initial = [
        ...calendars.map((c) => ({ id: c.id, name: c.summary, color: c.backgroundColor || '#4285f4', visible: true })),
        ...(birthdayCount > 0 ? [birthdayEntry] : []),
      ];
      await sbUpsert(env, 'config', [{ key: 'visible_calendars', value: initial, updated_at: new Date().toISOString() }]);
      console.log(`[CalPoller] Initialized visible_calendars with ${initial.length} calendars.`);
    } else {
      const current    = existing[0].value || [];
      const currentIds = new Set(current.map((c) => c.id));
      const newCals    = calendars.filter((c) => !currentIds.has(c.id));
      const needsBirthdayEntry = birthdayCount > 0 && !currentIds.has(BIRTHDAY_CAL_ID);
      if (newCals.length || needsBirthdayEntry) {
        const updated = [
          ...current,
          ...newCals.map((c) => ({ id: c.id, name: c.summary, color: c.backgroundColor || '#4285f4', visible: true })),
          ...(needsBirthdayEntry ? [birthdayEntry] : []),
        ];
        await sbUpsert(env, 'config', [{ key: 'visible_calendars', value: updated, updated_at: new Date().toISOString() }]);
        console.log(`[CalPoller] Added ${newCals.length} new calendar(s)${needsBirthdayEntry ? ' + Birthdays' : ''}.`);
      }
    }
  } catch (err) {
    console.warn('[CalPoller] Config seed error:', err.message);
  }

  console.log(`[CalPoller] Synced ${allEvents.length} events (${birthdayCount} birthdays) from ${calendars.length} calendars.`);
}
