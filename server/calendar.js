// Family Hub - Google Calendar sync
const { google } = require('googleapis');

const CALENDAR_NAME = 'Meal Planning';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

// Parse lines like:
//   "Monday: Amelia Dance"  → day header
//   "- Crock pot chicken"   → meal for the previous day
function parseMeals(lines) {
  const weekDates = getWeekDates();
  const meals = {};
  let currentDay = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if line starts with a day name followed by a colon
    const dayMatch = DAY_NAMES.find((d) => trimmed.startsWith(d + ':'));
    if (dayMatch && weekDates[dayMatch]) {
      currentDay = dayMatch;
      meals[currentDay] = { date: weekDates[dayMatch], meal: null };
      continue;
    }

    // Check if line is a meal bullet under the current day
    if (currentDay && trimmed.startsWith('- ')) {
      const mealText = trimmed.slice(2).trim();
      // Skip URLs and empty bullets
      if (mealText && !mealText.startsWith('http')) {
        meals[currentDay].meal = mealText;
      }
    }
  }

  return meals;
}

// Returns a map of day name → YYYY-MM-DD for the current week.
// Week is anchored to the most recent Saturday since meal plans start Saturday.
function getWeekDates() {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun, 6=Sat
  const daysToSaturday = dow === 6 ? 0 : dow + 1;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() - daysToSaturday);
  saturday.setHours(0, 0, 0, 0);

  // Sat=0, Sun=1, Mon=2 ... Fri=6
  const order = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const result = {};
  order.forEach((name, i) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    result[name] = d.toISOString().split('T')[0];
  });
  return result;
}

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

async function getOrCreateCalendar(service) {
  const res = await service.calendarList.list();
  const calendars = res.data.items || [];
  const existing = calendars.find((c) => c.summary === CALENDAR_NAME);
  if (existing) return existing.id;

  const created = await service.calendars.insert({ requestBody: { summary: CALENDAR_NAME } });
  console.log(`[Calendar] Created calendar "${CALENDAR_NAME}".`);
  return created.data.id;
}

module.exports = { syncCalendar };
