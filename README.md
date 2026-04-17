# Family Hub

A self-hosted family dashboard built on React, Supabase, and Cloudflare. It shows a weekly calendar pulled from Google Calendar, live weather, a 14-day forecast, and a sidebar with Google Keep checklists that sync bidirectionally. Sports calendars are automatically enriched with live scores, box scores, and game detail from public APIs — MLB, NHL, NFL, Golf, F1, and NASCAR.

![Family Hub screenshot](docs/screenshot.png)

---

## What's in this repo

| Directory | What it does |
|-----------|-------------|
| `hub/` | React frontend — the actual dashboard UI (Vite + React) |
| `worker/` | Cloudflare Worker — syncs Google Calendar + forecast every 5 min |
| `scraper/` | Node.js script — scrapes Google Keep notes into Supabase and writes checkbox changes back |
| `supabase/` | Database schema SQL |

---

## Architecture overview

```
Google Calendar ──► Cloudflare Worker ──► Supabase ──► Hub (React)
Google Keep     ──► Scraper (cron)    ──►         ──►
Open-Meteo      ──► Cloudflare Worker ──►         ──►
Ambient Weather ──► Cloudflare Worker ──►         ──►

Hub (React) ──► Supabase (keep_updates) ──► Watcher ──► Scraper ──► Google Keep
```

All data lives in Supabase. The hub is a static React app that reads from Supabase in real time via subscriptions. Nothing is served from a custom backend.

The watcher (`scraper/watcher.js`) subscribes to Supabase Realtime and triggers a scrape immediately whenever the hub checks or unchecks a Keep item, so write-backs land in Google Keep within a few seconds.

---

## Full setup

This is the complete stack: dashboard UI + calendar sync + weather + Keep scraper.

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Authentication → Users → Add user** and create two users:
   - `family@hub.local` — shared family password (read-only access)
   - `admin@hub.local` — your personal admin password (can change settings)
4. Note your **Project URL** and **anon public key** from **Settings → API**

### 2. Scraper (Google Keep)

See **[Scraper standalone setup](#scraper-standalone-setup)** below — the scraper works independently of the rest of the stack.

### 3. Cloudflare Worker (calendar + weather sync)

The worker runs every 5 minutes on Cloudflare's free tier and syncs Google Calendar events, weather data, and the 7-day forecast into Supabase.

**Prerequisites:** A free [Cloudflare account](https://cloudflare.com) and Node.js installed.

```bash
cd worker
npm install
```

**Get a Google OAuth refresh token:**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Google Calendar API**
3. Create OAuth 2.0 credentials (Desktop app type)
4. Copy your Client ID and Client Secret
5. Run the token helper:
   ```bash
   node get-token.js
   ```
   Follow the prompts — it opens a browser for Google sign-in and saves your refresh token.

**Set worker secrets:**

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_EMAIL       # admin@hub.local
npx wrangler secret put SUPABASE_PASSWORD    # your admin password
```

**Deploy:**

```bash
npx wrangler deploy
```

The worker will now sync every 5 minutes automatically.

### 4. Hub (React frontend)

The hub is a static site that can be deployed anywhere — Cloudflare Pages, Vercel, Netlify, etc. These instructions use Cloudflare Pages (free tier).

```bash
cd hub
cp .env.example .env
# Fill in your Supabase URL and anon key in .env
npm install
npm run dev   # local preview
```

**Deploy to Cloudflare Pages:**

1. Push this repo to GitHub
2. Go to Cloudflare Dashboard → **Pages → Create a project**
3. Connect your GitHub repo
4. Build settings:
   - Framework preset: **Vite**
   - Root directory: `hub`
   - Build command: `npm run build`
   - Output directory: `dist`
5. Add environment variables:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon key

After first deploy, visit your hub URL and log in with `family@hub.local` or `admin@hub.local`.

**First-time settings:**

Log in as admin and open **Settings** via the hamburger menu (☰). Key tabs to configure:

- **Calendars** — your Google calendars auto-populate after the first worker sync; toggle visibility and assign colors/emojis
- **Weather** — choose a source:
  - *Open-Meteo* (free, no API key): enter a zip code or use your device's location
  - *Ambient Weather* (optional, for a personal weather station): enter your API Key and Application Key from [ambientweather.net → Account → API Keys](https://ambientweather.net/account)
- **Keep Notes** — add the Google Keep note titles you want to scrape and display in the sidebar
- **Event Cards** — customize card layout: choose which elements to show (time, title, calendar, description), drag to reorder them, pick border or solid background, set alignment
- **Sports** — configure which sports calendars get live enrichment (MLB, NHL, NFL, Golf, F1, NASCAR); set per-sport detail level (Score only / Box Score / Full Detail) and toggle the score chip on event cards
- **Event Icons** — assign emoji to events by keyword (e.g. "soccer" → ⚽)
- **Event Filters** — hide events whose title matches keywords (e.g. hide all "Busy" blocks)
- **Display** — font size, accent color, nav bar theme, app name, favicon

---

---

> ⚠️ **Everything below this point is for the standalone scraper only.**
> If you are setting up the full dashboard, stop here — you already covered the scraper as part of Step 2 above. The sections below are a self-contained guide for people who only want Google Keep data in Supabase and are not deploying the hub or worker at all.

---

## Scraper standalone setup

> Just want Google Keep data in Supabase and don't need the full dashboard? This is the only section you need.

The scraper is a self-contained Node.js script that runs headlessly (no visible browser window), logs into Google Keep, and writes your checklist notes into a Supabase database as structured JSON. From there you can query the data however you like — build your own app, use it in a spreadsheet via the Supabase API, trigger automations, etc.

### What you need

- A Linux or macOS machine (Raspberry Pi works great) with Node.js 18+
- A free [Supabase](https://supabase.com) account
- A Google account with Keep notes

### Step 1 — Supabase

1. Create a free Supabase project
2. Run `supabase/schema.sql` in the SQL Editor (you only need the `notes`, `keep_updates`, and `config` tables for the scraper — the rest is for the full hub)
3. Go to **Authentication → Users → Add user**, create one user:
   - Email: `admin@hub.local` (or anything you like)
   - Password: choose something strong
4. Note your **Project URL** and **anon public key** from **Settings → API**

### Step 2 — Clone and configure

```bash
git clone https://github.com/your-username/family-hub.git
cd family-hub/scraper
npm install
npx playwright install chromium
cp config.example.js config.js
```

Edit `config.js`:

```js
module.exports = {
  SUPABASE_URL:      'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key',
  SUPABASE_EMAIL:    'admin@hub.local',
  SUPABASE_PASSWORD: 'your-password',
};
```

### Step 3 — Log into Google Keep

The scraper uses a saved browser session so it never has to re-authenticate. Run the setup script once — it opens a real browser window for you to sign in:

```bash
node setup.js
```

Sign into your Google account in the browser window that opens, navigate to [keep.google.com](https://keep.google.com) and wait for your notes to load, then press Enter in the terminal. Your session is saved to `.session/state.json` (gitignored — stays on your machine).

### Step 4 — Configure which notes to scrape

By default the scraper looks for a note called **"Shopping List"**. To add more notes, insert a row into your Supabase `config` table:

```sql
insert into config (key, value) values (
  'keep_notes',
  '[
    {"title": "Shopping List", "key": "shopping-list", "label": "Shopping List", "visible": true, "url": "https://keep.google.com/u/0/#LIST/YOUR_NOTE_ID"},
    {"title": "Packing List",  "key": "packing-list",  "label": "Packing List",  "visible": true, "url": "https://keep.google.com/u/0/#LIST/YOUR_NOTE_ID"}
  ]'
);
```

The `title` must match the note title in Google Keep exactly. The `key` is a URL-safe slug used as the row key in the `notes` table.

**The `url` field is important** — it's the direct link to the note in Google Keep (open the note in your browser and copy the URL from the address bar). Without it the scraper can only read the card preview (~10 items); with it, the scraper reads the full note content by navigating directly to the note URL. If you're using the full hub, you can set these URLs from the **Keep Notes** tab in Settings instead of editing SQL directly.

### Step 5 — Test it

```bash
node scrape.js
```

You should see output like:

```
[4/14/2026, 9:00:00 AM] Target notes: Shopping List, Packing List
[4/14/2026, 9:00:04 AM] Scraped and uploaded: Shopping List (24 items), Packing List (18 items)
```

### Step 6 — Run persistently with pm2 (recommended)

The scraper has two processes you'll want running continuously:

- **`scrape.js`** — polls every 5 minutes via cron (safety net)
- **`watcher.js`** — subscribes to Supabase Realtime and triggers an immediate scrape whenever the hub checks or unchecks an item in Keep (enables write-back)

Install pm2 and start both:

```bash
npm install -g pm2

pm2 start watcher.js --name family-hub-watcher --restart-delay=5000
pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

Then add the cron job as a safety net:

```bash
crontab -e
```

Add this line (adjust the path):

```
*/5 * * * * /usr/bin/node /home/youruser/family-hub/scraper/scrape.js >> /home/youruser/family-hub/scraper/scraper.log 2>&1
```

> **No virtual display needed.** The scraper runs fully headless — no `xvfb-run` or display server required.

If you only need one-way sync (Keep → hub, no write-back), you can skip pm2 and use the cron job alone.

### What the data looks like

Each note is stored as a row in the `notes` table with a `data` column containing JSON:

```json
{
  "id": "shopping-list",
  "title": "Shopping List",
  "type": "checklist",
  "items": [
    { "text": "Milk",   "checked": false },
    { "text": "Eggs",   "checked": false },
    { "text": "Butter", "checked": true  }
  ],
  "scrapedAt": "2026-04-14T13:00:00.000Z"
}
```

You can query it via the [Supabase client libraries](https://supabase.com/docs/reference) (JavaScript, Python, Swift, Kotlin, etc.) or the REST API directly:

```bash
curl 'https://your-project.supabase.co/rest/v1/notes?key=eq.shopping-list&select=data' \
  -H "apikey: your-anon-key" \
  -H "Authorization: Bearer your-anon-key"
```

### Session expiry

Google sessions typically last a few weeks to a few months. When the scraper logs `Session expired — run: node setup.js`, just run `node setup.js` again to refresh it.

---

## Keep the session alive (optional)

If your scraper machine sleeps or reboots, the cron job and pm2 watcher start again automatically. The session file persists across reboots. The only maintenance is re-running `node setup.js` when Google eventually expires the session.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Database + Auth | Supabase (Postgres) |
| Calendar/Weather/Sports sync | Cloudflare Workers (free tier, two cron triggers) |
| Keep scraper | Node.js + Playwright (headless Chromium) |
| Forecast data | Open-Meteo (free, no API key needed) |
| Weather station | Ambient Weather (optional) |
| Sports data | MLB Stats API, NHL API, ESPN (NFL/Golf/NASCAR), OpenF1 |
| Hosting | Cloudflare Pages (free tier) |

---

## Contributing

Pull requests welcome. The project is structured so each directory (`hub`, `worker`, `scraper`) can be worked on independently.
