// Family Hub - Local Sync Server
require('dotenv').config();

const express = require('express');
const open = require('open');
const { getAuthClient, getAuthUrl, handleCallback } = require('./auth');
const { syncTasks } = require('./tasks');
const { syncCalendar } = require('./calendar');

const PORT = process.env.PORT || 3747;
const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// POST /notes — receives scraped data from the browser extension
// ---------------------------------------------------------------------------

app.post('/notes', async (req, res) => {
  const { notes } = req.body;
  if (!notes || !Array.isArray(notes)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const auth = await getAuthClient();
  if (!auth) {
    return res.status(401).json({ error: 'Not authenticated. Visit http://localhost:' + PORT + '/auth to authorize.' });
  }

  try {
    for (const note of notes) {
      if (note.id === 'shopping-list' && note.type === 'checklist') {
        await syncTasks(auth, note.items);
      }
      if (note.id === 'meal-planning' && note.type === 'text') {
        await syncCalendar(auth, note.lines);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Server] Sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
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
