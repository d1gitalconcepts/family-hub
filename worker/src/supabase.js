// Supabase REST client for Cloudflare Worker
// Uses email/password auth (anon key + RLS) — same pattern as supabase-ext.js

let _jwt       = null;
let _jwtExpiry = 0;

async function ensureAuth(env) {
  if (_jwt && Date.now() < _jwtExpiry - 60000) return;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method:  'POST',
    headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SUPABASE_EMAIL, password: env.SUPABASE_PASSWORD }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Supabase auth failed: ${data.error_description || data.error}`);

  _jwt       = data.access_token;
  _jwtExpiry = Date.now() + data.expires_in * 1000;
}

function hdrs(env, extra = {}) {
  return {
    'apikey':        env.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${_jwt}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

export async function sbUpsert(env, table, rows) {
  await ensureAuth(env);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: hdrs(env, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body:    JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`[Supabase] upsert ${table}: ${await res.text()}`);
}

export async function sbSelect(env, table, params = {}) {
  await ensureAuth(env);
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: hdrs(env) });
  if (!res.ok) throw new Error(`[Supabase] select ${table}: ${res.status}`);
  return res.json();
}

export async function sbUpdate(env, table, filter, data) {
  await ensureAuth(env);
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(filter)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method:  'PATCH',
    headers: hdrs(env, { 'Prefer': 'return=minimal' }),
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`[Supabase] update ${table}: ${res.status}`);
}

export async function sbDeleteStaleEvents(env, seenIds) {
  if (!seenIds.length) return;
  await ensureAuth(env);

  const windowMin = new Date();
  windowMin.setDate(windowMin.getDate() - windowMin.getDay() - 1); // last Saturday
  windowMin.setHours(0, 0, 0, 0);
  const minIso  = windowMin.toISOString();
  const minDate = minIso.split('T')[0];

  const existing = await sbSelect(env, 'calendar_events', {
    select: 'google_id',
    or:     `(start_at.gte.${minIso},start_date.gte.${minDate})`,
  });

  const seenSet  = new Set(seenIds);
  const staleIds = (existing || []).map((r) => r.google_id).filter((id) => !seenSet.has(id));
  if (!staleIds.length) return;

  const url = new URL(`${env.SUPABASE_URL}/rest/v1/calendar_events`);
  url.searchParams.set('google_id', `in.(${staleIds.map((id) => `"${id}"`).join(',')})`);
  const res = await fetch(url.toString(), {
    method:  'DELETE',
    headers: hdrs(env, { 'Prefer': 'return=minimal' }),
  });
  if (!res.ok) console.warn('[Supabase] deleteStale:', await res.text());
  else         console.log(`[Supabase] Deleted ${staleIds.length} stale event(s).`);
}

export async function getConfigValue(env, key) {
  const rows = await sbSelect(env, 'config', { key: `eq.${key}`, select: 'value' });
  return rows?.[0]?.value ?? null;
}

export async function setConfigValue(env, key, value) {
  await sbUpsert(env, 'config', [{ key, value, updated_at: new Date().toISOString() }]);
}
