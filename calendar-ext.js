// Family Hub - Google Calendar sync (Meal Planning) + all-calendar poller
// Depends on: google-api.js, supabase-ext.js, storage.js

const CAL_BASE      = 'https://www.googleapis.com/calendar/v3';
const MEAL_CAL_NAME = 'Meal Planning';
const DAY_NAMES     = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Meal Planning calendar sync ──────────────────────────────────────────────

let _mealSyncRunning = false;

async function syncMealCalendar(lines) {
  if (_mealSyncRunning) {
    console.log('[Calendar] Meal sync already running, skipping.');
    return;
  }
  _mealSyncRunning = true;

  try {
    if (lines[lines.length - 1] === '…') {
      console.log('[Calendar] Skipping — note is truncated. Open the note in Keep to sync fully.');
      return;
    }

    const calendarId = await getOrCreateMealCalendar();
    const meals      = parseMeals(lines);

    if (!Object.keys(meals).length) {
      console.log('[Calendar] No meals parsed.');
      return;
    }

    // Fetch all existing events for the week in one query
    const dates     = Object.values(meals).map((m) => m.date).sort();
    const weekMin   = dates[0];
    const weekMax   = dates[dates.length - 1];
    const existRes  = await googleGet(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events` +
      `?timeMin=${encodeURIComponent(weekMin + 'T00:00:00-12:00')}` +
      `&timeMax=${encodeURIComponent(weekMax + 'T23:59:59+14:00')}` +
      `&singleEvents=true`
    );
    const existing = existRes.items || [];

    // Group existing events by date
    const byDate = {};
    for (const e of existing) {
      const d = e.start?.date;
      if (d) { byDate[d] = byDate[d] || []; byDate[d].push(e); }
    }

    const plannedDates = new Set(dates);

    // Delete events on dates that no longer have a meal
    for (const [d, evts] of Object.entries(byDate)) {
      if (!plannedDates.has(d)) {
        await Promise.all(evts.map((e) =>
          googleDelete(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${e.id}`)
        ));
        console.log(`[Calendar] Removed stale events on ${d}`);
      }
    }

    // For each planned meal: delete wrong/extra events, create only if missing
    for (const [, { date, meal, url }] of Object.entries(meals)) {
      if (!meal) continue;
      const expected = `Dinner: ${meal}`;
      const dayEvts  = byDate[date] || [];
      const correct  = dayEvts.filter((e) => e.summary === expected);
      const wrong    = dayEvts.filter((e) => e.summary !== expected);

      // Delete stale/duplicate events
      const toDelete = [...wrong, ...correct.slice(1)];
      await Promise.all(toDelete.map((e) =>
        googleDelete(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${e.id}`)
      ));

      // Create only if the correct event doesn't already exist
      if (correct.length === 0) {
        await googlePost(
          `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
          { summary: expected, description: url || undefined, start: { date }, end: { date } }
        );
        console.log(`[Calendar] Created ${date}: ${meal}`);
      } else {
        console.log(`[Calendar] ${date}: "${meal}" already exists, skipping`);
      }
    }
  } finally {
    _mealSyncRunning = false;
  }
}

async function verifyCalendarAccessible(calendarId) {
  try {
    await googleGet(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}`);
    return true;
  } catch {
    return false;
  }
}

async function getOrCreateMealCalendar() {
  const ids = await getGoogleIds();

  // Validate cached ID is still accessible
  if (ids.mealPlanningCalendarId) {
    if (await verifyCalendarAccessible(ids.mealPlanningCalendarId)) {
      return ids.mealPlanningCalendarId;
    }
    console.warn('[Calendar] Cached meal calendar is gone, re-discovering...');
    await saveGoogleId('mealPlanningCalendarId', null);
  }

  // Search calendar list for an accessible "Meal Planning" calendar
  const res  = await googleGet(`${CAL_BASE}/users/me/calendarList`);
  const candidates = (res.items || []).filter((c) => c.summary === MEAL_CAL_NAME);
  for (const cal of candidates) {
    if (await verifyCalendarAccessible(cal.id)) {
      await saveGoogleId('mealPlanningCalendarId', cal.id);
      console.log(`[Calendar] Found existing "${MEAL_CAL_NAME}" calendar.`);
      return cal.id;
    }
    console.warn(`[Calendar] "${MEAL_CAL_NAME}" (${cal.id}) inaccessible, skipping.`);
  }

  // Create a fresh calendar
  const created = await googlePost(`${CAL_BASE}/calendars`, { summary: MEAL_CAL_NAME });
  console.log(`[Calendar] Created new "${MEAL_CAL_NAME}" calendar: ${created.id}`);
  await saveGoogleId('mealPlanningCalendarId', created.id);
  return created.id;
}

async function deleteEventsOnDates(calendarId, dates) {
  for (const date of dates) {
    const url = `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events` +
      `?timeMin=${encodeURIComponent(date + 'T00:00:00-12:00')}` +
      `&timeMax=${encodeURIComponent(date + 'T23:59:59+14:00')}` +
      `&singleEvents=true`;
    const res    = await googleGet(url);
    const events = (res.items || []).filter((e) => e.start?.date === date);
    if (events.length) {
      await Promise.all(
        events.map((e) =>
          googleDelete(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${e.id}`)
        )
      );
      console.log(`[Calendar] Deleted ${events.length} event(s) on ${date}`);
    }
  }
}

function parseMeals(lines) {
  const weekDates = getWeekDates();
  const meals = {};
  let currentDay = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const dayMatch = DAY_NAMES.find((d) => trimmed.startsWith(d + ':'));
    if (dayMatch && weekDates[dayMatch]) {
      currentDay = dayMatch;
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
  return meals;
}

function getWeekDates() {
  const today      = new Date();
  const dow        = today.getDay();
  const daysToSat  = dow === 6 ? 0 : dow + 1;
  const saturday   = new Date(today);
  saturday.setDate(today.getDate() - daysToSat);
  saturday.setHours(0, 0, 0, 0);

  const order = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const result = {};
  order.forEach((name, i) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    result[name] = d.toISOString().split('T')[0];
  });
  return result;
}

// ── All-calendar poller → Supabase ───────────────────────────────────────────

async function pollAllCalendars() {
  if (!(await isAuthenticated())) return;

  const min = new Date(); min.setDate(min.getDate() - 1);  min.setHours(0, 0, 0, 0);
  const max = new Date(); max.setDate(max.getDate() + 14); max.setHours(23, 59, 59, 999);

  let calListRes;
  try {
    calListRes = await googleGet(`${CAL_BASE}/users/me/calendarList`);
  } catch (err) {
    console.warn('[CalPoller] Could not list calendars:', err.message);
    return;
  }

  const calendars = calListRes.items || [];
  const allEvents = [];
  const seenIds   = [];

  for (const cal of calendars) {
    try {
      const url = `${CAL_BASE}/calendars/${encodeURIComponent(cal.id)}/events` +
        `?timeMin=${encodeURIComponent(min.toISOString())}` +
        `&timeMax=${encodeURIComponent(max.toISOString())}` +
        `&singleEvents=true&orderBy=startTime&maxResults=250`;
      const res    = await googleGet(url);
      const events = res.items || [];

      for (const ev of events) {
        if (!ev.id) continue;
        seenIds.push(ev.id);
        const isAllDay = !!ev.start?.date;
        allEvents.push({
          google_id:   ev.id,
          calendar_id: cal.id,
          cal_name:    cal.summary,
          cal_color:   cal.backgroundColor || '#4285f4',
          summary:     ev.summary || '(No title)',
          description: ev.description || null,
          is_all_day:  isAllDay,
          start_at:    isAllDay ? null : ev.start?.dateTime,
          end_at:      isAllDay ? null : ev.end?.dateTime,
          start_date:  isAllDay ? ev.start?.date : null,
          end_date:    isAllDay ? ev.end?.date   : null,
          updated_at:  new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[CalPoller] Skipping "${cal.summary}": ${err.message}`);
    }
  }

  if (allEvents.length) {
    await sbUpsert('calendar_events', allEvents);
    await sbDeleteStaleEvents(seenIds);
  }

  // Seed visible_calendars config on first run
  try {
    const existing = await sbSelect('config', { key: 'eq.visible_calendars', select: 'value' });
    if (!existing.length) {
      const initial = calendars.map((cal) => ({
        id: cal.id, name: cal.summary, color: cal.backgroundColor || '#4285f4', visible: true,
      }));
      await sbUpsert('config', [{ key: 'visible_calendars', value: initial, updated_at: new Date().toISOString() }]);
      console.log(`[CalPoller] Initialized visible_calendars with ${initial.length} calendars.`);
    }
  } catch (err) {
    console.warn('[CalPoller] Config seed error:', err.message);
  }

  console.log(`[CalPoller] Synced ${allEvents.length} events from ${calendars.length} calendars.`);
}
