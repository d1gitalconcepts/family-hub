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

// Parse Keep's sync data (captured from updateUserInfoFromInitialSyncRead calls)
// and extract the target note's content. Logs structure to aid debugging.
function parseKeepSyncData(captures, noteName, noteId) {
  const id = slugify(noteName);

  for (const data of captures) {
    // Keep's sync response has a top-level "notes" array (or "nodes" in newer versions)
    const notesArray = data.notes ?? data.nodes ?? data.items ?? [];
    if (!Array.isArray(notesArray) || !notesArray.length) continue;

    console.log(`[Sync] notes array length: ${notesArray.length}, first note keys: ${Object.keys(notesArray[0] || {}).join(', ')}`);

    // Find our note by ID match or title match
    const note = notesArray.find((n) => {
      const nId = n.serverId ?? n.id ?? n.noteId ?? '';
      return nId === noteId || nId.includes(noteId) || noteId.includes(nId);
    }) ?? notesArray.find((n) => {
      const title = n.title ?? n.name ?? '';
      return title.trim() === noteName;
    });

    if (!note) {
      console.log(`[Sync] Note "${noteName}" not found in this capture (IDs: ${notesArray.slice(0,3).map(n=>n.serverId??n.id??'?').join(', ')}...)`);
      continue;
    }

    console.log(`[Sync] Found note "${noteName}" — keys: ${Object.keys(note).join(', ')}`);

    // Text note
    const text = note.textContent ?? note.text ?? note.body ?? '';
    if (typeof text === 'string' && text.trim()) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      console.log(`[Sync] Text note "${noteName}": ${lines.length} lines`);
      return { id, title: noteName, type: 'text', lines, scrapedAt: new Date().toISOString() };
    }

    // Checklist note
    const listItems = note.listContent ?? note.items ?? note.listItems ?? note.checkListItems ?? [];
    if (Array.isArray(listItems) && listItems.length) {
      const items = listItems.map(item => ({
        text:    item.text ?? item.value ?? item.title ?? '',
        checked: item.checked ?? item.isChecked ?? false,
      })).filter(i => i.text.trim());
      console.log(`[Sync] Checklist note "${noteName}": ${items.length} items`);
      return { id, title: noteName, type: 'checklist', items, scrapedAt: new Date().toISOString() };
    }

    console.warn(`[Sync] Found note but unrecognised content shape — keys: ${Object.keys(note).join(', ')}`);
  }

  return null;
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

      // Start with checkboxes visible in the shallow noteContainer, then try
      // to expand by walking up from document.activeElement. When a note is
      // opened via its URL, Keep renders the FULL checklist in the DOM — the
      // checked-items section is often in a parent element above noteContainer.
      let allCheckboxes = Array.from(noteContainer.querySelectorAll('div[role="checkbox"]'));

      const activeEl = document.activeElement;
      if (activeEl && activeEl.isContentEditable) {
        let el = activeEl.parentElement;
        while (el && el !== document.body && el !== document.documentElement) {
          const cbs = el.querySelectorAll('div[role="checkbox"]');
          if (cbs.length > allCheckboxes.length) {
            // Only use this wider container if it still contains our note's title
            const hasTitleEl = [...el.querySelectorAll('div[role="textbox"]')]
              .some((t) => t.innerText.trim() === title);
            if (hasTitleEl) allCheckboxes = Array.from(cbs);
          }
          el = el.parentElement;
        }
      }

      if (allCheckboxes.length > 0) {
        // Checklist note.
        // Always include ALL unchecked items, then fill up to TOTAL_ITEM_CAP
        // with the most-recent checked items.
        const TOTAL_ITEM_CAP = 50;
        const unchecked     = allCheckboxes.filter((cb) => cb.getAttribute('aria-checked') !== 'true');
        const recentChecked = allCheckboxes
          .filter((cb) => cb.getAttribute('aria-checked') === 'true')
          .slice(0, Math.max(0, TOTAL_ITEM_CAP - unchecked.length));
        const checkboxItems = [...unchecked, ...recentChecked];

        const items = [];
        checkboxItems.forEach((checkbox) => {
          const checked = checkbox.getAttribute('aria-checked') === 'true';
          const row     = checkbox.parentElement?.parentElement;
          let text = '';
          // Strategy 1: Google Sans Text span (card view)
          text = row?.querySelector('span[style*="Google Sans Text"]')?.innerText?.trim() || '';
          // Strategy 2: contenteditable in the row (focused / editor view)
          if (!text) text = row?.querySelector('[contenteditable="true"]')?.innerText?.trim() || '';
          // Strategy 3: clone row and strip the checkbox element
          if (!text && row) {
            const clone = row.cloneNode(true);
            clone.querySelector('[role="checkbox"]')?.remove();
            text = clone.innerText?.trim() || '';
          }
          if (text) items.push({ text, checked });
        });
        results.push({ id: slugify(title), title, type: 'checklist', items, scrapedAt: new Date().toISOString() });
      } else {
        // Plain text note
        const lines = [];

        // When Keep opens a note via URL it focuses the body in-place —
        // document.activeElement becomes the contenteditable with ALL lines.
        // This works even when no dialog/modal is present.
        const activeEl = document.activeElement;
        if (activeEl?.isContentEditable) {
          const t = activeEl.innerText?.trim() ?? '';
          if (t && t !== title) {
            t.split('\n').forEach((l) => {
              const trimmed = l.trim();
              if (trimmed && trimmed !== title) lines.push(trimmed);
            });
          }
        }

        // If active element didn't give us content, try any contenteditable in
        // the dialog or note container (handles click-to-open editor dialog too).
        if (!lines.length) {
          const container = document.querySelector('div[role="dialog"]') || noteContainer;
          const editables = Array.from(container.querySelectorAll('[contenteditable="true"]'));
          const bodyEditable =
            editables.find((el) => {
              const t = el.innerText.trim();
              return t && t !== title;
            }) ||
            editables[1];

          if (bodyEditable) {
            bodyEditable.innerText.split('\n').forEach((l) => {
              const trimmed = l.trim();
              if (trimmed && trimmed !== title) lines.push(trimmed);
            });
          }
        }

        // Final fallback: span-based selector (card preview — may be truncated)
        if (!lines.length) {
          const textSpans = noteContainer.querySelectorAll('span[style*="Google Sans Text"]');
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

  // Run headless unless a DISPLAY is set (e.g. via xvfb-run --auto-servernum).
  // Keep's editor dialog requires a real (or virtual) display to open.
  const headless = !process.env.DISPLAY;
  if (!headless) console.log(`[${ts}] Running non-headless (DISPLAY=${process.env.DISPLAY})`);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: SESSION_FILE });

  // Apply visibility overrides to every page opened from this context.
  // Headless Chrome reports document.hidden = true which can suppress Keep's
  // animations and event handlers; we force it to appear visible.
  await context.addInitScript(() => {
    Object.defineProperty(document, 'hidden',          { get: () => false,     configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  });

  // Main page — used for session check and fallback (no-URL) notes.
  const page = await context.newPage();

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
        // ── Primary path: fresh tab → Keep home → hash-navigate → click → scrape
        console.log(`[${ts}] Opening "${noteName}" in fresh tab`);
        const notePage = await context.newPage();

        try {
          // Navigate directly to the note URL.
          // Keep processes the hash and opens the note in an editable focused-card
          // state — NOT a dialog modal. The note body becomes document.activeElement
          // (a contenteditable div) with ALL lines present, including those beyond
          // the card's visual height limit.
          await notePage.goto(noteUrl, { waitUntil: 'load', timeout: 30000 });
          await notePage.bringToFront();

          // Wait for Keep to finish loading and focus the note content.
          // Poll for a non-title contenteditable becoming active (the note body).
          let focusedEditable = false;
          for (let i = 0; i < 24 && !focusedEditable; i++) {
            await notePage.waitForTimeout(250);
            focusedEditable = await notePage.evaluate((title) => {
              const a = document.activeElement;
              if (!a || !a.isContentEditable) return false;
              const t = a.innerText?.trim() ?? '';
              return t.length > 0 && t !== title;
            }, noteName).catch(() => false);
          }

          const activeInfo = await notePage.evaluate((title) => {
            const a = document.activeElement;
            const editorOpen = !!document.querySelector('div[role="dialog"]');
            return {
              editorOpen,
              editable:   a?.isContentEditable ?? false,
              tag:        a?.tagName ?? '?',
              lineCount:  a?.isContentEditable
                ? (a.innerText?.split('\n').filter(l => l.trim()).length ?? 0)
                : 0,
              preview:    a?.innerText?.trim()?.slice(0, 80) ?? '',
            };
          }, noteName).catch(() => ({}));

          console.log(
            `[${ts}] "${noteName}": dialog=${activeInfo.editorOpen} focusedEditable=${activeInfo.editable}` +
            ` lines≈${activeInfo.lineCount} preview="${activeInfo.preview?.slice(0, 40)}"`
          );

          // Ensure note textboxes are present before scraping
          await notePage.waitForFunction(
            () => document.querySelectorAll('div[role="textbox"]').length > 0,
            { timeout: 8000, polling: 300 }
          ).catch(() => {});

          const scraped = await scrapeKeep(notePage, [noteName]);
          const itemCount = scraped[0]?.lines?.length ?? scraped[0]?.items?.length ?? 0;
          console.log(`[${ts}] Scraped "${noteName}": ${itemCount} item(s)`);
          allNotes.push(...scraped);

          // Apply pending checkbox updates while the editor is open
          if (pendingUpdates.length) {
            const appliedIds = await applyKeepUpdates(notePage, pendingUpdates, noteName);
            if (appliedIds.length) {
              console.log(`[${ts}] Applied ${appliedIds.length} checkbox update(s) to "${noteName}"`);
              await clearPendingKeepUpdates(appliedIds);
            }
            const notApplied = pendingUpdates.filter((u) => !appliedIds.includes(u.id)).map((u) => u.id);
            if (notApplied.length) await clearPendingKeepUpdates(notApplied);
          }
        } finally {
          await notePage.close();
        }

      } else {
        // ── Fallback path: search + click on main page ────────────────────────
        // Used for notes not yet configured with a URL in Hub Settings.
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
