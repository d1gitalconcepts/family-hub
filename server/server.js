// Family Hub - Local Sync Server
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const open = require('open');
const { getAuthClient, getAuthUrl, handleCallback } = require('./auth');
const { syncTasks } = require('./tasks');
const { syncCalendar } = require('./calendar');

const PORT = process.env.PORT || 3747;
const CACHE_FILE = path.join(__dirname, '.cache.json');
const GOOGLE_SYNC_COOLDOWN_MS = 30_000; // minimum gap between Google API syncs

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
// Cache helpers — persist last known notes to disk
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

  // Always cache the latest data regardless of auth state
  writeCache(notes, timestamp);

  const auth = await getAuthClient();
  if (!auth) {
    return res.status(202).json({ cached: true, synced: false, reason: 'Not authenticated. Visit http://localhost:' + PORT + '/auth' });
  }

  // Throttle Google API calls — schedule a sync but don't fire more than
  // once per GOOGLE_SYNC_COOLDOWN_MS regardless of how often Keep changes.
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
        }
        if (note.id === 'meal-planning' && note.type === 'text') {
          await syncCalendar(auth, note.lines);
        }
      }
      console.log('[Server] Google sync complete.');
    } catch (err) {
      console.error('[Server] Sync error:', err.message);
    }
  }, delay);

  res.json({ ok: true, queued: true, syncInMs: delay });
});

// ---------------------------------------------------------------------------
// GET /notes — return last known notes (for Family Hub frontend on load)
// ---------------------------------------------------------------------------

app.get('/notes', (req, res) => {
  const cache = readCache();
  if (!cache) return res.status(404).json({ error: 'No data yet. Open Google Keep to start.' });
  res.json(cache);
});

// ---------------------------------------------------------------------------
// GET /status — connection and sync health (for Family Hub status indicators)
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
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[Family Hub] Sync server running on http://localhost:${PORT}`);
  console.log(`[Family Hub] To authorize with Google, visit http://localhost:${PORT}/auth`);
});
