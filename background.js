// Family Hub - Background Script (consolidated, no local server)
// All syncing happens directly from the extension to Google APIs + Supabase.
// Script load order (from manifest): config → storage → google-auth → google-api
//                                    → supabase-ext → tasks-ext → calendar-ext → this

// ---------------------------------------------------------------------------
// Sync throttle — debounce 30s after last scrape before hitting Google APIs
// ---------------------------------------------------------------------------

let syncTimer = null;

function scheduleSyncAndUpload(notes) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync(notes), 30000);
}

async function runSync(notes) {
  if (!(await isAuthenticated())) {
    console.log('[Sync] Skipping — not authenticated with Google.');
    return;
  }

  const shopping = notes.find((n) => n.title === 'Shopping List');
  const meals    = notes.find((n) => n.title === 'Meal Planning');

  if (shopping?.items) {
    try { await syncTasks(shopping.items); }
    catch (err) { console.warn('[Sync] Tasks error:', err.message); }
  }

  if (meals?.lines) {
    try { await syncMealCalendar(meals.lines); }
    catch (err) { console.warn('[Sync] Calendar error:', err.message); }
  }

  // Mirror raw note data to Supabase for the hub
  const now = new Date().toISOString();
  if (shopping) {
    try { await sbUpsert('notes', [{ key: 'shopping-list', data: shopping, scraped_at: now, updated_at: now }]); }
    catch (err) { console.warn('[Sync] Supabase notes error:', err.message); }
  }
  if (meals) {
    try { await sbUpsert('notes', [{ key: 'meal-planning', data: meals, scraped_at: now, updated_at: now }]); }
    catch (err) { console.warn('[Sync] Supabase meals error:', err.message); }
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'NOTES_SCRAPED') {
    handleNotesScrape(message.data, message.timestamp)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'SCRAPE_ERROR') {
    appendError(message.error).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'LAUNCH_OAUTH') {
    launchOAuthFlow()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'REVOKE_AUTH') {
    revokeAuth()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_AUTH_STATUS') {
    isAuthenticated()
      .then((authenticated) => sendResponse({ authenticated }))
      .catch(() => sendResponse({ authenticated: false }));
    return true;
  }
});

// ---------------------------------------------------------------------------
// Core: persist notes if changed, then schedule sync
// ---------------------------------------------------------------------------

async function handleNotesScrape(notes, timestamp) {
  const written = await writeNotes(notes, timestamp);
  if (!written) return;
  scheduleSyncAndUpload(notes);
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

chrome.alarms.create('keepalive',      { periodInMinutes: 1   });
chrome.alarms.create('pollCalendars',  { periodInMinutes: 5   });
chrome.alarms.create('pollTaskLists',  { periodInMinutes: 5   });
chrome.alarms.create('pendingUpdates', { periodInMinutes: 0.5 }); // ~30s

async function runCalendarSync() {
  await pollAllCalendars();
  const now = new Date().toISOString();
  await sbUpsert('config', [{ key: 'last_calendar_sync', value: now, updated_at: now }]);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollCalendars') {
    runCalendarSync().catch((err) => console.warn('[Poller] Error:', err.message));
  }
  if (alarm.name === 'pollTaskLists') {
    pollAllTaskLists().catch((err) => console.warn('[TaskPoller] Error:', err.message));
  }
  if (alarm.name === 'pendingUpdates') {
    applyPendingUpdates().catch((err) => console.warn('[PendingUpdates] Error:', err.message));
    // Check if hub requested an immediate sync
    checkSyncRequest().catch((err) => console.warn('[SyncRequest] Error:', err.message));
  }
  // keepalive: no-op
});

async function checkSyncRequest() {
  if (!(await isAuthenticated())) return;
  const rows = await sbSelect('config', { key: 'eq.sync_requested', select: 'value' });
  if (rows?.[0]?.value !== 'true') return;
  // Clear the flag first to avoid double-firing
  await sbUpsert('config', [{ key: 'sync_requested', value: 'false', updated_at: new Date().toISOString() }]);
  console.log('[SyncRequest] Manual sync triggered from hub');
  await runCalendarSync();
  await pollAllTaskLists();
}
