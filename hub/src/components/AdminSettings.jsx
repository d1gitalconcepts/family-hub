import { useRef, useState } from 'react';
import { useConfig } from '../hooks/useConfig';

export default function AdminSettings({ onClose }) {
  const [calConfig, setCalConfig] = useConfig('visible_calendars');
  const [sections,  setSections]  = useConfig('calendar_sections');

  // dropTarget: null | 'unassigned' | `section-${id}` | { sectionId, beforeIdx }
  const [dropTarget, setDropTarget] = useState(null);
  const drag = useRef(null); // { type: 'section'|'calendar', fromSectionId, calId, fromIdx }

  const calendars   = calConfig  || [];
  const sectionList = sections   || [];
  const assignedIds = new Set(sectionList.flatMap((s) => s.calendarIds || []));
  const unassigned  = calendars.filter((c) => !assignedIds.has(c.id));

  // --- Calendar field updates ---
  function updateCalendar(id, field, value) {
    setCalConfig(calendars.map((c) => c.id === id ? { ...c, [field]: value } : c));
  }

  // --- Section CRUD ---
  function addSection() {
    setSections([...sectionList, { id: `s-${Date.now()}`, name: 'New Section', calendarIds: [] }]);
  }

  function deleteSection(id) {
    setSections(sectionList.filter((s) => s.id !== id));
  }

  function renameSection(id, name) {
    setSections(sectionList.map((s) => s.id === id ? { ...s, name } : s));
  }

  // --- Drag: sections (reorder) ---
  function onSectionDragStart(e, idx) {
    drag.current = { type: 'section', fromIdx: idx };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  function onSectionDrop(e, toIdx) {
    e.preventDefault();
    if (!drag.current || drag.current.type !== 'section') return;
    const { fromIdx } = drag.current;
    if (fromIdx !== toIdx) {
      const updated = [...sectionList];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      setSections(updated);
    }
    drag.current = null;
    setDropTarget(null);
  }

  // --- Drag: calendars ---
  function onCalDragStart(e, calId, fromSectionId, fromIdx) {
    drag.current = { type: 'calendar', calId, fromSectionId, fromIdx };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  // Drop onto a specific position within a section (before `toIdx`)
  function onCalDropAtPosition(e, toSectionId, toIdx) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag.current || drag.current.type !== 'calendar') return;
    const { calId, fromSectionId, fromIdx } = drag.current;

    setSections(
      sectionList.map((s) => {
        if (s.id === fromSectionId && s.id === toSectionId) {
          // Same section — reorder
          const ids = [...s.calendarIds];
          ids.splice(fromIdx, 1);
          const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
          ids.splice(insertAt, 0, calId);
          return { ...s, calendarIds: ids };
        }
        if (s.id === fromSectionId) {
          return { ...s, calendarIds: s.calendarIds.filter((id) => id !== calId) };
        }
        if (s.id === toSectionId) {
          const ids = [...(s.calendarIds || [])];
          ids.splice(toIdx, 0, calId);
          return { ...s, calendarIds: ids };
        }
        return s;
      })
    );
    drag.current = null;
    setDropTarget(null);
  }

  // Drop onto the section zone (append to end)
  function onCalDropToSection(e, toSectionId) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag.current || drag.current.type !== 'calendar') return;
    const section = sectionList.find((s) => s.id === toSectionId);
    onCalDropAtPosition(e, toSectionId, (section?.calendarIds || []).length);
  }

  function onCalDropToUnassigned(e) {
    e.preventDefault();
    if (!drag.current || drag.current.type !== 'calendar') return;
    const { calId, fromSectionId } = drag.current;
    if (!fromSectionId) { drag.current = null; setDropTarget(null); return; }
    setSections(
      sectionList.map((s) =>
        s.id === fromSectionId ? { ...s, calendarIds: s.calendarIds.filter((id) => id !== calId) } : s
      )
    );
    drag.current = null;
    setDropTarget(null);
  }

  function onDragEnd() { drag.current = null; setDropTarget(null); }

  function calById(id) { return calendars.find((c) => c.id === id); }

  function CalRow({ cal, fromSectionId, idx, isDropTarget }) {
    if (!cal) return null;
    return (
      <div
        className={`cal-row${isDropTarget ? ' cal-row-drop-target' : ''}`}
        draggable
        onDragStart={(e) => onCalDragStart(e, cal.id, fromSectionId, idx)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropTarget({ sectionId: fromSectionId, beforeIdx: idx });
        }}
        onDrop={(e) => onCalDropAtPosition(e, fromSectionId, idx)}
      >
        <span className="drag-handle">⠿</span>
        <input
          type="checkbox"
          checked={cal.visible !== false}
          onChange={(e) => updateCalendar(cal.id, 'visible', e.target.checked)}
          style={{ accentColor: cal.color }}
        />
        <span className="cal-dot" style={{ background: cal.color }} />
        <input
          type="color"
          className="cal-color-input"
          value={cal.color || '#4285f4'}
          onChange={(e) => updateCalendar(cal.id, 'color', e.target.value)}
        />
        <input
          className="cal-name-input"
          value={cal.name || ''}
          onChange={(e) => updateCalendar(cal.id, 'name', e.target.value)}
          placeholder="Calendar name"
        />
      </div>
    );
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          Settings
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" style={{ fontSize: 13, padding: '5px 14px' }} onClick={onClose}>
              Save &amp; Close
            </button>
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="settings-body">

          {/* Sections */}
          <div className="settings-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Sections</h3>
              <button className="btn" style={{ fontSize: 12, padding: '3px 10px' }} onClick={addSection}>
                + Add Section
              </button>
            </div>

            {sectionList.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                No sections yet. Add one and drag calendars into it.
              </p>
            )}

            {sectionList.map((section, si) => {
              const calIds = section.calendarIds || [];
              return (
                <div
                  key={section.id}
                  className={`settings-section-block${dropTarget === `section-${section.id}` ? ' drop-target' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDropTarget(`section-${section.id}`); }}
                  onDrop={(e) => onSectionDrop(e, si)}
                  onDragLeave={() => setDropTarget(null)}
                >
                  <div
                    className="settings-section-header"
                    draggable
                    onDragStart={(e) => onSectionDragStart(e, si)}
                    onDragEnd={onDragEnd}
                  >
                    <span className="drag-handle">⠿</span>
                    <input
                      className="section-name-input"
                      value={section.name}
                      onChange={(e) => renameSection(section.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className="btn-icon"
                      style={{ fontSize: 12, color: 'var(--danger)' }}
                      onClick={() => deleteSection(section.id)}
                      title="Delete section"
                    >✕</button>
                  </div>

                  <div
                    className={`section-cal-drop-zone${dropTarget === `cals-${section.id}` ? ' drop-active' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(`cals-${section.id}`); }}
                    onDrop={(e) => onCalDropToSection(e, section.id)}
                    onDragLeave={() => setDropTarget(null)}
                  >
                    {calIds.map((calId, i) => (
                      <CalRow
                        key={calId}
                        cal={calById(calId)}
                        fromSectionId={section.id}
                        idx={i}
                        isDropTarget={
                          dropTarget?.sectionId === section.id &&
                          dropTarget?.beforeIdx === i
                        }
                      />
                    ))}
                    {calIds.length === 0 && (
                      <div className="drop-hint">Drop calendars here</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Unassigned */}
          {(unassigned.length > 0 || sectionList.length > 0) && (
            <div className="settings-section">
              <h3>Unassigned Calendars</h3>
              <div
                className={`section-cal-drop-zone${dropTarget === 'unassigned' ? ' drop-active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDropTarget('unassigned'); }}
                onDrop={onCalDropToUnassigned}
                onDragLeave={() => setDropTarget(null)}
              >
                {unassigned.map((cal, i) => (
                  <CalRow key={cal.id} cal={cal} fromSectionId={null} idx={i} isDropTarget={false} />
                ))}
                {unassigned.length === 0 && (
                  <div className="drop-hint">All calendars are assigned</div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
