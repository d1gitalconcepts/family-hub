#!/usr/bin/env node
// Family Hub - One-time Google Keep login
// Run this once on the server to save your Google session.
// After this, scrape.js will reuse the saved session headlessly.
//
// Usage: node setup.js

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const SESSION_DIR  = path.join(__dirname, '.session');
const SESSION_FILE = path.join(SESSION_DIR, 'state.json');

async function main() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  console.log('\n Family Hub — Google Keep Login Setup');
  console.log('─────────────────────────────────────');
  console.log('A browser window will open. Sign in to Google, wait for Keep to load,');
  console.log('then come back here and press Enter.\n');

  // No userAgent override: it hardcoded Chrome/124.0.0.0 while the actually
  // installed Chromium is 147.x (`npx playwright --version`). Modern Chrome
  // also sends Client Hints headers reflecting the real engine version,
  // which this override never touched — so every login made under this
  // string simultaneously claimed to be Chrome 124 and Chrome 147, a
  // mismatch worse than sending no override at all. A session logged in
  // under that inconsistency may itself be tainted; re-run this after
  // pulling the fix so the next login is captured cleanly.
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://keep.google.com');

  console.log('Browser is open. Sign in to Google and wait for your notes to appear.');
  console.log('Press Enter here once Keep has fully loaded...');

  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', resolve);
  });

  // Verify Keep actually loaded (not stuck on login)
  const url = page.url();
  if (!url.includes('keep.google.com')) {
    console.error('\n❌ It looks like Keep did not load. Please try again.');
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: SESSION_FILE });
  await browser.close();

  console.log('\n✅ Session saved to .session/state.json');
  console.log('You can now run scrape.js (or set up the cron job).\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
