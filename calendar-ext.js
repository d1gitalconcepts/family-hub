// Family Hub - Google Calendar sync (Meal Planning) + all-calendar poller
// Depends on: google-api.js, supabase-ext.js, storage.js

const CAL_BASE      = 'https://www.googleapis.com/calendar/v3';
const MEAL_CAL_NAME = 'Meal Planning';
const DAY_NAMES     = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Meal Planning calendar sync ──────────────────────────────────────────────

async function syncMealCalendar(lines) {
  if (lines[lines.length - 1] === '…') {
    console.log('[Calendar] Skipping — note is truncated. Open the note in Keep to sync fully.');
    return;
  }

  const calendarId = await getOrCreateMealCalendar();
  const meals = parseMeals(lines);

  if (!Object.keys(meals).length) {
    console.log('[Calendar] No meals parsed.');
    return;
  }

  const dates = Object.values(meals).map((m) => m.date);
  await deleteEventsOnDates(calendarId, dates);

  for (const [, { date, meal, url }] of Object.entries(meals)) {
    if (!meal) continue;
    await googlePost(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      { summary: `Dinner: ${meal}`, description: url || undefined, start: { date }, end: { date } }
    );
    console.log(`[Calendar] Created ${date}: ${meal}`);
  }
}

async function getOrCreateMealCalendar() {
  const ids = await getGoogleIds();
  if (ids.mealPlanningCalendarId) return ids.mealPlanningCalendarId;

  const res      = await googleGet(`${CAL_BASE}/users/me/calendarList`);
  const existing = (res.items || []).find((c) => c.summary === MEAL_CAL_NAME);

  if (existing) {
    await saveGoogleId('mealPlanningCalendarId', existing.id);
    return existing.id;
  }

  const created = await googlePost(`${CAL_BASE}/calendars`, { summary: MEAL_CAL_NAME });
  console.log(`[Calendar] Created calendar "${MEAL_CAL_NAME}".`);
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
