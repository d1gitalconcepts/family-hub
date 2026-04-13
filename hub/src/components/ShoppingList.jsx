import { useState } from 'react';
import { useTaskLists } from '../hooks/useTaskLists';
import { supabase } from '../supabaseClient';
import StatusBar from './StatusBar';

export default function ShoppingList() {
  const taskLists = useTaskLists();
  // Optimistic local overrides: { taskId: checked }
  const [optimistic, setOptimistic] = useState({});

  const shoppingList = taskLists.find((l) => l.list_name === 'Shopping List');
  const items = shoppingList?.items || [];

  async function toggleItem(item) {
    const newChecked = !(optimistic[item.text] ?? item.checked);

    // Optimistic update
    setOptimistic((prev) => ({ ...prev, [item.text]: newChecked }));

    // Write to pending_updates so server applies to Google Tasks
    const { error } = await supabase.from('pending_updates').insert({
      list_id: shoppingList.list_id,
      task_id: item.google_task_id || item.text, // fall back to text if no task ID
      checked: newChecked,
    });

    if (error) {
      console.warn('[Hub] Failed to queue update:', error.message);
      // Revert optimistic change on failure
      setOptimistic((prev) => ({ ...prev, [item.text]: item.checked }));
    }
  }

  const unchecked = items.filter((i) => !(optimistic[i.text] ?? i.checked));
  const checked   = items.filter((i) =>  (optimistic[i.text] ?? i.checked));

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        🛒 Shopping List
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {unchecked.length} left
        </span>
      </div>

      <div className="task-list">
        {unchecked.map((item) => (
          <TaskItem
            key={item.text}
            item={item}
            checked={false}
            onToggle={() => toggleItem(item)}
          />
        ))}

        {checked.length > 0 && (
          <>
            <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Done
            </div>
            {checked.map((item) => (
              <TaskItem
                key={item.text}
                item={item}
                checked={true}
                onToggle={() => toggleItem(item)}
              />
            ))}
          </>
        )}

        {items.length === 0 && (
          <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
            No items yet.
          </div>
        )}
      </div>

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
