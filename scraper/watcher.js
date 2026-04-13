#!/usr/bin/env node
// Family Hub - Keep Update Watcher
// Subscribes to Supabase Realtime on keep_updates table.
// When a new row is inserted (hub checked/unchecked an item), triggers scrape.js
// immediately rather than waiting for the 5-minute cron.
//
// Run persistently via pm2:
//   pm2 start watcher.js --name family-hub-watcher
//   pm2 save
//   pm2 startup  (follow the printed command to auto-start on boot)
//
// The cron scrape.js remains as a safety net for regular polling.

const { spawn }    = require('child_process');
const path         = require('path');
const { createClient } = require('@supabase/supabase-js');

const CONFIG     = require('./config');
const SCRAPE_JS  = path.join(__dirname, 'scrape.js');

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// ── Debounce ──────────────────────────────────────────────────────────────────
// If multiple items are checked in quick succession, wait briefly then run once.

let debounceTimer  = null;
let scrapeRunning  = false;
const DEBOUNCE_MS  = 1500;

function triggerScrape() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runScrape, DEBOUNCE_MS);
}

function runScrape() {
  if (scrapeRunning) {
    // Another scrape is already in flight — schedule one more after it finishes
    console.log(`[${ts()}] Scrape already running, will re-trigger after it finishes.`);
    debounceTimer = setTimeout(runScrape, 5000);
    return;
  }

  scrapeRunning = true;
  console.log(`[${ts()}] keep_updates detected — triggering scrape.js`);

  const child = spawn(process.execPath, [SCRAPE_JS], {
    stdio: 'inherit',
    cwd:   __dirname,
  });

  child.on('close', (code) => {
    scrapeRunning = false;
    if (code !== 0) {
      console.warn(`[${ts()}] scrape.js exited with code ${code}`);
    }
  });
}

// ── Realtime subscription ─────────────────────────────────────────────────────

async function start() {
  // Sign in so the subscription passes RLS (authenticated policy)
  const { error: authError } = await supabase.auth.signInWithPassword({
    email:    CONFIG.SUPABASE_EMAIL,
    password: CONFIG.SUPABASE_PASSWORD,
  });
  if (authError) {
    console.error(`[${ts()}] Supabase auth failed:`, authError.message);
    process.exit(1);
  }

  supabase
    .channel('keep-updates-watcher')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'keep_updates' },
      (payload) => {
        const { note_key, item_text, checked } = payload.new;
        console.log(`[${ts()}] New keep_update: "${item_text}" → ${checked ? 'checked' : 'unchecked'} (${note_key})`);
        triggerScrape();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[${ts()}] Watching keep_updates table for changes...`);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`[${ts()}] Realtime subscription error: ${status} — restarting in 10s`);
        setTimeout(() => start(), 10000);
      }
    });
}

function ts() {
  return new Date().toISOString();
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

console.log(`[${ts()}] Family Hub Keep watcher starting...`);
start().catch((err) => {
  console.error(`[${ts()}] Fatal:`, err.message);
  process.exit(1);
});
