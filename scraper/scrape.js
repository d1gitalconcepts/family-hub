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
  const now  = new Date().toISOString(); // must be ISO for Postgres timestamptz
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

// Returns a map of { "Note Title": "https://keep.google.com/u/0/#TYPE/ID" }
// Reads the url field from each entry in the keep_notes config array.
async function fetchKeepNoteUrls() {
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
  if (!res.ok) return {};
  const rows = await res.json();
  const notes = rows[0]?.value;
  if (!Array.isArray(notes)) return {};
  // Build { title -> url } map from notes that have a url field
  return Object.fromEntries(
    notes.filter((n) => n.title && n.url).map((n) => [n.title.trim(), n.url.trim()])
  );
}

// ── Keep write-back ───────────────────────────────────────────────────────────

// Apply pending checkbox updates while the note editor is open.
// Returns the ids of successfully applied updates.
async function applyKeepUpdates(page, updates, noteName) {
  if (!updates.length) return [];
  const appliedIds = [];

  for (const update of updates) {
    // Find the checkbox in the editor modal if open, otherwise fall back to the
    // card view in the main grid (which is always rendered for visible/pinned notes).
    // Scraping already reads from card view successfully — write-back can too.
    const result = await page.evaluate(({ itemText, desiredChecked, noteName }) => {
      // Prefer open editor, fall back to note card in grid
      const editor = document.querySelector('[role="dialog"]') || document.querySelector('.oT9UPb');
      let container = editor;

      if (!container) {
        // Find the card by matching the note title textbox
        const titleEls = document.querySelectorAll('div[role="textbox"]');
        for (const t of titleEls) {
          if (t.innerText.trim() === noteName) {
            // Walk up to the card container
            container = t.parentElement?.parentElement?.parentElement?.parentElement
              || t.parentElement?.parentElement?.parentElement
              || t.parentElement;
            break;
          }
        }
      }

      if (!container) return { debug: 'no-container' };

      const checkboxes = Array.from(container.querySelectorAll('div[role="checkbox"]'));
      if (!checkboxes.length) return { debug: 'no-checkboxes' };

      const found = [];
      for (const cb of checkboxes) {
        const row      = cb.parentElement?.parentElement;
        const textSpan = row?.querySelector('span[style*="Google Sans Text"]');
        let   text     = textSpan?.innerText?.trim();

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

        // Scroll checkbox into view and return coordinates for page.mouse.click()
        cb.scrollIntoView({ behavior: 'instant', block: 'center' });
        const r = cb.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      return { debug: 'not-found', found };
    }, { itemText: update.item_text, desiredChecked: update.checked, noteName });

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

// Parse a Keep API JSON response and extract note content.
// Keep's API format isn't documented — we probe the structure and log what we find.
function parseKeepApiResponse(body, noteName) {
  try {
    const data = JSON.parse(body);
    // Log top-level keys so we can understand the shape
    console.log(`[API] Top-level keys: ${Object.keys(data).join(', ')}`);

    // Try common Keep API shapes:
    // 1. data.notes / data.items array
    // 2. data.note (single note)
    // 3. Nested arrays from sync responses
    const candidates = [
      data.note,
      data.notes?.[0],
      data.items?.[0],
      ...(Array.isArray(data) ? data : []),
    ].filter(Boolean);

    for (const note of candidates) {
      console.log(`[API] Note candidate keys: ${Object.keys(note).join(', ')}`);
      const id = slugify(noteName);
      // Text note
      if (typeof note.textContent === 'string' || typeof note.text === 'string') {
        const text = note.textContent ?? note.text ?? '';
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        console.log(`[API] Text note "${noteName}": ${lines.length} lines`);
        return { id, title: noteName, type: 'text', lines, scrapedAt: new Date().toISOString() };
      }
      // List note
      const listItems = note.listContent ?? note.items ?? note.checkListItems;
      if (Array.isArray(listItems)) {
        const items = listItems.map(item => ({
          text: item.text ?? item.value ?? item.title ?? '',
          checked: item.checked ?? item.isChecked ?? false,
        })).filter(i => i.text);
        console.log(`[API] List note "${noteName}": ${items.length} items`);
        return { id, title: noteName, type: 'checklist', items, scrapedAt: new Date().toISOString() };
      }
    }
    console.warn(`[API] Unrecognised response shape — raw (first 300): ${body.slice(0, 300)}`);
    return null;
  } catch (err) {
    console.warn(`[API] JSON parse failed: ${err.message}. Raw (first 200): ${body.slice(0, 200)}`);
    return null;
  }
}

async function scrapeKeep(page, targetNotes) {
  return page.evaluate((targetNotes) => {
    function slugify(title) {
      return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    const results = [];
    const titleElements = document.querySelectorAll('div[role="textbox"]');

    // Prefer open-editor (dialog) version of a note over card preview version
    const dialog = document.querySelector('div[role="dialog"]');
    const byTitle = {};
    titleElements.forEach((titleEl) => {
      const title = titleEl.innerText.trim();
      if (!targetNotes.includes(title)) return;
      const isEditor = dialog && dialog.contains(titleEl);
      if (!byTitle[title] || isEditor) byTitle[title] = titleEl;
    });

    Object.entries(byTitle).forEach(([title, titleEl]) => {
      const isInDialog = dialog && dialog.contains(titleEl);
      const noteContainer =
        (isInDialog ? dialog : null) ||
        titleEl.closest('[data-note]') ||
        titleEl.parentElement?.parentElement?.parentElement ||
        titleEl.parentElement?.parentElement;

      if (!noteContainer) return;

      const allCheckboxes = Array.from(noteContainer.querySelectorAll('div[role="checkbox"]'));

      if (allCheckboxes.length > 0) {
        // Checklist note.
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
        results.push({ id: slugify(title), title, type: 'checklist', items, scrapedAt: new Date().toISOString() });
      } else {
        // Plain text note — only fully readable when the editor is open
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

  // Direct note URLs (keep_note_urls config) let us open notes by navigating
  // to their hash URL instead of trying to click cards — much more reliable.
  const NOTE_URLS = await fetchKeepNoteUrls().catch(() => ({}));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_FILE });
  const page    = await context.newPage();

  // Override document.visibilityState — headless Chrome reports 'hidden' by default,
  // which some Google apps (including Keep) use to suppress user-interaction handlers.
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden',          { get: () => false,     configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

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
    // Primary method: navigate to the note's direct URL (hash-based SPA navigation)
    // which opens the editor automatically — no clicking required.
    // Fallback: card-click approach for notes without a configured URL.
    const allNotes = [];

    for (const noteName of TARGET_NOTES) {
      const noteKey = slugify(noteName);

      // Fetch any pending checkbox updates queued by the hub for this note
      const pendingUpdates = await fetchPendingKeepUpdates(noteKey);
      if (pendingUpdates.length) {
        console.log(`[${ts}] ${pendingUpdates.length} pending Keep update(s) for "${noteName}"`);
      }

      const noteUrl = NOTE_URLS[noteName];

      if (noteUrl) {
        // ── Primary path: intercept Keep's API response for this note ─────────
        // When Keep loads a note URL it fetches full note data from its backend.
        // We capture that JSON response directly — no editor dialog required.
        // Note IDs in Keep URLs look like: #LIST/1Yxhz9T... or #NOTE/1Njzl9j...
        const noteId = new URL(noteUrl).hash.replace(/^#(LIST|NOTE)\//, '');
        let capturedNote = null;

        const onResponse = async (response) => {
          const url = response.url();
          // Keep's API endpoints that return note data
          if (!url.includes('keep.google.com') && !url.includes('keep.googleapis.com')) return;
          if (!url.includes('notes') && !url.includes('list') && !url.includes('sync')) return;
          try {
            const ct = response.headers()['content-type'] || '';
            if (!ct.includes('json')) return;
            const body = await response.text();
            if (!body.includes(noteId)) return; // not this note's response
            console.log(`[${ts}] Captured API response for "${noteName}": ${url.slice(0, 80)}`);
            capturedNote = { url, body };
          } catch {}
        };
        page.on('response', onResponse);

        console.log(`[${ts}] Loading "${noteName}" to intercept API: ${noteUrl}`);
        await page.goto(noteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Wait up to 8 seconds for the API call
        for (let i = 0; i < 32 && !capturedNote; i++) await page.waitForTimeout(250);
        page.off('response', onResponse);

        // DOM fallback (API interception only works if Keep uses JSON — it uses protobuf)
        if (!capturedNote) {
          // Check if full note content is embedded in an inline <script> tag
          const inlineData = await page.evaluate((id) => {
            for (const s of document.querySelectorAll('script:not([src])')) {
              if (s.textContent.includes(id)) {
                return s.textContent.slice(0, 4000);
              }
            }
            return null;
          }, noteId);

          if (inlineData) {
            console.log(`[${ts}] Found inline script data for "${noteName}" (first 300): ${inlineData.slice(0, 300)}`);
          }

          // Wait for Keep to render as much DOM content as possible
          await page.waitForFunction(
            () => document.querySelectorAll('div[role="textbox"]').length > 0,
            { timeout: 10000, polling: 400 }
          ).catch(() => {});
          await page.waitForTimeout(2000); // extra settle for lazy-rendered content

          const scraped = await scrapeKeep(page, [noteName]);
          console.warn(`[${ts}] DOM scrape for "${noteName}": ${scraped[0]?.lines?.length ?? scraped[0]?.items?.length ?? 0} items (may be truncated)`);
          allNotes.push(...scraped);
        }

        // Apply pending checkbox updates (still need editor open for this — skip for now if no dialog)
        if (pendingUpdates.length) {
          const appliedIds = await applyKeepUpdates(page, pendingUpdates, noteName);
          if (appliedIds.length) {
            console.log(`[${ts}] Applied ${appliedIds.length} checkbox update(s) to "${noteName}"`);
            await clearPendingKeepUpdates(appliedIds);
          }
          const notApplied = pendingUpdates.filter((u) => !appliedIds.includes(u.id)).map((u) => u.id);
          if (notApplied.length) await clearPendingKeepUpdates(notApplied);
        }

      } else {
        // ── Fallback path: search + click ────────────────────────────────────
        // Used for notes not in keep_note_urls. Less reliable but keeps working
        // for notes the user hasn't configured a URL for.
        console.log(`[${ts}] No URL for "${noteName}" — trying search+click fallback`);

        const escapedName = noteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let usedSearch = false;
        let clicked = false;

        // Check if the note is visible in the grid
        const titleLocator = page.locator('div[role="textbox"]').filter({ hasText: new RegExp(`^${escapedName}$`) });
        if (await titleLocator.count() > 0) {
          await titleLocator.first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          if (pendingUpdates.length) {
            const appliedIds = await applyKeepUpdates(page, pendingUpdates, noteName);
            if (appliedIds.length) { await clearPendingKeepUpdates(appliedIds); await page.waitForTimeout(600); }
            const notApplied = pendingUpdates.filter((u) => !appliedIds.includes(u.id)).map((u) => u.id);
            if (notApplied.length) await clearPendingKeepUpdates(notApplied);
          }
          const titleBox = await titleLocator.first().boundingBox();
          if (titleBox) {
            await page.mouse.click(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height + 20);
            clicked = true;
          }
        }

        // Search fallback
        if (!clicked) {
          const searchFocused = await page.evaluate(() => {
            const input = document.querySelector('input[aria-label="Search"]');
            if (!input) return false;
            input.value = ''; input.focus(); return true;
          });
          if (searchFocused) {
            usedSearch = true;
            await page.keyboard.type(noteName, { delay: 40 });
            await page.waitForFunction(
              (name) => Array.from(document.querySelectorAll('div[role="textbox"]')).some(el => el.innerText.trim() === name),
              noteName, { timeout: 8000, polling: 300 }
            ).catch(() => {});
            if (pendingUpdates.length) {
              const appliedIds = await applyKeepUpdates(page, pendingUpdates, noteName);
              if (appliedIds.length) { await clearPendingKeepUpdates(appliedIds); await page.waitForTimeout(600); }
              const notApplied = pendingUpdates.filter((u) => !appliedIds.includes(u.id)).map((u) => u.id);
              if (notApplied.length) await clearPendingKeepUpdates(notApplied);
            }
            const srLocator = page.locator('div[role="textbox"]').filter({ hasText: new RegExp(`^${escapedName}$`) });
            if (await srLocator.count() > 0) {
              const box = await srLocator.first().boundingBox();
              if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height + 20); clicked = true; }
            }
          }
        }

        if (!clicked) {
          console.warn(`[${ts}] Note not found: "${noteName}" — skipping.`);
          if (usedSearch) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
          continue;
        }

        let dialogOpened = false;
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(250);
          dialogOpened = await page.evaluate(() => !!document.querySelector('div[role="dialog"]')).catch(() => false);
          if (dialogOpened) break;
        }
        if (!dialogOpened) console.warn(`[${ts}] Editor did not open for "${noteName}" — scraping card preview only.`);

        const scraped = await scrapeKeep(page, [noteName]);
        allNotes.push(...scraped);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
        if (usedSearch) {
          await page.waitForTimeout(400);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
        }
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
