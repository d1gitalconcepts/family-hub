import { pollAllCalendars, syncMealCalendar } from './calendar.js';
import { pollAllTaskLists, syncTasksFromNote, applyPendingUpdates } from './tasks.js';
import { pollWeather } from './weather.js';
import { sbSelect, sbUpsert } from './supabase.js';

export default {
  // Cron trigger — runs every 5 minutes
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runFullSync(env));
  },

  // HTTP handler — POST /sync for on-demand trigger from the hub
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === 'POST' && url.pathname === '/sync') {
      ctx.waitUntil(runFullSync(env));
      return new Response(JSON.stringify({ ok: true, message: 'Sync started' }), {
        status:  200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

async function runFullSync(env) {
  console.log('[Worker] Starting full sync...');
  try {
    // Fetch both notes in a single Supabase call
    const notes       = await sbSelect(env, 'notes', { key: 'in.(shopping-list,meal-planning)', select: 'key,data' });
    const shoppingNote = notes.find((n) => n.key === 'shopping-list');
    const mealNote     = notes.find((n) => n.key === 'meal-planning');

    // 1. (Keep → Google Tasks item sync disabled — handled by write-back + pending_updates)

    // 2. Sync meal planning note → Google Calendar
    if (mealNote?.data?.lines?.length) {
      await syncMealCalendar(env, mealNote.data.lines);
    }

    // 3. Poll all calendars → Supabase
    await pollAllCalendars(env);

    // 4. Apply any pending checkbox updates first so the poll below captures
    //    the fully-applied state rather than a pre-update snapshot
    await applyPendingUpdates(env);

    // 5. Poll all task lists → Supabase (after pending updates are applied)
    await pollAllTaskLists(env);

    // 6. Poll weather station
    await pollWeather(env);

    // 7. Write last sync timestamp for the hub's sync button
    const now = new Date().toISOString();
    await sbUpsert(env, 'config', [{ key: 'last_calendar_sync', value: now, updated_at: now }]);

    console.log('[Worker] Full sync complete.');
  } catch (err) {
    console.error('[Worker] Sync error:', err.stack || err.message);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
