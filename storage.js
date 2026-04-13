// Family Hub - Storage helpers (ES module)
// Shared by background.js and popup.js

const KEYS = {
  NOTES:      'familyhub_notes',
  LAST_SYNC:  'familyhub_lastSync',
  SYNC_COUNT: 'familyhub_syncCount',
  ERRORS:     'familyhub_errors',
  ENDPOINT:   'familyhub_localEndpoint',
};

export { KEYS };

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function readNotes() {
  const result = await chrome.storage.local.get(KEYS.NOTES);
  return result[KEYS.NOTES] ?? [];
}

export async function writeNotes(notes, timestamp) {
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

export async function readLastSync() {
  const result = await chrome.storage.local.get(KEYS.LAST_SYNC);
  return result[KEYS.LAST_SYNC] ?? null;
}

export async function readSyncCount() {
  const result = await chrome.storage.local.get(KEYS.SYNC_COUNT);
  return result[KEYS.SYNC_COUNT] ?? 0;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export async function readErrors() {
  const result = await chrome.storage.local.get(KEYS.ERRORS);
  return result[KEYS.ERRORS] ?? [];
}

export async function appendError(message) {
  const existing = await readErrors();
  const updated = [
    { message, timestamp: new Date().toISOString() },
    ...existing,
  ].slice(0, 10); // keep last 10
  await chrome.storage.local.set({ [KEYS.ERRORS]: updated });
}

// ---------------------------------------------------------------------------
// Endpoint (localhost HTTP bridge)
// ---------------------------------------------------------------------------

export async function readEndpoint() {
  const result = await chrome.storage.local.get(KEYS.ENDPOINT);
  return result[KEYS.ENDPOINT] ?? null;
}

export async function writeEndpoint(url) {
  await chrome.storage.local.set({ [KEYS.ENDPOINT]: url });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
