import { useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useConfig } from '../hooks/useConfig';
import { useMyClassScheduleEvents } from '../hooks/useMyClassScheduleEvents';

const FORECAST_ID = '__weather_forecast';

// Self-service view of one's own grid. The admin still decides WHICH
// calendars a person can see at all (Settings → People, unchanged) —
// this screen only lets that person hide further calendars from that
// allowed set, and regroup/reorder them into their own personal
// sections, independent of the admin's global Settings → Calendars
// layout. Available to every logged-in profile (not gated behind
// Settings access), since it only ever touches that person's own row.
export default function MyCalendarView({ profile, onClose }) {
  const [calConfig]       = useConfig('visible_calendars');
  const [globalSections]  = useConfig('calendar_sections');
  const [weatherForecast] = useConfig('weather_forecast');
  const myClassSchedule   = useMyClassScheduleEvents(profile, []);

  const [hidden,    setHidden]    = useState(() => profile?.own_hidden_calendar_ids || []);
  // null = not customized yet, use the admin's global grouping as a
  // read-only starting point; an array = this person's own layout.
  const [sections,  setSections]  = useState(() => (
    Array.isArray(profile?.own_calendar_sections) ? profile.own_calendar_sections : null
  ));
  const [saveError, setSaveError] = useState('');
  const [dropTarget, setDropTarget] = useState(null);
  const drag = useRef(null);

  // Calendars this person is allowed to see at all (admin's global
  // visibility + admin's optional per-person allow-list), plus their own
  // class schedule and the weather forecast if either is available —
  // same virtual entries the admin's Calendars tab offers.
  const profileCalendarIds = profile?.visible_calendar_ids;
  const adminVisible = (calConfig || []).filter((c) => c.visible !== false);
  const allowed = profileCalendarIds
    ? adminVisible.filter((c) => profileCalendarIds.includes(c.id))
    : adminVisible;
  const withClassSchedule = myClassSchedule.calendar ? [...allowed, myClassSchedule.calendar] : allowed;
  const calendars = weatherForecast?.length
    ? [...withClassSchedule, { id: FORECAST_ID, name: '⛅ Weather Forecast', color: '#4fc3f7', virtual: true }]
    : withClassSchedule;
  const calById = (id) => calendars.find((c) => c.id === id);

  const isCustomized = sections !== null;
  const effectiveSections = isCustomized ? sections : (globalSections || []);
  // Drop calendar ids no longer available to this person (admin revoked
  // access since this layout was saved) so nothing dangling renders.
  const availableIds  = new Set(calendars.map((c) => c.id));
  const cleanSections  = effectiveSections.map((s) => ({ ...s, calendarIds: (s.calendarIds || []).filter((id) => availableIds.has(id)) }));
  const assignedIds    = new Set(cleanSections.flatMap((s) => s.calendarIds));
  const unassigned      = calendars.filter((c) => !assignedIds.has(c.id));

  async function persist(patch) {
    setSaveError('');
    const { error } = await supabase.from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) setSaveError(error.message);
  }

  function toggleHidden(id) {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    setHidden(next);
    persist({ own_hidden_calendar_ids: next });
  }

  // Any structural edit "adopts" the current effective grouping as this
  // person's own the first time it happens, then saves from there.
  function editSections(mutate) {
    const base = cleanSections.map((s) => ({ ...s, calendarIds: [...(s.calendarIds || [])] }));
    const next = mutate(base);
    setSections(next);
    persist({ own_calendar_sections: next });
  }

  function addSection() {
    editSections((base) => [...base, { id: `s-${Date.now()}`, name: 'New Section', calendarIds: [] }]);
  }
  function deleteSection(id) {
    editSections((base) => base.filter((s) => s.id !== id));
  }
  function renameSection(id, name) {
    editSections((base) => base.map((s) => (s.id === id ? { ...s, name } : s)));
  }
  function resetToAdminDefault() {
    setSections(null);
    persist({ own_calendar_sections: null });
  }

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
      editSections((base) => {
        const next = [...base];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
    }
    drag.current = null;
    setDropTarget(null);
  }

  function onCalDragStart(e, calId, fromSectionId, fromIdx) {
    drag.current = { type: 'calendar', calId, fromSectionId, fromIdx };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }
  function onCalDropAtPosition(e, toSectionId, toIdx) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag.current || drag.current.type !== 'calendar') return;
    const { calId, fromSectionId, fromIdx } = drag.current;
    editSections((base) => base.map((s) => {
      if (s.id === fromSectionId && s.id === toSectionId) {
        const ids = [...s.calendarIds];
        ids.splice(fromIdx, 1);
        const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
        ids.splice(insertAt, 0, calId);
        return { ...s, calendarIds: ids };
      }
      if (s.id === fromSectionId) return { ...s, calendarIds: s.calendarIds.filter((id) => id !== calId) };
      if (s.id === toSectionId) {
        const ids = [...s.calendarIds];
        ids.splice(toIdx, 0, calId);
        return { ...s, calendarIds: ids };
      }
      return s;
    }));
    drag.current = null;
    setDropTarget(null);
  }
  function onCalDropToSection(e, toSectionId) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag.current || drag.current.type !== 'calendar') return;
    const section = cleanSections.find((s) => s.id === toSectionId);
    onCalDropAtPosition(e, toSectionId, (section?.calendarIds || []).length);
  }
  function onCalDropToUnassigned(e) {
    e.preventDefault();
    if (!drag.current || drag.current.type !== 'calendar') return;
    const { calId, fromSectionId } = drag.current;
    if (!fromSectionId) { drag.current = null; setDropTarget(null); return; }
    editSections((base) => base.map((s) =>
      s.id === fromSectionId ? { ...s, calendarIds: s.calendarIds.filter((id) => id !== calId) } : s
    ));
    drag.current = null;
    setDropTarget(null);
  }
  function onDragEnd() { drag.current = null; setDropTarget(null); }

  function CalRow({ cal, fromSectionId, idx, isDropTarget }) {
    if (!cal) return null;
    const isHidden = hidden.includes(cal.id);
    return (
      <div
        key={cal.id}
        className={`cal-row${isDropTarget ? ' cal-row-drop-target' : ''}`}
        draggable
        onDragStart={(e) => onCalDragStart(e, cal.id, fromSectionId, idx)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ sectionId: fromSectionId, beforeIdx: idx }); }}
        onDrop={(e) => onCalDropAtPosition(e, fromSectionId, idx)}
      >
        <span className="drag-handle">⠿</span>
        <input type="checkbox" checked={!isHidden} onChange={() => toggleHidden(cal.id)}
          style={{ accentColor: cal.color }} title={isHidden ? 'Hidden from your view' : 'Visible in your view'} />
        <span className="cal-dot" style={{ background: cal.color }} />
        <span style={{ fontSize: 'var(--s-base)', flex: 1, opacity: isHidden ? 0.5 : 1 }}>{cal.name}</span>
      </div>
    );
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <span>🗂 My Calendar View</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary" style={{ fontSize: 'var(--s-base)', padding: '5px 14px' }} onClick={onClose}>
              Done
            </button>
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="settings-body">
          <div className="settings-section">
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
              An admin decides which calendars show up here at all. Uncheck any of your own to hide
              them, and drag calendars into sections to group and reorder them just for you — this
              doesn't change what anyone else sees.
            </p>

            {saveError && (
              <p style={{ color: 'var(--danger)', fontSize: 'var(--s-sm)', marginBottom: 10 }}>⚠ {saveError}</p>
            )}

            {calendars.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>
                No calendars have been shared with you yet — ask an admin to add some in Settings → People.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ margin: 0 }}>Sections</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isCustomized && (
                      <button className="btn" style={{ fontSize: 'var(--s-sm)', padding: '3px 10px' }} onClick={resetToAdminDefault}>
                        ↺ Reset to admin's layout
                      </button>
                    )}
                    <button className="btn" style={{ fontSize: 'var(--s-sm)', padding: '3px 10px' }} onClick={addSection}>
                      + Add Section
                    </button>
                  </div>
                </div>

                {!isCustomized && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-xs)', marginBottom: 10, fontStyle: 'italic' }}>
                    Currently showing the admin's layout — drag anything below to start your own.
                  </p>
                )}

                {cleanSections.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-base)' }}>
                    No sections yet. Add one and drag calendars into it.
                  </p>
                )}

                {cleanSections.map((section, si) => {
                  const calIds = section.calendarIds || [];
                  return (
                    <div
                      key={section.id}
                      className={`settings-section-block${dropTarget === `section-${section.id}` ? ' drop-target' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDropTarget(`section-${section.id}`); }}
                      onDrop={(e) => onSectionDrop(e, si)}
                      onDragLeave={() => setDropTarget(null)}
                    >
                      <div className="settings-section-header" draggable
                        onDragStart={(e) => onSectionDragStart(e, si)} onDragEnd={onDragEnd}>
                        <span className="drag-handle">⠿</span>
                        <input className="section-name-input" value={section.name}
                          onChange={(e) => renameSection(section.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()} />
                        <button className="btn-icon" style={{ fontSize: 'var(--s-sm)', color: 'var(--danger)' }}
                          onClick={() => deleteSection(section.id)} title="Delete section">✕</button>
                      </div>

                      <div
                        className={`section-cal-drop-zone${dropTarget === `cals-${section.id}` ? ' drop-active' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(`cals-${section.id}`); }}
                        onDrop={(e) => onCalDropToSection(e, section.id)}
                        onDragLeave={() => setDropTarget(null)}
                      >
                        {calIds.map((calId, i) => CalRow({
                          cal: calById(calId), fromSectionId: section.id, idx: i,
                          isDropTarget: dropTarget?.sectionId === section.id && dropTarget?.beforeIdx === i,
                        }))}
                        {calIds.length === 0 && <div className="drop-hint">Drop calendars here</div>}
                      </div>
                    </div>
                  );
                })}

                <h3 style={{ marginTop: 20 }}>Unassigned Calendars</h3>
                <div
                  className={`section-cal-drop-zone${dropTarget === 'unassigned' ? ' drop-active' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDropTarget('unassigned'); }}
                  onDrop={onCalDropToUnassigned}
                  onDragLeave={() => setDropTarget(null)}
                >
                  {unassigned.map((cal, i) => CalRow({ cal, fromSectionId: null, idx: i, isDropTarget: false }))}
                  {unassigned.length === 0 && <div className="drop-hint">Everything's in a section</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
