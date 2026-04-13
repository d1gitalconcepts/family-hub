const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Workers are stateless per invocation but isolates can be reused — cache in module scope.
let _cachedToken  = null;
let _tokenExpiry  = 0;

export async function getAccessToken(env) {
  if (_cachedToken && Date.now() < _tokenExpiry - 60000) return _cachedToken;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${data.error} — ${data.error_description}`);

  _cachedToken = data.access_token;
  _tokenExpiry = Date.now() + data.expires_in * 1000;
  return _cachedToken;
}
