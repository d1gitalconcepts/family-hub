// Family Hub - Google Tasks sync + pending updates applier
// Depends on: google-api.js, supabase-ext.js, storage.js

const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';
const LIST_NAME  = 'Shopping List';

// ── Task list lookup ─────────────────────────────────────────────────────────

async function getOrCreateShoppingList() {
  const ids = await getGoogleIds();
  if (ids.shoppingListId) return ids.shoppingListId;

  const res    = await googleGet(`${TASKS_BASE}/users/@me/lists`);
  const lists  = res.items || [];
  const existing = lists.find((l) => l.title === LIST_NAME);

  if (existing) {
    await saveGoogleId('shoppingListId', existing.id);
    return existing.id;
  }

  const created = await googlePost(`${TASKS_BASE}/users/@me/lists`, { title: LIST_NAME });
  console.log(`[Tasks] Created task list "${LIST_NAME}".`);
  await saveGoogleId('shoppingListId', created.id);
  return created.id;
}

// ── Main sync ────────────────────────────────────────────────────────────────

async function syncTasks(items) {
  const listId = await getOrCreateShoppingList();

  // Delete all existing tasks
  const existing = await googleGet(
    `${TASKS_BASE}/lists/${listId}/tasks?showCompleted=true&showHidden=true`
  );
  const toDelete = existing.items || [];
  await Promise.all(
    toDelete.map((t) => googleDelete(`${TASKS_BASE}/lists/${listId}/tasks/${t.id}`))
  );

  // Recreate — unchecked first, then checked
  const ordered = [
    ...items.filter((i) => !i.checked),
    ...items.filter((i) =>  i.checked),
  ];
  for (const item of ordered) {
    await googlePost(`${TASKS_BASE}/lists/${listId}/tasks`, {
      title:  item.text,
      status: item.checked ? 'completed' : 'needsAction',
    });
  }

  console.log(`[Tasks] Synced ${items.length} items (${ordered.filter(i => !i.checked).length} remaining).`);

  // Mirror to Supabase
  await sbUpsert('task_lists', [{
    list_id:    listId,
    list_name:  LIST_NAME,
    items:      items.map((i) => ({ text: i.text, checked: i.checked, google_task_id: null })),
    updated_at: new Date().toISOString(),
  }]);
}

// ── Pending updates (hub checkbox → Google Tasks) ────────────────────────────

async function applyPendingUpdates() {
  if (!(await isAuthenticated())) return;

  let updates;
  try {
    updates = await sbSelect('pending_updates', { applied_at: 'is.null', select: '*' });
  } catch (err) {
    console.warn('[Tasks] Could not fetch pending updates:', err.message);
    return;
  }

  if (!updates.length) return;

  for (const update of updates) {
    try {
      await googlePatch(
        `${TASKS_BASE}/lists/${update.list_id}/tasks/${update.task_id}`,
        { status: update.checked ? 'completed' : 'needsAction' }
      );
      await sbUpdate(
        'pending_updates',
        { id: `eq.${update.id}` },
        { applied_at: new Date().toISOString() }
      );
      console.log(`[Tasks] Applied pending update ${update.id}`);
    } catch (err) {
      console.warn(`[Tasks] Failed to apply update ${update.id}:`, err.message);
    }
  }
}
