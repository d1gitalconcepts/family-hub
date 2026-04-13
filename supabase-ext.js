// Family Hub - Supabase REST client for Firefox extension
// Uses raw fetch() — no npm package. All requests use the service role key.

function sbHeaders(extra = {}) {
  return {
    'apikey':        CONFIG.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

async function sbUpsert(table, rows) {
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
  const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`[Supabase] select ${table}: ${res.status}`);
  return res.json();
}

async function sbUpdate(table, filter, data) {
  const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(filter)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method:  'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`[Supabase] update ${table}: ${res.status}`);
}

// Delete stale calendar_events: fetch IDs in the poll window, remove ones
// not in seenIds. This is scoped to the window so past events aren't touched.
async function sbDeleteStaleEvents(seenIds) {
  if (!seenIds.length) return;

  const windowMin = new Date();
  windowMin.setDate(windowMin.getDate() - 1);
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
