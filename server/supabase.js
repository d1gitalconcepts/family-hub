// Family Hub - Supabase client (server-side, service role)
// Uses the service role key so all writes bypass RLS.

const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getClient() {
  if (!_client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    }
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

async function upsertEvents(events) {
  if (!events.length) return;
  const { error } = await getClient()
    .from('calendar_events')
    .upsert(events, { onConflict: 'google_id' });
  if (error) throw new Error(`[Supabase] upsertEvents: ${error.message}`);
}

async function deleteStaleEvents(validGoogleIds) {
  // Remove events that no longer exist in Google Calendar
  if (!validGoogleIds.length) return;
  const { error } = await getClient()
    .from('calendar_events')
    .delete()
    .not('google_id', 'in', `(${validGoogleIds.map((id) => `"${id}"`).join(',')})`);
  if (error) console.warn('[Supabase] deleteStaleEvents:', error.message);
}

// ---------------------------------------------------------------------------
// Notes (Keep data)
// ---------------------------------------------------------------------------

async function upsertNote(key, data, scrapedAt) {
  const { error } = await getClient()
    .from('notes')
    .upsert({ key, data, scraped_at: scrapedAt, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`[Supabase] upsertNote: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Task lists
// ---------------------------------------------------------------------------

async function upsertTaskList(listId, listName, items) {
  const { error } = await getClient()
    .from('task_lists')
    .upsert({ list_id: listId, list_name: listName, items, updated_at: new Date().toISOString() }, { onConflict: 'list_id' });
  if (error) throw new Error(`[Supabase] upsertTaskList: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Pending updates (hub → Google Tasks write-back)
// ---------------------------------------------------------------------------

async function getPendingUpdates() {
  const { data, error } = await getClient()
    .from('pending_updates')
    .select('*')
    .is('applied_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`[Supabase] getPendingUpdates: ${error.message}`);
  return data || [];
}

async function markUpdateApplied(id) {
  const { error } = await getClient()
    .from('pending_updates')
    .update({ applied_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.warn('[Supabase] markUpdateApplied:', error.message);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

async function getConfig(key) {
  const { data, error } = await getClient()
    .from('config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getConfig: ${error.message}`);
  return data?.value ?? null;
}

async function setConfig(key, value) {
  const { error } = await getClient()
    .from('config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`[Supabase] setConfig: ${error.message}`);
}

module.exports = { upsertEvents, deleteStaleEvents, upsertNote, upsertTaskList, getPendingUpdates, markUpdateApplied, getConfig, setConfig };
