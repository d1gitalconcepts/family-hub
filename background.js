// Family Hub - Background Service Worker (ES module)
// Receives scraped notes from the content script, detects changes,
// and persists data to chrome.storage.local.

import { writeNotes, appendError, readEndpoint } from './storage.js';

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'NOTES_SCRAPED') {
    handleNotesScrape(message.data, message.timestamp)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === 'SCRAPE_ERROR') {
    appendError(message.error)
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ---------------------------------------------------------------------------
// Core: persist notes if changed, then optionally forward to local endpoint
// ---------------------------------------------------------------------------

async function handleNotesScrape(notes, timestamp) {
  const written = await writeNotes(notes, timestamp);
  if (!written) return; // nothing changed

  const endpoint = await readEndpoint();
  if (endpoint) {
    await postToEndpoint(endpoint, notes, timestamp);
  }
}

async function postToEndpoint(url, notes, timestamp) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, timestamp }),
    });
  } catch (err) {
    // Endpoint is optional — log but don't surface as a scrape error
    console.warn('[Family Hub] Local endpoint POST failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Alarms — wake the service worker periodically so it stays responsive
// ---------------------------------------------------------------------------

chrome.alarms.create('keepalive', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    // No-op: the act of waking the worker is the point.
    // Future: could check if the Keep tab is alive and request a re-scrape.
  }
});
