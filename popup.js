// Family Hub - Popup
// Reads note data from storage and renders it live.
// storage.js is loaded first by popup.html, so all storage helpers are global.

const statusLine     = document.getElementById('status-line');
const errorBanner    = document.getElementById('error-banner');
const notesContainer = document.getElementById('notes-container');
const authStatus     = document.getElementById('auth-status');
const authBtn        = document.getElementById('auth-btn');

// ---------------------------------------------------------------------------
// Render notes
// ---------------------------------------------------------------------------

async function render() {
  const [notes, lastSync, errors] = await Promise.all([
    readNotes(),
    readLastSync(),
    readErrors(),
  ]);

  if (lastSync) {
    const d = new Date(lastSync);
    statusLine.textContent = `Last synced: ${d.toLocaleTimeString()} — ${d.toLocaleDateString()}`;
  } else {
    statusLine.textContent = 'Not yet synced. Open Google Keep to start.';
  }

  if (errors.length > 0) {
    errorBanner.style.display = 'block';
    errorBanner.textContent = `${errors.length} scrape error(s) — last: ${errors[0].message}`;
  } else {
    errorBanner.style.display = 'none';
  }

  notesContainer.innerHTML = '';

  if (notes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No notes synced yet. Make sure Google Keep is open.';
    notesContainer.appendChild(empty);
    return;
  }

  notes.forEach((note) => {
    const card = document.createElement('div');
    card.className = 'note-card';

    const titleEl = document.createElement('div');
    titleEl.className = 'note-title';
    titleEl.textContent = note.title;
    card.appendChild(titleEl);

    if (note.type === 'checklist') {
      const unchecked = note.items.filter((i) => !i.checked);
      const checked   = note.items.filter((i) =>  i.checked);

      const meta = document.createElement('div');
      meta.className = 'note-meta';
      meta.textContent = `${unchecked.length} remaining / ${note.items.length} total`;
      card.appendChild(meta);

      const list = document.createElement('ul');
      list.className = 'item-list';
      unchecked.forEach((item) => list.appendChild(buildListItem(item.text, false)));
      card.appendChild(list);

      if (checked.length > 0) {
        const checkedList = document.createElement('ul');
        checkedList.className = 'item-list';
        checked.slice(0, 2).forEach((item) => checkedList.appendChild(buildListItem(item.text, true)));
        card.appendChild(checkedList);
        if (checked.length > 2) {
          const more = document.createElement('p');
          more.className = 'overflow-note';
          more.textContent = `+ ${checked.length - 2} more checked`;
          card.appendChild(more);
        }
      }
    } else {
      const isTruncated = note.lines[note.lines.length - 1] === '…';
      const meta = document.createElement('div');
      meta.className = 'note-meta';
      meta.textContent = `${note.lines.length} line(s)${isTruncated ? ' — truncated by Keep' : ''}`;
      card.appendChild(meta);

      const list = document.createElement('ul');
      list.className = 'item-list';
      note.lines.forEach((line) => list.appendChild(buildListItem(line, false)));
      card.appendChild(list);

      if (isTruncated) {
        const warn = document.createElement('p');
        warn.className = 'overflow-note';
        warn.textContent = '⚠ Open this note in Keep to sync all content.';
        card.appendChild(warn);
      }
    }

    notesContainer.appendChild(card);
  });
}

function buildListItem(text, isChecked) {
  const li   = document.createElement('li');
  if (isChecked) li.className = 'checked';
  const icon  = document.createElement('span');
  icon.textContent = isChecked ? '☑' : '☐';
  const label = document.createElement('span');
  label.textContent = text;
  li.appendChild(icon);
  li.appendChild(label);
  return li;
}

// ---------------------------------------------------------------------------
// Auth status
// ---------------------------------------------------------------------------

async function refreshAuthUI() {
  chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
    const connected = response?.authenticated;
    authStatus.textContent = connected ? 'Connected to Google' : 'Not connected';
    authStatus.style.color = connected ? '#188038' : '#5f6368';
    authBtn.textContent    = connected ? 'Disconnect' : 'Connect to Google';
    authBtn.className      = connected ? 'disconnect' : '';
  });
}

authBtn.addEventListener('click', () => {
  const isDisconnect = authBtn.classList.contains('disconnect');
  authBtn.disabled = true;
  authBtn.textContent = '…';

  const msgType = isDisconnect ? 'REVOKE_AUTH' : 'LAUNCH_OAUTH';
  chrome.runtime.sendMessage({ type: msgType }, (response) => {
    authBtn.disabled = false;
    if (!response?.ok && response?.error) {
      authStatus.textContent = `Error: ${response.error}`;
      authStatus.style.color = '#c5221f';
    }
    refreshAuthUI();
  });
});

// ---------------------------------------------------------------------------
// Init + live updates
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  await render();
  await refreshAuthUI();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[KEYS.NOTES] || changes[KEYS.ERRORS])) {
      render();
    }
  });
});
