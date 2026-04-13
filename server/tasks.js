// Family Hub - Google Tasks sync
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const LIST_NAME = 'Shopping List';
const IDS_FILE = path.join(__dirname, '.ids.json');

async function syncTasks(authClient, items) {
  const service = google.tasks({ version: 'v1', auth: authClient });

  const listId = await getOrCreateList(service);

  // Delete all existing tasks
  const existing = await service.tasks.list({ tasklist: listId, showCompleted: true, showHidden: true });
  const toDelete = existing.data.items || [];
  await Promise.all(toDelete.map((t) => service.tasks.delete({ tasklist: listId, task: t.id })));

  // Recreate from current data — unchecked first, then checked
  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  for (const item of [...unchecked, ...checked]) {
    await service.tasks.insert({
      tasklist: listId,
      requestBody: {
        title: item.text,
        status: item.checked ? 'completed' : 'needsAction',
      },
    });
  }

  console.log(`[Tasks] Synced ${items.length} items (${unchecked.length} remaining).`);
}

// ---------------------------------------------------------------------------
// List lookup — store the ID on disk after first find/create so we never
// search by name again (prevents duplicate list creation on rapid syncs)
// ---------------------------------------------------------------------------

function readIds() {
  if (fs.existsSync(IDS_FILE)) return JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
  return {};
}

function saveId(key, id) {
  const ids = readIds();
  ids[key] = id;
  fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
}

async function getOrCreateList(service) {
  const ids = readIds();
  if (ids.shoppingListId) return ids.shoppingListId;

  const res = await service.tasklists.list();
  const lists = res.data.items || [];
  const existing = lists.find((l) => l.title === LIST_NAME);

  if (existing) {
    saveId('shoppingListId', existing.id);
    return existing.id;
  }

  const created = await service.tasklists.insert({ requestBody: { title: LIST_NAME } });
  console.log(`[Tasks] Created task list "${LIST_NAME}".`);
  saveId('shoppingListId', created.data.id);
  return created.data.id;
}

module.exports = { syncTasks };
