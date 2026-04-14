import { useState } from 'react';
import { useChecklistNote } from '../hooks/useChecklistNote';
import { useConfig } from '../hooks/useConfig';
import { supabase } from '../supabaseClient';
import StatusBar from './StatusBar';

const DEFAULT_NOTES = [
  { title: 'Shopping List', key: 'shopping-list', label: 'Shopping List', visible: true },
];

export default function ShoppingList({ pinned, onTogglePin }) {
  const [keepNotesCfg] = useConfig('keep_notes');
  const notes = (keepNotesCfg && keepNotesCfg.length > 0) ? keepNotesCfg : DEFAULT_NOTES;
  const visibleNotes = notes.filter((n) => n.visible !== false);

  return (
    <div className="sidebar">
      {/* Pin toggle — only shown on desktop where sidebar can be pinned */}
      {onTogglePin !== undefined && (
        <div className="sidebar-pinbar">
          <span className="sidebar-pinbar-label">Keep open</span>
          <button
            className={`sidebar-pin-toggle${pinned ? ' sidebar-pin-toggle--on' : ''}`}
            onClick={onTogglePin}
            title={pinned ? 'Pinned — click to auto-close' : 'Click to pin open'}
          >
            <span className="sidebar-pin-track">
              <span className="sidebar-pin-thumb" />
            </span>
          </button>
        </div>
      )}

      {visibleNotes.length === 0 && (
        <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          No lists configured. Add Keep notes in Settings → Keep Notes.
        </div>
      )}

      {visibleNotes.map((note) => (
        <ChecklistSection key={note.key} note={note} />
      ))}

      <StatusBar />
    </div>
  );
}

function ChecklistSection({ note }) {
  const items = useChecklistNote(note.key);
  const [optimistic, setOptimistic] = useState({});
  const [doneOpen, setDoneOpen] = useState(false);

  async function toggleItem(item) {
    const key        = item.text;
    const newChecked = !(optimistic[key] ?? item.checked);
    setOptimistic((prev) => ({ ...prev, [key]: newChecked }));

    const { error } = await supabase.from('keep_updates').insert({
      note_key:  note.key,
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
    <div className="task-list-section">
      <div className="sidebar-header">
        {note.label || note.title}
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {unchecked.length} left
        </span>
      </div>

      {items.length === 0 && (
        <div style={{ padding: '8px 14px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No items.
        </div>
      )}

      {items.length > 0 && (
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
      )}
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
