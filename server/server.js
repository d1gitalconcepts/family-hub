// Family Hub - Local Sync Server
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const open = require('open');
const { getAuthClient, getAuthUrl, handleCallback } = require('./auth');
const { syncTasks } = require('./tasks');
const { syncCalendar } = require('./calendar');
const { startPoller } = require('./calendarPoller');
const { upsertNote, upsertTaskList, getPendingUpdates, markUpdateApplied } = require('./supabase');

const PORT = process.env.PORT || 3747;
const CACHE_FILE = path.join(__dirname, '.cache.json');
const GOOGLE_SYNC_COOLDOWN_MS = 30_000;
const PENDING_UPDATE_INTERVAL_MS = 30_000;

let lastGoogleSync = 0;
let pendingSyncTimer = null;

const app = express();
app.use(express.json());

// Allow any local origin to call the API (for the Family Hub frontend)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function readCache() {
  if (fs.existsSync(CACHE_FILE)) {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  }
  return null;
}

function writeCache(notes, timestamp) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ notes, timestamp, syncedAt: new Date().toISOString() }, null, 2));
}

// ---------------------------------------------------------------------------
// POST /notes — receives scraped data from the browser extension
// ---------------------------------------------------------------------------

app.post('/notes', async (req, res) => {
  const { notes, timestamp } = req.body;
  if (!notes || !Array.isArray(notes)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  writeCache(notes, timestamp);

  const auth = await getAuthClient();
  if (!auth) {
    return res.status(202).json({ cached: true, synced: false, reason: 'Not authenticated. Visit http://localhost:' + PORT + '/auth' });
  }

  clearTimeout(pendingSyncTimer);
  const now = Date.now();
  const delay = Math.max(0, GOOGLE_SYNC_COOLDOWN_MS - (now - lastGoogleSync));

  pendingSyncTimer = setTimeout(async () => {
    lastGoogleSync = Date.now();
    const cached = readCache();
    if (!cached) return;
    try {
      for (const note of cached.notes) {
        if (note.id === 'shopping-list' && note.type === 'checklist') {
          await syncTasks(auth, note.items);
          // Write to Supabase after syncing to Google Tasks
          await syncSupabaseAfterTaskSync(note);
        }
        if (note.id === 'meal-planning' && note.type === 'text') {
          await syncCalendar(auth, note.lines);
        }
        // Write all notes to Supabase
        await upsertNote(note.id, note, note.scrapedAt).catch((e) =>
          console.warn('[Supabase] Note upsert failed:', e.message)
        );
      }
      console.log('[Server] Google sync complete.');
    } catch (err) {
      console.error('[Server] Sync error:', err.message);
    }
  }, delay);

  res.json({ ok: true, queued: true, syncInMs: delay });
});

// Write task list to Supabase with google task IDs included
async function syncSupabaseAfterTaskSync(note) {
  const ids = require('./supabase').getClient ? null : null; // ids stored in .ids.json
  const idsFile = path.join(__dirname, '.ids.json');
  let listId = null;
  if (fs.existsSync(idsFile)) {
    const ids = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
    listId = ids.shoppingListId || null;
  }
  await upsertTaskList(
    listId || 'shopping-list',
    'Shopping List',
    note.items
  ).catch((e) => console.warn('[Supabase] TaskList upsert failed:', e.message));
}

// ---------------------------------------------------------------------------
// GET /notes — return last known notes
// ---------------------------------------------------------------------------

app.get('/notes', (req, res) => {
  const cache = readCache();
  if (!cache) return res.status(404).json({ error: 'No data yet. Open Google Keep to start.' });
  res.json(cache);
});

// ---------------------------------------------------------------------------
// GET /status — health check
// ---------------------------------------------------------------------------

app.get('/status', async (req, res) => {
  const cache = readCache();
  const auth = await getAuthClient();
  res.json({
    authenticated: !!auth,
    lastSync: cache?.syncedAt ?? null,
    noteCount: cache?.notes?.length ?? 0,
    authUrl: auth ? null : `http://localhost:${PORT}/auth`,
  });
});

// ---------------------------------------------------------------------------
// GET /auth — start OAuth flow
// ---------------------------------------------------------------------------

app.get('/auth', (req, res) => {
  const url = getAuthUrl();
  res.send(`<p>Opening Google authorization in your browser...</p><p><a href="${url}">Click here if it didn't open</a></p>`);
  open(url);
});

// ---------------------------------------------------------------------------
// GET /oauth/callback — Google redirects here after authorization
// ---------------------------------------------------------------------------

app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing authorization code.');

  try {
    await handleCallback(code);
    res.send('<p>Authorization successful. You can close this tab.</p><p>The sync server is now connected to Google.</p>');
    console.log('[Auth] Authorization complete. Tokens saved.');
  } catch (err) {
    res.status(500).send('Authorization failed: ' + err.message);
  }
});

// ---------------------------------------------------------------------------
// Pending task updates — apply hub checkbox changes to Google Tasks
// ---------------------------------------------------------------------------

async function applyPendingTaskUpdates() {
  const auth = await getAuthClient();
  if (!auth) return;

  let updates;
  try {
    updates = await getPendingUpdates();
  } catch (e) {
    // Supabase not configured yet — skip silently
    return;
  }

  if (!updates.length) return;

  const { google } = require('googleapis');
  const tasksService = google.tasks({ version: 'v1', auth });
  const idsFile = path.join(__dirname, '.ids.json');
  if (!fs.existsSync(idsFile)) return;
  const { shoppingListId } = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
  if (!shoppingListId) return;

  for (const update of updates) {
    try {
      await tasksService.tasks.patch({
        tasklist: update.list_id || shoppingListId,
        task: update.task_id,
        requestBody: { status: update.checked ? 'completed' : 'needsAction' },
      });
      await markUpdateApplied(update.id);
      console.log(`[Tasks] Applied pending update: ${update.task_id} → ${update.checked ? 'completed' : 'needsAction'}`);
    } catch (err) {
      console.warn('[Tasks] Failed to apply pending update:', err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[Family Hub] Sync server running on http://localhost:${PORT}`);
  console.log(`[Family Hub] To authorize with Google, visit http://localhost:${PORT}/auth`);

  // Start Google Calendar → Supabase poller
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    startPoller();
    setInterval(() => {
      applyPendingTaskUpdates().catch((e) => console.warn('[Tasks] Pending update error:', e.message));
    }, PENDING_UPDATE_INTERVAL_MS);
  } else {
    console.log('[Server] Supabase not configured — calendar polling and hub write-back disabled.');
    console.log('[Server] Add SUPABASE_URL and SUPABASE_SERVICE_KEY to .env to enable.');
  }
});
