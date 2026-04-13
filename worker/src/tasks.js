import { googleGet, googlePost, googlePatch, googleDelete } from './google-api.js';
import { sbUpsert, sbSelect, sbUpdate, getConfigValue, setConfigValue } from './supabase.js';

const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';
const LIST_NAME  = 'Shopping List';

// ── Shopping list lookup ──────────────────────────────────────────────────────

async function getOrCreateShoppingList(env) {
  const cached = await getConfigValue(env, 'shopping_list_id');
  if (cached) return cached;

  const res      = await googleGet(env, `${TASKS_BASE}/users/@me/lists`);
  const lists    = res.items || [];
  const existing = lists.find((l) => l.title === LIST_NAME);

  if (existing) {
    await setConfigValue(env, 'shopping_list_id', existing.id);
    return existing.id;
  }

  const created = await googlePost(env, `${TASKS_BASE}/users/@me/lists`, { title: LIST_NAME });
  console.log(`[Tasks] Created task list "${LIST_NAME}".`);
  await setConfigValue(env, 'shopping_list_id', created.id);
  return created.id;
}

// ── Sync shopping list from Supabase notes → Google Tasks (diff-based) ───────
// Only creates/deletes/patches what actually changed to stay within
// Cloudflare Workers' free-tier subrequest limit.

export async function syncTasksFromNote(env, items) {
  const listId  = await getOrCreateShoppingList(env);
  const current = await googleGet(env,
    `${TASKS_BASE}/lists/${listId}/tasks?showCompleted=true&showHidden=true`
  );
  const currentTasks = current.items || [];

  const currentByTitle = new Map(currentTasks.map((t) => [t.title, t]));
  const desiredTitles  = new Set(items.map((i) => i.text));

  // Delete tasks that are no longer in the note
  const toDelete = currentTasks.filter((t) => !desiredTitles.has(t.title));
  await Promise.all(
    toDelete.map((t) => googleDelete(env, `${TASKS_BASE}/lists/${listId}/tasks/${t.id}`))
  );

  // Create new items or patch status on existing ones
  let created = 0, patched = 0;
  for (const item of items) {
    const desired = item.checked ? 'completed' : 'needsAction';
    const existing = currentByTitle.get(item.text);
    if (!existing) {
      await googlePost(env, `${TASKS_BASE}/lists/${listId}/tasks`, {
        title: item.text, status: desired,
      });
      created++;
    } else if (existing.status !== desired) {
      await googlePatch(env, `${TASKS_BASE}/lists/${listId}/tasks/${existing.id}`, {
        status: desired,
      });
      patched++;
    }
  }

  if (toDelete.length || created || patched) {
    console.log(`[Tasks] Shopping sync: +${created} created, ~${patched} patched, -${toDelete.length} deleted.`);
  } else {
    console.log('[Tasks] Shopping list unchanged, no Google Tasks updates needed.');
  }
}

// ── Poll all Google Task lists → Supabase ────────────────────────────────────

export async function pollAllTaskLists(env) {
  const res   = await googleGet(env, `${TASKS_BASE}/users/@me/lists`);
  const lists = res.items || [];

  const rows = [];
  for (const list of lists) {
    try {
      const tasks = await googleGet(env,
        `${TASKS_BASE}/lists/${list.id}/tasks?showCompleted=true&showHidden=true`
      );
      const items = (tasks.items || []).map((t) => ({
        text:           t.title,
        checked:        t.status === 'completed',
        google_task_id: t.id,
      }));
      rows.push({
        list_id:    list.id,
        list_name:  list.title,
        items,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`[Tasks] Failed to poll "${list.title}":`, err.message);
    }
  }

  if (rows.length) await sbUpsert(env, 'task_lists', rows);
  console.log(`[Tasks] Polled ${rows.length} task list(s).`);
}

// ── Apply pending checkbox updates → Google Tasks ────────────────────────────

export async function applyPendingUpdates(env) {
  let updates;
  try {
    updates = await sbSelect(env, 'pending_updates', { applied_at: 'is.null', select: '*' });
  } catch (err) {
    console.warn('[Tasks] Could not fetch pending updates:', err.message);
    return;
  }

  if (!updates.length) return;

  for (const update of updates) {
    try {
      await googlePatch(env,
        `${TASKS_BASE}/lists/${update.list_id}/tasks/${update.task_id}`,
        { status: update.checked ? 'completed' : 'needsAction' }
      );
      await sbUpdate(env,
        'pending_updates',
        { id: `eq.${update.id}` },
        { applied_at: new Date().toISOString() }
      );
      console.log(`[Tasks] Applied update ${update.id}`);
    } catch (err) {
      console.warn(`[Tasks] Failed to apply update ${update.id}:`, err.message);
    }
  }
}
