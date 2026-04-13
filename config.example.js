// Copy this file to config.js and fill in your credentials.
// config.js is gitignored — never commit it.
//
// Setup steps:
//  1. Copy this file: cp config.example.js config.js
//  2. Fill in the values below
//  3. Load the extension in Firefox (about:debugging → Load Temporary Add-on)
//  4. Open the extension background console and run:
//       browser.identity.getRedirectURL()
//  5. Add that URL to your Google Cloud Console → OAuth credentials → Authorized redirect URIs
//  6. Click "Connect to Google" in the extension popup

const CONFIG = {
  GOOGLE_CLIENT_ID:     'YOUR_CLIENT_ID.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'YOUR_CLIENT_SECRET',
  SUPABASE_URL:         'https://YOUR_PROJECT.supabase.co',
  SUPABASE_ANON_KEY:    'YOUR_SUPABASE_ANON_KEY',
  SUPABASE_EMAIL:       'admin@hub.local',
  SUPABASE_PASSWORD:    'YOUR_ADMIN_PASSWORD',
};
