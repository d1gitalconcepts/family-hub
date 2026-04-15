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

// Default notes to scrape if config is not set in Supabase.
// Meal Planning is always included (used for calendar sync).
const DEFAULT_NOTE_TITLES = ['Shopping List', 'Meal Planning'];

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
  const now  = new Date().toLocaleString();
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

// Fetch pending Keep checkbox updates for a given note key
async function fetchPendingKeepUpdates(noteKey) {
  await supabaseAuth();
  const res = await fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/keep_updates?note_key=eq.${encodeURIComponent(noteKey)}&select=id,item_text,checked`,
    {
      headers: {
        'apikey':        CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${_jwt}`,
      },
    }
  );
  if (!res.ok) {
    console.warn(`[Hub] Failed to fetch keep_updates: ${await res.text()}`);
    return [];
  }
  return res.json();
}

// Delete applied keep_updates rows by id array
async function clearPendingKeepUpdates(ids) {
  if (!ids.length) return;
  await supabaseAuth();
  const res = await fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/keep_updates?id=in.(${ids.join(',')})`,
    {
      method:  'DELETE',
      headers: {
        'apikey':        CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${_jwt}`,
      },
    }
  );
  if (!res.ok) {
    console.warn(`[Hub] Failed to clear keep_updates: ${await res.text()}`);
  }
}

// Fetch the keep_notes config from Supabase to know which notes to scrape.
// Returns an array of note titles (e.g. ['Shopping List', 'Packing List']).
// Meal Planning is always appended so calendar sync always works.
async function fetchKeepNotesTitles() {
  await supabaseAuth();
  const res = await fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/config?key=eq.keep_notes&select=value`,
    {
      headers: {
        'apikey':        CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${_jwt}`,
      },
    }
  );
  if (!res.ok) {
    console.warn(`[Scraper] Could not fetch keep_notes config — using defaults`);
    return DEFAULT_NOTE_TITLES;
  }
  const rows = await res.json();
  if (!rows.length || !Array.isArray(rows[0]?.value)) return DEFAULT_NOTE_TITLES;

  const configured = rows[0].value
    .filter((n) => n.title && n.title.trim())
    .map((n) => n.title.trim());

  // Always include Meal Planning for calendar sync; preserve order, deduplicate
  const withMeal = [...configured];
  if (!withMeal.includes('Meal Planning')) withMeal.push('Meal Planning');
  return withMeal.length ? withMeal : DEFAULT_NOTE_TITLES;
}

// ── Keep write-back ───────────────────────────────────────────────────────────

// Apply pending checkbox updates while the note editor is open.
// Returns the ids of successfully applied updates.
async function applyKeepUpdates(page, updates) {
  if (!updates.length) return [];
  const appliedIds = [];

  for (const update of updates) {
    // Return the checkbox's screen coordinates so we can use page.mouse.click()
    // (a trusted event). Synthetic cb.click() from page.evaluate() is untrusted
    // and Keep's React handlers may silently ignore it.
    const result = await page.evaluate(({ itemText, desiredChecked }) => {
      const editor = document.querySelector('.oT9UPb');
      if (!editor) return { debug: 'no-editor' };

      const checkboxes = Array.from(editor.querySelectorAll('div[role="checkbox"]'));
      if (!checkboxes.length) return { debug: 'no-checkboxes' };

      // Collect all found item texts for diagnosis
      const found = [];
      for (const cb of checkboxes) {
        const row      = cb.parentElement?.parentElement;
        const textSpan = row?.querySelector('span[style*="Google Sans Text"]');
        let   text     = textSpan?.innerText?.trim();

        // Fallback: clone row, strip checkbox, read text
        if (!text && row) {
          const clone = row.cloneNode(true);
          const cbClone = clone.querySelector('[role="checkbox"]');
          if (cbClone) cbClone.remove();
          text = clone.innerText?.trim();
        }

        if (text) found.push(text);
        if (!text || text.toLowerCase() !== itemText.toLowerCase()) continue;

        const isChecked = cb.getAttribute('aria-checked') === 'true';
        if (isChecked === desiredChecked) return { alreadyCorrect: true };

        // Return coordinates for a real mouse click outside of evaluate()
        const r = cb.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      return { debug: 'not-found', found }; // item not found in editor
    }, { itemText: update.item_text, desiredChecked: update.checked });

    if (result?.debug) {
      const now = new Date().toLocaleString();
      console.warn(`[${now}] applyKeepUpdates debug (${result.debug}) for "${update.item_text}"${result.found ? ` — found: [${result.found.join(', ')}]` : ''}`);
      // Leave in queue to retry next cycle
      continue;
    }

    if (!result.alreadyCorrect) {
      // Use real mouse event (trusted) so Keep's React handlers fire correctly
      await page.mouse.click(result.x, result.y);
      await page.waitForTimeout(300);
    }

    appliedIds.push(update.id);
  }

  return appliedIds;
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
        // Keep puts ALL checked items (recent and historical) into the archived
        // section marked with class 'barxie-MPu53c' on the grandparent (p3).
        // Items are ordered newest-first within that section.
        // Strategy: take ALL unchecked items + the first RECENT_CHECKED_LIMIT
        // checked items (most recently checked = top of the archived section).
        // This captures the current shopping trip without pulling in years of history.
        const RECENT_CHECKED_LIMIT = 30;
        const unchecked = allCheckboxes.filter((cb) => {
          const p3 = cb.parentElement?.parentElement?.parentElement;
          return !p3?.classList.contains('barxie-MPu53c');
        });
        const recentChecked = allCheckboxes
          .filter((cb) => {
            const p3 = cb.parentElement?.parentElement?.parentElement;
            return p3?.classList.contains('barxie-MPu53c');
          })
          .slice(0, RECENT_CHECKED_LIMIT);
        const checkboxItems = [...unchecked, ...recentChecked];

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
        results.push({ id: slugify(title), title, type: 'checklist', items, scrapedAt: new Date().toLocaleString() });
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
        results.push({ id: slugify(title), title, type: 'text', lines, scrapedAt: new Date().toLocaleString() });
      }
    });

    return results;
  }, targetNotes);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const ts = new Date().toLocaleString();

  if (!fs.existsSync(SESSION_FILE)) {
    console.error(`[${ts}] No session found. Run: node setup.js`);
    process.exit(1);
  }

  // Determine which notes to scrape (from Supabase config, with fallback)
  const TARGET_NOTES = await fetchKeepNotesTitles().catch((err) => {
    console.warn(`[${ts}] Failed to fetch note config: ${err.message} — using defaults`);
    return DEFAULT_NOTE_TITLES;
  });
  console.log(`[${ts}] Target notes: ${TARGET_NOTES.join(', ')}`);

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

    // Dismiss Google Translate or similar overlays that intercept pointer events
    await page.evaluate(() => {
      document.querySelectorAll(
        '.VIpgJd-TUo6Hb, .goog-te-banner-frame, #goog-gt-tt, .skiptranslate'
      ).forEach((el) => el.remove());
    }).catch(() => {});

    // Open every target note in the editor one at a time so we get full content.
    // - Text notes: card view truncates long content with "…"; editor shows all.
    // - Checklist notes: card view caps visible items (~10-15); editor shows all,
    //   but also exposes historical completed items. scrapeKeep() filters those
    //   out by stopping at Keep's "X checked items" section toggle.
    const allNotes = [];

    for (const noteName of TARGET_NOTES) {
      const noteKey = slugify(noteName);

      // Fetch any pending checkbox updates queued by the hub for this note
      const pendingUpdates = await fetchPendingKeepUpdates(noteKey);
      if (pendingUpdates.length) {
        console.log(`[${ts}] ${pendingUpdates.length} pending Keep update(s) for "${noteName}"`);
      }

      // Remove any overlays that could intercept mouse clicks (Google Translate banner, etc.)
      // Do this before every note click attempt, not just in the search fallback.
      await page.evaluate(() => {
        document.querySelectorAll(
          '.VIpgJd-TUo6Hb, .goog-te-banner-frame, #goog-gt-tt, .skiptranslate'
        ).forEach((el) => el.remove());
      });

      // Try to click the note directly if it's already visible on screen (e.g. pinned notes).
      // Return coordinates so we can use page.mouse.click() (trusted event) instead of
      // el.click() (synthetic/untrusted, may be ignored by Keep's React handlers).
      let usedSearch = false;
      let noteCoords = await page.evaluate((name) => {
        const els = document.querySelectorAll('div[role="textbox"]');
        for (const el of els) {
          if (el.innerText.trim() === name) {
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return null;
      }, noteName);

      if (noteCoords) await page.mouse.click(noteCoords.x, noteCoords.y);
      let clicked = !!noteCoords;

      // Fallback: use Keep's search bar to surface notes not in the initial viewport.
      // This handles unpinned notes that aren't rendered due to virtual scrolling.
      // Everything is done via page.evaluate() + keyboard to completely avoid
      // Playwright's pointer-event actionability checks, which break when any
      // overlay (e.g. Google Translate banner) intercepts pointer events.
      if (!clicked) {
        console.log(`[${ts}] "${noteName}" not on screen — searching…`);

        const searchFocused = await page.evaluate(() => {
          // Remove any overlays that intercept pointer events
          document.querySelectorAll(
            '.VIpgJd-TUo6Hb, .goog-te-banner-frame, #goog-gt-tt, .skiptranslate'
          ).forEach((el) => el.remove());

          // Focus the search input directly — no click needed
          const input = document.querySelector('input[aria-label="Search"]');
          if (!input) return false;
          input.value = '';
          input.focus();
          return true;
        });

        if (searchFocused) {
          usedSearch = true;
          await page.keyboard.type(noteName, { delay: 40 }); // real keypresses to trigger Keep's search
          // Wait until the exact note title appears in the DOM — don't just
          // check for any textbox, which may already exist from the main grid.
          await page.waitForFunction(
            (name) => {
              const els = document.querySelectorAll('div[role="textbox"]');
              for (const el of els) {
                if (el.innerText.trim() === name) return true;
              }
              return false;
            },
            noteName,
            { timeout: 8000, polling: 300 }
          ).catch(() => {});

          noteCoords = await page.evaluate((name) => {
            const els = document.querySelectorAll('div[role="textbox"]');
            for (const el of els) {
              if (el.innerText.trim() === name) {
                const r = el.getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
              }
            }
            return null;
          }, noteName);

          if (noteCoords) await page.mouse.click(noteCoords.x, noteCoords.y);
          clicked = !!noteCoords;
        } else {
          console.warn(`[${ts}] Search bar not found — cannot search for "${noteName}"`);
        }
      }

      if (!clicked) {
        console.warn(`[${ts}] Note not found: "${noteName}" — skipping.`);
        if (usedSearch) {
          await page.keyboard.press('Escape'); // exits search mode in Keep
          await page.waitForTimeout(400);
        }
        continue;
      }

      // Wait for the editor overlay (.oT9UPb) to appear
      const editorOpened = await page.waitForSelector('.oT9UPb', { timeout: 5000 })
        .then(() => true).catch(() => false);
      if (!editorOpened) console.warn(`[${ts}] Editor did not open for "${noteName}" — write-back skipped`);
      await page.waitForTimeout(800);

      // Apply any pending checkbox updates while the editor is open
      if (pendingUpdates.length) {
        const appliedIds = await applyKeepUpdates(page, pendingUpdates);
        if (appliedIds.length) {
          console.log(`[${ts}] Applied ${appliedIds.length} checkbox update(s) to "${noteName}"`);
          await clearPendingKeepUpdates(appliedIds);
          // Brief pause so Keep can register the clicks before we scrape
          await page.waitForTimeout(600);
        }
        const skipped = pendingUpdates.length - appliedIds.length;
        if (skipped > 0) {
          console.warn(`[${ts}] ${skipped} update(s) for "${noteName}" could not be applied (item not found)`);
          // Still clear them so they don't pile up
          const notApplied = pendingUpdates.filter((u) => !appliedIds.includes(u.id)).map((u) => u.id);
          await clearPendingKeepUpdates(notApplied);
        }
      }

      // Scrape this note while the editor is open (full content visible)
      const scraped = await scrapeKeep(page, [noteName]);
      allNotes.push(...scraped);

      // Close the editor and wait for it to animate away
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);

      // If we used search to find this note, clear it so the next note
      // starts from the main grid (important for pinned/visible notes).
      // Extra wait first — give Keep time to finish animating the editor closed.
      if (usedSearch) {
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape'); // exits search mode, returns to main grid
        await page.waitForTimeout(400);
      }
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
  console.error(`[${new Date().toLocaleString()}] Fatal error:`, err.message);
  process.exit(1);
});
