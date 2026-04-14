import { pollAllCalendars, syncMealCalendar } from './calendar.js';
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
    // Shopping list is now read directly from Keep (notes table).
    // Google Tasks is no longer involved in the shopping list flow.
    const notes   = await sbSelect(env, 'notes', { key: 'in.(meal-planning)', select: 'key,data' });
    const mealNote = notes.find((n) => n.key === 'meal-planning');

    // 1. Sync meal planning note → Google Calendar
    if (mealNote?.data?.lines?.length) {
      await syncMealCalendar(env, mealNote.data.lines);
    }

    // 2. Poll all calendars → Supabase
    await pollAllCalendars(env);

    // 3. Poll weather station
    await pollWeather(env);

    // 4. Write last sync timestamp for the hub's sync button
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
