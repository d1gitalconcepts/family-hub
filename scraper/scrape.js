#!/usr/bin/env node
// Family Hub - Headless Google Keep Scraper
// Runs every 5 minutes via cron. Reuses saved Google session.
// Writes Shopping List + Meal Planning notes to Supabase.
//
// Cron entry (edit with: crontab -e):
//   */5 * * * * /usr/bin/node /path/to/family-hub/scraper/scrape.js >> /path/to/family-hub/scraper/scraper.log 2>&1

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const CONFIG       = require('./config');
const SESSION_FILE = path.join(__dirname, '.session', 'state.json');
const TARGET_NOTES = ['Shopping List', 'Meal Planning'];

// ── Supabase ──────────────────────────────────────────────────────────────────

let _jwt = null;
let _jwtExpiry = 0;

async function supabaseAuth() {
  if (_jwt && Date.now() < _jwtExpiry - 60000) return;
  const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method:  'POST',
    headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: CONFIG.SUPABASE_EMAIL, password: CONFIG.SUPABASE_PASSWORD }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Supabase auth failed: ${data.error_description || data.error}`);
  _jwt       = data.access_token;
  _jwtExpiry = Date.now() + data.expires_in * 1000;
}

async function upsertNotes(notes) {
  await supabaseAuth();
  const now  = new Date().toISOString();
  const rows = notes.map((note) => ({
    key:        note.id,
    data:       note,
    scraped_at: now,
    updated_at: now,
  }));
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/notes`, {
    method:  'POST',
    headers: {
      'apikey':        CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${_jwt}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed: ${await res.text()}`);
}

// ── Scraping logic (mirrors content.js) ──────────────────────────────────────

async function scrapeKeep(page, targetNotes) {
  return page.evaluate((targetNotes) => {
    function slugify(title) {
      return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    const results = [];
    const titleElements = document.querySelectorAll('div[role="textbox"]');

    // Prefer open-editor version of a note (.oT9UPb) over card version
    const byTitle = {};
    titleElements.forEach((titleEl) => {
      const title = titleEl.innerText.trim();
      if (!targetNotes.includes(title)) return;
      const container = titleEl.parentElement?.parentElement?.parentElement?.parentElement;
      const isEditor  = container?.classList?.contains('oT9UPb');
      if (!byTitle[title] || isEditor) byTitle[title] = titleEl;
    });

    Object.entries(byTitle).forEach(([title, titleEl]) => {
      const p4 = titleEl.parentElement?.parentElement?.parentElement?.parentElement;
      const noteContainer =
        (p4?.classList?.contains('oT9UPb') ? p4 : null) ||
        titleEl.closest('[data-note]') ||
        titleEl.parentElement?.parentElement?.parentElement ||
        titleEl.parentElement?.parentElement;

      if (!noteContainer) return;

      const allCheckboxes = Array.from(noteContainer.querySelectorAll('div[role="checkbox"]'));

      if (allCheckboxes.length > 0) {
        // Checklist note.
        // In editor mode Keep renders ALL historically completed items in a
        // collapsed "X checked items" section. We find that toggle button and
        // only keep checkboxes that appear BEFORE it in the DOM, which gives us
        // the active (current) items only — regardless of how long the list is.
        const completedToggle = Array.from(noteContainer.querySelectorAll('[role="button"]'))
          .find((el) => /\d+\s+checked\s+item/i.test(el.innerText || el.getAttribute('aria-label') || ''));

        const checkboxItems = completedToggle
          ? allCheckboxes.filter(
              (cb) => completedToggle.compareDocumentPosition(cb) & Node.DOCUMENT_POSITION_PRECEDING
            )
          : allCheckboxes;

        const items = [];
        checkboxItems.forEach((checkbox) => {
          const checked = checkbox.getAttribute('aria-checked') === 'true';
          const row     = checkbox.parentElement?.parentElement;
          const textSpan = row?.querySelector('span[style*="Google Sans Text"]');
          let text = textSpan?.innerText?.trim();
          if (!text && row) {
            const clone = row.cloneNode(true);
            const cb = clone.querySelector('[role="checkbox"]');
            if (cb) cb.remove();
            text = clone.innerText?.trim();
          }
          if (text) items.push({ text, checked });
        });
        results.push({ id: slugify(title), title, type: 'checklist', items, scrapedAt: new Date().toISOString() });
      } else {
        // Plain text note
        const textSpans = noteContainer.querySelectorAll('span[style*="Google Sans Text"]');
        const lines = [];
        if (textSpans.length > 0) {
          textSpans.forEach((span) => {
            const text = span.innerText.trim();
            if (text) lines.push(text);
          });
        } else {
          noteContainer.querySelectorAll('span, div').forEach((el) => {
            if (el.children.length === 0) {
              const text = el.innerText?.trim();
              if (text && text !== title) lines.push(text);
            }
          });
        }
        results.push({ id: slugify(title), title, type: 'text', lines, scrapedAt: new Date().toISOString() });
      }
    });

    return results;
  }, targetNotes);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const ts = new Date().toISOString();

  if (!fs.existsSync(SESSION_FILE)) {
    console.error(`[${ts}] No session found. Run: node setup.js`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_FILE });
  const page    = await context.newPage();

  try {
    await page.goto('https://keep.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Detect redirect to login page
    if (page.url().includes('accounts.google.com')) {
      console.error(`[${ts}] Session expired — run: node setup.js`);
      process.exit(1);
    }

    // Wait for Keep's note grid to render — poll until we have textbox elements
    await page.waitForFunction(
      () => document.querySelectorAll('div[role="textbox"]').length > 0,
      { timeout: 30000, polling: 500 }
    );

    // Extra settle time for note content to fully render
    await page.waitForTimeout(2000);

    // Open every target note in the editor one at a time so we get full content.
    // - Text notes: card view truncates long content with "…"; editor shows all.
    // - Checklist notes: card view caps visible items (~10-15); editor shows all,
    //   but also exposes historical completed items. scrapeKeep() filters those
    //   out by stopping at Keep's "X checked items" section toggle.
    const allNotes = [];

    for (const noteName of TARGET_NOTES) {
      // Click the note title to open it in editor view
      const clicked = await page.evaluate((name) => {
        const els = document.querySelectorAll('div[role="textbox"]');
        for (const el of els) {
          if (el.innerText.trim() === name) { el.click(); return true; }
        }
        return false;
      }, noteName);

      if (!clicked) {
        console.warn(`[${ts}] Note not found on screen: "${noteName}" — skipping.`);
        continue;
      }

      // Wait for the editor overlay (.oT9UPb) to appear
      await page.waitForSelector('.oT9UPb', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);

      // Scrape this note while the editor is open (full content visible)
      const scraped = await scrapeKeep(page, [noteName]);
      allNotes.push(...scraped);

      // Close the editor and wait for it to animate away
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }

    if (allNotes.length === 0) {
      console.warn(`[${ts}] No target notes found. Is Keep showing them on screen?`);
    } else {
      await upsertNotes(allNotes);
      const summary = allNotes.map((n) =>
        n.type === 'checklist'
          ? `${n.title} (${n.items.length} items)`
          : `${n.title} (${n.lines.length} lines)`
      ).join(', ');
      console.log(`[${ts}] Scraped and uploaded: ${summary}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err.message);
  process.exit(1);
});
