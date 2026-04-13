// Family Hub - Google Calendar Poller
// Runs on a 5-minute interval, fetches all calendar events for a rolling
// 3-week window, and upserts them into Supabase.

const { google } = require('googleapis');
const { upsertEvents, deleteStaleEvents, getConfig, setConfig } = require('./supabase');
const { getAuthClient } = require('./auth');

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Fetch window: yesterday through 14 days from now
function getWindow() {
  const min = new Date();
  min.setDate(min.getDate() - 1);
  min.setHours(0, 0, 0, 0);

  const max = new Date();
  max.setDate(max.getDate() + 14);
  max.setHours(23, 59, 59, 999);

  return { min: min.toISOString(), max: max.toISOString() };
}

async function pollCalendars() {
  const auth = await getAuthClient();
  if (!auth) {
    console.log('[Poller] Skipping — not authenticated.');
    return;
  }

  const service = google.calendar({ version: 'v3', auth });
  const { min, max } = getWindow();

  // List all calendars the user has access to
  const calListRes = await service.calendarList.list();
  const calendars = calListRes.data.items || [];

  // Seed visible_calendars config on first run (all visible by default)
  const existingConfig = await getConfig('visible_calendars');
  if (!existingConfig) {
    const initial = calendars.map((cal) => ({
      id: cal.id,
      name: cal.summary,
      color: cal.backgroundColor || '#4285f4',
      visible: true,
    }));
    await setConfig('visible_calendars', initial);
    console.log(`[Poller] Initialized visible_calendars config with ${initial.length} calendars.`);
  }

  const allEvents = [];
  const seenIds = [];

  for (const cal of calendars) {
    try {
      const eventsRes = await service.events.list({
        calendarId: cal.id,
        timeMin: min,
        timeMax: max,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      });

      const events = eventsRes.data.items || [];

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
          end_date:    isAllDay ? ev.end?.date : null,
          updated_at:  new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[Poller] Skipping calendar "${cal.summary}": ${err.message}`);
    }
  }

  if (allEvents.length) {
    await upsertEvents(allEvents);
  }

  console.log(`[Poller] Synced ${allEvents.length} events from ${calendars.length} calendars.`);
}

function startPoller() {
  // Run immediately on startup, then every 5 minutes
  pollCalendars().catch((err) => console.error('[Poller] Error:', err.message));
  setInterval(() => {
    pollCalendars().catch((err) => console.error('[Poller] Error:', err.message));
  }, POLL_INTERVAL_MS);
}

module.exports = { startPoller };
