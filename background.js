// Family Hub - Background Script
// Extension responsibility: scrape Google Keep → write raw notes to Supabase.
// All Google API calls (Calendar, Tasks) are handled by the Cloudflare Worker.

let syncTimer = null;

// Debounce 30s after last scrape before writing to Supabase
function scheduleSyncAndUpload(notes) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => uploadNotes(notes), 30000);
}

async function uploadNotes(notes) {
  const shopping = notes.find((n) => n.title === 'Shopping List');
  const meals    = notes.find((n) => n.title === 'Meal Planning');
  const now      = new Date().toISOString();

  if (shopping) {
    try {
      await sbUpsert('notes', [{ key: 'shopping-list', data: shopping, scraped_at: now, updated_at: now }]);
    } catch (err) {
      console.warn('[Sync] Failed to upload shopping list:', err.message);
    }
  }

  if (meals) {
    try {
      await sbUpsert('notes', [{ key: 'meal-planning', data: meals, scraped_at: now, updated_at: now }]);
    } catch (err) {
      console.warn('[Sync] Failed to upload meal planning:', err.message);
    }
  }

  console.log('[Sync] Notes uploaded to Supabase.');
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
});

// ---------------------------------------------------------------------------
// Core: persist notes if changed, then schedule upload
// ---------------------------------------------------------------------------

async function handleNotesScrape(notes, timestamp) {
  const written = await writeNotes(notes, timestamp);
  if (!written) return; // no change, skip upload
  scheduleSyncAndUpload(notes);
}

// ---------------------------------------------------------------------------
// Alarms — keepalive only; all polling is done by the Cloudflare Worker
// ---------------------------------------------------------------------------

chrome.alarms.create('keepalive', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  // keepalive: no-op, just keeps the service worker alive
});
