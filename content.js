// Family Hub - Google Keep Content Script
// Scrapes target notes and forwards data to the background service worker.

// ---------------------------------------------------------------------------
// CONFIG — add the exact titles of the notes you want to sync
// ---------------------------------------------------------------------------
const TARGET_NOTES = [
  "Shopping List",
  "Meal Planning",
  // Add more note titles here as needed
];

// ---------------------------------------------------------------------------
// SCRAPER
// ---------------------------------------------------------------------------

function scrapeNotes() {
  const results = [];
  const seen = new Set(); // deduplicate notes that appear multiple times in the DOM
  const titleElements = document.querySelectorAll('div[role="textbox"]');

  titleElements.forEach((titleEl) => {
    const title = titleEl.innerText.trim();
    if (!TARGET_NOTES.includes(title)) return;
    if (seen.has(title)) return; // skip duplicate DOM entries (e.g. pinned + list)
    seen.add(title);

    // Walk up to find the note's root container
    const noteContainer =
      titleEl.closest('[data-note]') ||
      titleEl.parentElement?.parentElement?.parentElement ||
      titleEl.parentElement?.parentElement;

    if (!noteContainer) {
      console.warn(`[Family Hub] Could not find container for note: "${title}"`);
      return;
    }

    const checkboxItems = noteContainer.querySelectorAll('div[role="checkbox"]');

    if (checkboxItems.length > 0) {
      // --- CHECKLIST NOTE ---
      const items = [];

      checkboxItems.forEach((checkbox) => {
        const checked = checkbox.getAttribute('aria-checked') === 'true';

        // The text span is a sibling of the checkbox container, so we go up
        // to the grandparent (the row) to find it.
        // Fallback: take innerText of the row minus the checkbox element's text.
        const row = checkbox.parentElement?.parentElement;
        const textSpan = row?.querySelector('span[style*="Google Sans Text"]');
        const text = textSpan?.innerText?.trim() || extractRowText(row, checkbox);

        if (text) {
          items.push({ text, checked });
        }
      });

      results.push({
        id: slugify(title),
        title,
        type: 'checklist',
        items,
        scrapedAt: new Date().toISOString(),
      });

    } else {
      // --- PLAIN TEXT NOTE ---
      const textSpans = noteContainer.querySelectorAll('span[style*="Google Sans Text"]');
      const lines = [];

      if (textSpans.length > 0) {
        textSpans.forEach((span) => {
          const text = span.innerText.trim();
          if (text) lines.push(text);
        });
      } else {
        // Fallback: grab all non-empty text nodes directly inside the container
        noteContainer.querySelectorAll('span, div').forEach((el) => {
          if (el.children.length === 0) {
            const text = el.innerText?.trim();
            if (text && text !== title) lines.push(text);
          }
        });
      }

      results.push({
        id: slugify(title),
        title,
        type: 'text',
        lines,
        scrapedAt: new Date().toISOString(),
      });
    }
  });

  return results;
}

// Fallback: extract text from a row element, ignoring the checkbox itself
function extractRowText(rowEl, checkboxEl) {
  if (!rowEl) return '';
  const clone = rowEl.cloneNode(true);
  // Remove the first checkbox-role element from the clone
  const cb = clone.querySelector('[role="checkbox"]');
  if (cb) cb.remove();
  return clone.innerText?.trim() || '';
}

function slugify(title) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// SEND TO BACKGROUND — with retry on service worker wake-up delay
// ---------------------------------------------------------------------------

function sendToBackground(notes, attempt = 0) {
  if (!isContextValid()) return;

  chrome.runtime.sendMessage(
    { type: 'NOTES_SCRAPED', data: notes, timestamp: new Date().toISOString() },
    (response) => {
      if (chrome.runtime.lastError) {
        if (attempt < 3) {
          setTimeout(() => sendToBackground(notes, attempt + 1), 500 * (attempt + 1));
        } else {
          console.warn('[Family Hub] Could not reach background worker after retries.');
        }
      }
    }
  );
}

function sendErrorToBackground(message) {
  if (!isContextValid()) return;
  chrome.runtime.sendMessage({ type: 'SCRAPE_ERROR', error: message });
}

// Detect if the extension context has been invalidated (e.g. after an update)
function isContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// RUNNER — wait for Keep to render, then attach a MutationObserver
// ---------------------------------------------------------------------------

let debounceTimer = null;
let isScrapePending = false;
let observer = null;

function runScrape() {
  if (isScrapePending) return;
  isScrapePending = true;

  try {
    const notes = scrapeNotes();
    sendToBackground(notes);
  } catch (err) {
    sendErrorToBackground(err.message);
    console.error('[Family Hub] Scrape error:', err);
  } finally {
    isScrapePending = false;
  }
}

function attachObserver() {
  if (observer) return; // already attached

  observer = new MutationObserver(() => {
    if (!isContextValid()) {
      observer.disconnect();
      observer = null;
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runScrape, 600);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  console.log('[Family Hub] MutationObserver attached.');
}

function waitForKeepToLoad(attempts = 0) {
  const maxAttempts = 20;
  const titleElements = document.querySelectorAll('div[role="textbox"]');

  if (titleElements.length > 0) {
    console.log('[Family Hub] Keep loaded. Running initial scrape...');
    runScrape();
    attachObserver();
  } else if (attempts < maxAttempts) {
    setTimeout(() => waitForKeepToLoad(attempts + 1), 500);
  } else {
    console.warn('[Family Hub] Keep did not load in time. Try refreshing.');
  }
}

// ---------------------------------------------------------------------------
// ENTRY POINT
// ---------------------------------------------------------------------------

waitForKeepToLoad();
