// Family Hub - Supabase REST client for Firefox extension
// Uses anon key + email/password sign-in to get a JWT.
// The service role key cannot be used from a browser context.

let _jwt       = null;
let _jwtExpiry = 0;

async function supabaseEnsureAuth() {
  if (_jwt && Date.now() < _jwtExpiry - 60000) return; // still valid

  const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method:  'POST',
    headers: {
      'apikey':       CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email:    CONFIG.SUPABASE_EMAIL,
      password: CONFIG.SUPABASE_PASSWORD,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`[Supabase] Sign-in failed: ${data.error_description || data.error || res.status}`);
  }
  _jwt       = data.access_token;
  _jwtExpiry = Date.now() + data.expires_in * 1000;
}

function sbHeaders(extra = {}) {
  return {
    'apikey':        CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${_jwt}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

async function sbUpsert(table, rows) {
  await supabaseEnsureAuth();
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body:    JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Supabase] upsert ${table}: ${err}`);
  }
}

async function sbSelect(table, params = {}) {
  await supabaseEnsureAuth();
  const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`[Supabase] select ${table}: ${res.status}`);
  return res.json();
}

async function sbUpdate(table, filter, data) {
  await supabaseEnsureAuth();
  const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(filter)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method:  'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`[Supabase] update ${table}: ${res.status}`);
}

async function sbDeleteStaleEvents(seenIds) {
  if (!seenIds.length) return;
  await supabaseEnsureAuth();

  const windowMin = new Date();
  windowMin.setDate(windowMin.getDate() - windowMin.getDay()); // this Sunday
  windowMin.setHours(0, 0, 0, 0);
  const minIso  = windowMin.toISOString();
  const minDate = minIso.split('T')[0];

  const existing = await sbSelect('calendar_events', {
    select: 'google_id',
    or:     `(start_at.gte.${minIso},start_date.gte.${minDate})`,
  });

  const seenSet  = new Set(seenIds);
  const staleIds = (existing || []).map((r) => r.google_id).filter((id) => !seenSet.has(id));
  if (!staleIds.length) return;

  const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/calendar_events`);
  url.searchParams.set('google_id', `in.(${staleIds.map((id) => `"${id}"`).join(',')})`);
  const res = await fetch(url.toString(), {
    method:  'DELETE',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
  });
  if (!res.ok) console.warn('[Supabase] deleteStale:', await res.text());
  else console.log(`[Supabase] Deleted ${staleIds.length} stale event(s).`);
}
