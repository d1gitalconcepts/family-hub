// Family Hub - Storage helpers
// Shared by background.js and popup.js as a plain global script.

const KEYS = {
  NOTES:      'familyhub_notes',
  LAST_SYNC:  'familyhub_lastSync',
  SYNC_COUNT: 'familyhub_syncCount',
  ERRORS:     'familyhub_errors',
};

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

async function readNotes() {
  const result = await chrome.storage.local.get(KEYS.NOTES);
  return result[KEYS.NOTES] ?? [];
}

async function writeNotes(notes, timestamp) {
  const existing = await chrome.storage.local.get([KEYS.NOTES, KEYS.SYNC_COUNT]);
  const existingJson = JSON.stringify(existing[KEYS.NOTES] ?? []);
  const incomingJson = JSON.stringify(notes);

  if (existingJson === incomingJson) return false; // no change

  await chrome.storage.local.set({
    [KEYS.NOTES]:      notes,
    [KEYS.LAST_SYNC]:  timestamp,
    [KEYS.SYNC_COUNT]: (existing[KEYS.SYNC_COUNT] ?? 0) + 1,
  });

  return true; // written
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

async function readLastSync() {
  const result = await chrome.storage.local.get(KEYS.LAST_SYNC);
  return result[KEYS.LAST_SYNC] ?? null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

async function readErrors() {
  const result = await chrome.storage.local.get(KEYS.ERRORS);
  return result[KEYS.ERRORS] ?? [];
}

async function appendError(message) {
  const existing = await readErrors();
  const updated = [
    { message, timestamp: new Date().toISOString() },
    ...existing,
  ].slice(0, 10);
  await chrome.storage.local.set({ [KEYS.ERRORS]: updated });
}

// ---------------------------------------------------------------------------
// Google resource ID cache (task list, calendars)
// Replaces the server's .ids.json file.
// ---------------------------------------------------------------------------

async function getGoogleIds() {
  const result = await chrome.storage.local.get('googleIds');
  return result.googleIds || {};
}

async function saveGoogleId(key, id) {
  const ids = await getGoogleIds();
  ids[key] = id;
  await chrome.storage.local.set({ googleIds: ids });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
