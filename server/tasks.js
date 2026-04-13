// Family Hub - Google Tasks sync
const { google } = require('googleapis');

const LIST_NAME = 'Shopping List';

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

async function getOrCreateList(service) {
  const res = await service.tasklists.list();
  const lists = res.data.items || [];
  const existing = lists.find((l) => l.title === LIST_NAME);
  if (existing) return existing.id;

  const created = await service.tasklists.insert({ requestBody: { title: LIST_NAME } });
  console.log(`[Tasks] Created task list "${LIST_NAME}".`);
  return created.data.id;
}

module.exports = { syncTasks };
