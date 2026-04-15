#!/usr/bin/env node
// One-time script to obtain a Google OAuth refresh token for the Cloudflare Worker.
// Requires Node.js 18+ (built-in fetch).
//
// Before running:
//   1. Go to Google Cloud Console → APIs & Services → Credentials
//   2. Edit your OAuth 2.0 Client ID
//   3. Add http://localhost:9876/callback to Authorized redirect URIs
//   4. Run: node get-token.js
//   5. Copy the GOOGLE_REFRESH_TOKEN output into Cloudflare Worker secrets

const http     = require('http');
const readline = require('readline');
const { exec } = require('child_process');

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

// Read from env vars if set, otherwise prompt interactively
async function getCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID
    || await prompt('Enter your Google OAuth Client ID: ');
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    || await prompt('Enter your Google OAuth Client Secret: ');
  return { clientId, clientSecret };
}

const REDIRECT_URI = 'http://localhost:9876/callback';
const SCOPES       = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
].join(' ');

(async () => {
  const { clientId, clientSecret } = await getCredentials();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id',     clientId);
  authUrl.searchParams.set('redirect_uri',  REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope',         SCOPES);
  authUrl.searchParams.set('access_type',   'offline');
  authUrl.searchParams.set('prompt',        'consent'); // force refresh_token to be returned

  console.log('\n Opening browser for Google sign-in...');
  const opener = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${opener} "${authUrl.toString()}"`);

  const server = http.createServer(async (req, res) => {
    const url  = new URL(req.url, 'http://localhost:9876');
    const code = url.searchParams.get('code');

    if (!code) {
      res.writeHead(400); res.end('No code received.');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2 style="font-family:sans-serif">✅ Auth complete! Check your terminal.</h2>');
    server.close();

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  REDIRECT_URI,
        code,
        grant_type: 'authorization_code',
      }),
    });
    const data = await tokenRes.json();

    if (data.error) {
      console.error('\n❌ Error:', data.error, data.error_description);
      process.exit(1);
    }

    console.log('\n✅ Success! Run these commands to add secrets to your Cloudflare Worker:\n');
    console.log(`  cd worker`);
    console.log(`  npx wrangler secret put GOOGLE_CLIENT_ID`);
    console.log(`    → paste your Client ID when prompted`);
    console.log(`  npx wrangler secret put GOOGLE_CLIENT_SECRET`);
    console.log(`    → paste your Client Secret when prompted`);
    console.log(`  npx wrangler secret put GOOGLE_REFRESH_TOKEN`);
    console.log(`    → ${data.refresh_token}`);
    console.log(`  npx wrangler secret put SUPABASE_URL`);
    console.log(`  npx wrangler secret put SUPABASE_ANON_KEY`);
    console.log(`  npx wrangler secret put SUPABASE_EMAIL`);
    console.log(`  npx wrangler secret put SUPABASE_PASSWORD`);
    console.log('\nThen deploy with: npx wrangler deploy\n');
    process.exit(0);
  });

  server.listen(9876, () => {
    console.log('Waiting for Google OAuth callback on http://localhost:9876/callback ...\n');
  });
})();
