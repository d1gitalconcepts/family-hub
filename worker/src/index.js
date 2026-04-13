import { pollAllCalendars, syncMealCalendar } from './calendar.js';
import { pollAllTaskLists, syncTasksFromNote, applyPendingUpdates } from './tasks.js';
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
    // 1. Sync shopping list note → Google Tasks
    const shoppingNote = await sbSelect(env, 'notes', { key: 'eq.shopping-list', select: 'data' });
    if (shoppingNote?.[0]?.data?.items?.length) {
      await syncTasksFromNote(env, shoppingNote[0].data.items);
    }

    // 2. Sync meal planning note → Google Calendar
    const mealNote = await sbSelect(env, 'notes', { key: 'eq.meal-planning', select: 'data' });
    if (mealNote?.[0]?.data?.lines?.length) {
      await syncMealCalendar(env, mealNote[0].data.lines);
    }

    // 3. Poll all calendars → Supabase
    await pollAllCalendars(env);

    // 4. Poll all task lists → Supabase
    await pollAllTaskLists(env);

    // 5. Apply any pending checkbox updates
    await applyPendingUpdates(env);

    // 6. Write last sync timestamp for the hub's sync button
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
