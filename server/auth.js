// Family Hub - Google OAuth
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKENS_FILE = path.join(__dirname, '.tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar',
];

function createClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `http://localhost:${process.env.PORT}/oauth/callback`
  );
}

function loadTokens() {
  if (fs.existsSync(TOKENS_FILE)) {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  }
  return null;
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// Returns an authenticated client, or null if auth is needed.
async function getAuthClient() {
  const tokens = loadTokens();
  if (!tokens) return null;

  const client = createClient();
  client.setCredentials(tokens);

  // Persist refreshed tokens automatically
  client.on('tokens', (refreshed) => {
    saveTokens({ ...loadTokens(), ...refreshed });
  });

  return client;
}

function getAuthUrl() {
  return createClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

async function handleCallback(code) {
  const client = createClient();
  const { tokens } = await client.getToken(code);
  saveTokens(tokens);
  client.setCredentials(tokens);
  return client;
}

module.exports = { getAuthClient, getAuthUrl, handleCallback };
