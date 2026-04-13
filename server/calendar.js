// Family Hub - Google Calendar sync
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CALENDAR_NAME = 'Meal Planning';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const IDS_FILE = path.join(__dirname, '.ids.json');

async function syncCalendar(authClient, lines) {
  const service = google.calendar({ version: 'v3', auth: authClient });

  const calendarId = await getOrCreateCalendar(service);
  const meals = parseMeals(lines);

  if (Object.keys(meals).length === 0) {
    console.log('[Calendar] No meals parsed from note.');
    return;
  }

  // Delete existing events on each day that appears in the note
  const dates = Object.values(meals).map((m) => m.date);
  await deleteEventsOnDates(service, calendarId, dates);

  // Create new events
  for (const [day, { date, meal }] of Object.entries(meals)) {
    if (!meal) continue; // day listed but no meal
    await service.events.insert({
      calendarId,
      requestBody: {
        summary: `Dinner: ${meal}`,
        start: { date },
        end:   { date },
      },
    });
    console.log(`[Calendar] Created event on ${date}: ${meal}`);
  }
}

// ---------------------------------------------------------------------------
// Calendar lookup — store the ID on disk after first find/create so we never
// search by name again (prevents duplicate calendar creation on rapid syncs)
// ---------------------------------------------------------------------------

function readIds() {
  if (fs.existsSync(IDS_FILE)) return JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
  return {};
}

function saveId(key, id) {
  const ids = readIds();
  ids[key] = id;
  fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
}

async function getOrCreateCalendar(service) {
  const ids = readIds();
  if (ids.mealPlanningCalendarId) return ids.mealPlanningCalendarId;

  const res = await service.calendarList.list();
  const calendars = res.data.items || [];
  const existing = calendars.find((c) => c.summary === CALENDAR_NAME);

  if (existing) {
    saveId('mealPlanningCalendarId', existing.id);
    return existing.id;
  }

  const created = await service.calendars.insert({ requestBody: { summary: CALENDAR_NAME } });
  console.log(`[Calendar] Created calendar "${CALENDAR_NAME}".`);
  saveId('mealPlanningCalendarId', created.data.id);
  return created.data.id;
}

// ---------------------------------------------------------------------------
// Meal parser
// ---------------------------------------------------------------------------

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
      if (mealText && !mealText.startsWith('http')) {
        meals[currentDay].meal = mealText;
      }
    }
  }

  return meals;
}

function getWeekDates() {
  const today = new Date();
  const dow = today.getDay();
  const daysToSaturday = dow === 6 ? 0 : dow + 1;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() - daysToSaturday);
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

// ---------------------------------------------------------------------------
// Event cleanup
// ---------------------------------------------------------------------------

async function deleteEventsOnDates(service, calendarId, dates) {
  for (const date of dates) {
    const res = await service.events.list({
      calendarId,
      timeMin: `${date}T00:00:00Z`,
      timeMax: `${date}T23:59:59Z`,
      singleEvents: true,
    });
    const events = res.data.items || [];
    await Promise.all(events.map((e) => service.events.delete({ calendarId, eventId: e.id })));
  }
}

module.exports = { syncCalendar };
