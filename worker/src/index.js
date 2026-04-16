import { pollAllCalendars, syncMealCalendar } from './calendar.js';
import { pollWeather } from './weather.js';
import { sbSelect, sbUpsert } from './supabase.js';
import { enrichSportsEvents } from './sports.js';

export default {
  // Two cron triggers, each gets its own invocation and subrequest budget:
  //   "*/5 * * * *"      → calendar + weather sync
  //   "2-59/5 * * * *"   → sports enrichment only (fires 2 min after, events already synced)
  async scheduled(event, env, ctx) {
    if (event.cron === '2-59/5 * * * *') {
      ctx.waitUntil(enrichSportsEvents(env));
    } else {
      ctx.waitUntil(runFullSync(env));
    }
  },

  // HTTP handler — POST /sync for on-demand trigger from the hub
  // Sports enrichment intentionally excluded — it uses too many subrequests
  // when combined with calendar sync on the free plan.
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

    if (request.method === 'POST' && url.pathname === '/sync-sports') {
      ctx.waitUntil(enrichSportsEvents(env));
      return new Response(JSON.stringify({ ok: true, message: 'Sports enrichment started' }), {
        status:  200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    if (request.method === 'GET' && url.pathname === '/og-img') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return new Response('Missing url', { status: 400 });
      try {
        const res = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FamilyHub/1.0)' },
        });
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        return new Response(res.body, {
          status: res.status,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch {
        return new Response('Failed to fetch image', { status: 502 });
      }
    }

    if (request.method === 'GET' && url.pathname === '/og') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return new Response(JSON.stringify({ image: null }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
      try {
        const res = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FamilyHub/1.0)' },
        });
        const html = await res.text();

        // Try og:image (handles both attribute orderings)
        const ogImg =
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];

        let image = ogImg || null;

        // Fallback: first image from JSON-LD recipe schema
        if (!image) {
          const ldMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
          if (ldMatch) {
            try {
              const ld = JSON.parse(ldMatch[1]);
              const imgs = ld.image;
              if (typeof imgs === 'string') image = imgs;
              else if (Array.isArray(imgs)) image = imgs[0]?.url || imgs[0];
              else if (imgs?.url) image = imgs.url;
            } catch {}
          }
        }

        // Proxy the image through the worker to avoid hotlink protection
        const proxyImage = image
          ? `${new URL(request.url).origin}/og-img?url=${encodeURIComponent(image)}`
          : null;

        return new Response(JSON.stringify({ image: proxyImage }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=86400',
            ...corsHeaders(),
          },
        });
      } catch {
        return new Response(JSON.stringify({ image: null }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};

async function runFullSync(env) {
  console.log('[Worker] Starting full sync...');
  try {
    // Read meal plan config
    const mpConfigRes = await sbSelect(env, 'config', { key: 'eq.meal_plan', select: 'value' });
    const mealPlanConfig = mpConfigRes?.[0]?.value || {};
    const mealNoteKey = mealPlanConfig.noteKey || 'meal-planning';

    const notes    = await sbSelect(env, 'notes', { key: `in.(${mealNoteKey})`, select: 'key,data' });
    const mealNote = notes.find((n) => n.key === mealNoteKey);

    // 1. Sync meal planning note → Google Calendar
    if (mealNote?.data?.lines?.length) {
      await syncMealCalendar(env, mealNote.data.lines, mealPlanConfig);
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
