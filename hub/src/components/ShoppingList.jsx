import { useState } from 'react';
import { useShoppingList } from '../hooks/useShoppingList';
import { supabase } from '../supabaseClient';
import StatusBar from './StatusBar';

export default function ShoppingList() {
  const items = useShoppingList();
  const [optimistic, setOptimistic] = useState({});
  const [doneOpen, setDoneOpen]     = useState(false);

  async function toggleItem(item) {
    const key        = item.text;
    const newChecked = !(optimistic[key] ?? item.checked);
    setOptimistic((prev) => ({ ...prev, [key]: newChecked }));

    // Queue Keep checkbox update — scraper applies this on next run
    const { error } = await supabase.from('keep_updates').insert({
      note_key:  'shopping-list',
      item_text: item.text,
      checked:   newChecked,
    });
    if (error) {
      console.warn('[Hub] Failed to queue Keep update:', error.message);
      setOptimistic((prev) => ({ ...prev, [key]: item.checked }));
    }
  }

  const unchecked = items.filter((i) => !(optimistic[i.text] ?? i.checked));
  const checked   = items.filter((i) =>  (optimistic[i.text] ?? i.checked));

  return (
    <div className="sidebar">
      {items.length === 0 && (
        <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
          No items.
        </div>
      )}

      {(unchecked.length > 0 || checked.length > 0) && (
        <div className="task-list-section">
          <div className="sidebar-header">
            Shopping List
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
                <button className="done-toggle" onClick={() => setDoneOpen((o) => !o)}>
                  <span>✓ Done</span>
                  <span className="done-toggle-count">{checked.length}</span>
                  <span className="done-toggle-chevron">{doneOpen ? '▲' : '▼'}</span>
                </button>
                {doneOpen && checked.map((item) => (
                  <TaskItem
                    key={item.text}
                    item={item}
                    checked={true}
                    onToggle={() => toggleItem(item)}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

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
