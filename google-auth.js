// Family Hub - Google OAuth2 for Firefox extension
// Uses browser.identity.launchWebAuthFlow for the initial auth,
// then stores and auto-refreshes tokens in chrome.storage.local.

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES    = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

async function getTokens() {
  const result = await chrome.storage.local.get('google_tokens');
  return result.google_tokens || null;
}

async function saveTokens(tokens) {
  await chrome.storage.local.set({ google_tokens: tokens });
}

async function isAuthenticated() {
  const tokens = await getTokens();
  return !!(tokens && tokens.refresh_token);
}

// Returns a valid access token, refreshing if expired.
async function getAccessToken() {
  const tokens = await getTokens();
  if (!tokens || !tokens.refresh_token) return null;

  // Still valid with 60s buffer
  if (tokens.access_token && tokens.expires_at > Date.now() + 60000) {
    return tokens.access_token;
  }

  // Refresh
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CONFIG.GOOGLE_CLIENT_ID,
      client_secret: CONFIG.GOOGLE_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${data.error}`);

  const updated = {
    ...tokens,
    access_token: data.access_token,
    expires_at:   Date.now() + data.expires_in * 1000,
  };
  await saveTokens(updated);
  return data.access_token;
}

// Interactive OAuth — opens a Google login popup.
async function launchOAuthFlow() {
  const redirectUrl = browser.identity.getRedirectURL();

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id',     CONFIG.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri',  redirectUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope',         GOOGLE_SCOPES);
  authUrl.searchParams.set('access_type',   'offline');
  authUrl.searchParams.set('prompt',        'consent');

  const responseUrl = await browser.identity.launchWebAuthFlow({
    url:         authUrl.toString(),
    interactive: true,
  });

  const code = new URL(responseUrl).searchParams.get('code');
  if (!code) throw new Error('No auth code received from Google');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CONFIG.GOOGLE_CLIENT_ID,
      client_secret: CONFIG.GOOGLE_CLIENT_SECRET,
      redirect_uri:  redirectUrl,
      code,
      grant_type:    'authorization_code',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token exchange failed: ${data.error}`);

  await saveTokens({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Date.now() + data.expires_in * 1000,
  });
  console.log('[Auth] Google OAuth complete.');
}

async function revokeAuth() {
  await chrome.storage.local.remove('google_tokens');
  console.log('[Auth] Google tokens cleared.');
}
