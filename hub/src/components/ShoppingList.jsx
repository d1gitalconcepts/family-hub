import { useState } from 'react';
import { useTaskLists } from '../hooks/useTaskLists';
import { useConfig } from '../hooks/useConfig';
import { supabase } from '../supabaseClient';
import StatusBar from './StatusBar';

export default function ShoppingList() {
  const taskLists  = useTaskLists();
  const [listConfig] = useConfig('visible_task_lists');
  // optimistic overrides keyed by `${listId}:${google_task_id||text}`
  const [optimistic, setOptimistic] = useState({});

  // Build visible list order from config; fall back to all lists
  const configured = listConfig || [];
  let visibleLists;
  if (configured.length === 0) {
    visibleLists = taskLists.map((l) => ({ ...l, displayName: l.list_name }));
  } else {
    visibleLists = configured
      .filter((c) => c.visible !== false)
      .map((c) => {
        const list = taskLists.find((l) => l.list_id === c.list_id);
        if (!list) return null;
        return { ...list, displayName: c.name || list.list_name };
      })
      .filter(Boolean);
  }

  async function toggleItem(listId, item) {
    const key        = `${listId}:${item.google_task_id || item.text}`;
    const newChecked = !(optimistic[key] ?? item.checked);
    setOptimistic((prev) => ({ ...prev, [key]: newChecked }));

    const { error } = await supabase.from('pending_updates').insert({
      list_id: listId,
      task_id: item.google_task_id || item.text,
      checked: newChecked,
    });
    if (error) {
      console.warn('[Hub] Failed to queue update:', error.message);
      setOptimistic((prev) => ({ ...prev, [key]: item.checked }));
    }
  }

  return (
    <div className="sidebar">
      {visibleLists.length === 0 && (
        <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
          No lists configured. Open Settings to choose lists.
        </div>
      )}

      {visibleLists.map((list) => {
        const items     = list.items || [];
        const unchecked = items.filter((i) => !(optimistic[`${list.list_id}:${i.google_task_id || i.text}`] ?? i.checked));
        const checked   = items.filter((i) =>  (optimistic[`${list.list_id}:${i.google_task_id || i.text}`] ?? i.checked));

        return (
          <div key={list.list_id} className="task-list-section">
            <div className="sidebar-header">
              {list.displayName}
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {unchecked.length} left
              </span>
            </div>

            <div className="task-list">
              {unchecked.map((item) => (
                <TaskItem
                  key={item.google_task_id || item.text}
                  item={item}
                  checked={false}
                  onToggle={() => toggleItem(list.list_id, item)}
                />
              ))}

              {checked.length > 0 && (
                <>
                  <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Done
                  </div>
                  {checked.map((item) => (
                    <TaskItem
                      key={item.google_task_id || item.text}
                      item={item}
                      checked={true}
                      onToggle={() => toggleItem(list.list_id, item)}
                    />
                  ))}
                </>
              )}

              {items.length === 0 && (
                <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                  No items.
                </div>
              )}
            </div>
          </div>
        );
      })}

      <StatusBar />
    </div>
  );
}

function TaskItem({ item, checked, onToggle }) {
  return (
    <div className={`task-item${checked ? ' done' : ''}`} onClick={onToggle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
      />
      <span>{item.text}</span>
    </div>
  );
}
