// Family Hub - Popup (ES module)
// Reads note data from storage and renders it live.

import { KEYS, readNotes, readLastSync, readErrors } from './storage.js';

const statusLine = document.getElementById('status-line');
const errorBanner = document.getElementById('error-banner');
const notesContainer = document.getElementById('notes-container');

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function render() {
  const [notes, lastSync, errors] = await Promise.all([
    readNotes(),
    readLastSync(),
    readErrors(),
  ]);

  // Status line
  if (lastSync) {
    const d = new Date(lastSync);
    statusLine.textContent = `Last synced: ${d.toLocaleTimeString()} — ${d.toLocaleDateString()}`;
  } else {
    statusLine.textContent = 'Not yet synced. Open Google Keep to start.';
  }

  // Error banner
  if (errors.length > 0) {
    errorBanner.style.display = 'block';
    errorBanner.textContent = `${errors.length} scrape error(s) — last: ${errors[0].message}`;
  } else {
    errorBanner.style.display = 'none';
  }

  // Notes
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
      const checked = note.items.filter((i) => i.checked);
      const total = note.items.length;

      const meta = document.createElement('div');
      meta.className = 'note-meta';
      meta.textContent = `${unchecked.length} remaining / ${total} total`;
      card.appendChild(meta);

      const list = document.createElement('ul');
      list.className = 'item-list';

      // Show up to 5 unchecked items
      const shown = unchecked.slice(0, 5);
      shown.forEach((item) => {
        const li = buildListItem(item.text, false);
        list.appendChild(li);
      });

      if (unchecked.length > 5) {
        const overflow = document.createElement('p');
        overflow.className = 'overflow-note';
        overflow.textContent = `+ ${unchecked.length - 5} more unchecked`;
        card.appendChild(list);
        card.appendChild(overflow);
      } else {
        card.appendChild(list);
      }

      // Show up to 2 checked items (collapsed feel)
      if (checked.length > 0) {
        const checkedList = document.createElement('ul');
        checkedList.className = 'item-list';
        checked.slice(0, 2).forEach((item) => {
          const li = buildListItem(item.text, true);
          checkedList.appendChild(li);
        });
        if (checked.length > 2) {
          const more = document.createElement('p');
          more.className = 'overflow-note';
          more.textContent = `+ ${checked.length - 2} more checked`;
          card.appendChild(checkedList);
          card.appendChild(more);
        } else {
          card.appendChild(checkedList);
        }
      }

    } else {
      // Plain text note
      const meta = document.createElement('div');
      meta.className = 'note-meta';
      meta.textContent = `${note.lines.length} line(s)`;
      card.appendChild(meta);

      const list = document.createElement('ul');
      list.className = 'item-list';
      note.lines.slice(0, 5).forEach((line) => {
        const li = buildListItem(line, false);
        list.appendChild(li);
      });
      card.appendChild(list);

      if (note.lines.length > 5) {
        const overflow = document.createElement('p');
        overflow.className = 'overflow-note';
        overflow.textContent = `+ ${note.lines.length - 5} more lines`;
        card.appendChild(overflow);
      }
    }

    notesContainer.appendChild(card);
  });
}

function buildListItem(text, isChecked) {
  const li = document.createElement('li');
  if (isChecked) li.className = 'checked';

  const icon = document.createElement('span');
  icon.className = 'check-icon';
  icon.textContent = isChecked ? '☑' : '☐';

  const label = document.createElement('span');
  label.textContent = text;

  li.appendChild(icon);
  li.appendChild(label);
  return li;
}

// ---------------------------------------------------------------------------
// Init + live updates
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  await render();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[KEYS.NOTES] || changes[KEYS.ERRORS])) {
      render();
    }
  });
});
