import { useRef, useState, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useTaskLists } from '../hooks/useTaskLists';

export default function AdminSettings({ onClose, theme, onThemeChange }) {
  const [activeTab, setActiveTab] = useState('calendars');

  const [calConfig,      setCalConfig]     = useConfig('visible_calendars');
  const [sections,       setSections]      = useConfig('calendar_sections');
  const [listConfig,     setListConfig]    = useConfig('visible_task_lists');
  const [weatherKeys,    setWeatherKeys]   = useConfig('weather_keys');
  const [weatherConfig,  setWeatherConfig] = useConfig('weather_config');
  const [weatherForecast]                  = useConfig('weather_forecast');
  const [appName,        setAppName]       = useConfig('app_name');
  const [accentColorCfg,  setAccentColorCfg]  = useConfig('accent_color');
  const [headerStyleCfg,  setHeaderStyleCfg]  = useConfig('header_style');
  const [eventIconsCfg,   setEventIconsCfg]   = useConfig('event_icons');
  const [cardStyleCfg,    setCardStyleCfg]    = useConfig('card_style');
  const allTaskLists = useTaskLists();

  const [awApiKey,   setAwApiKey]   = useState('');
  const [awAppKey,   setAwAppKey]   = useState('');
  const [keysSaved,  setKeysSaved]  = useState(false);

  // Sync inputs when weatherKeys loads from Supabase
  useEffect(() => {
    if (weatherKeys?.api_key) setAwApiKey(weatherKeys.api_key);
    if (weatherKeys?.app_key) setAwAppKey(weatherKeys.app_key);
  }, [weatherKeys]);
  const weatherEnabled = weatherConfig?.enabled !== false;
  const weatherFields  = weatherConfig?.fields  || ['temp','feelsLike','humidity','windspeed','rain'];

  const ALL_WEATHER_FIELDS = [
    { key: 'temp',      label: 'Temperature' },
    { key: 'feelsLike', label: 'Feels Like' },
    { key: 'humidity',  label: 'Humidity' },
    { key: 'windspeed', label: 'Wind Speed' },
    { key: 'windgust',  label: 'Wind Gusts' },
    { key: 'rain',      label: 'Rain Today' },
    { key: 'pressure',  label: 'Pressure' },
    { key: 'uv',        label: 'UV Index' },
    { key: 'solar',     label: 'Solar Radiation' },
  ];

  function saveWeatherKeys() {
    setWeatherKeys({ api_key: awApiKey.trim(), app_key: awAppKey.trim() });
    setKeysSaved(true);
    setTimeout(() => setKeysSaved(false), 2500);
  }

  function toggleWeatherField(key) {
    const next = weatherFields.includes(key)
      ? weatherFields.filter((f) => f !== key)
      : [...weatherFields, key];
    setWeatherConfig({ ...weatherConfig, fields: next });
  }

  function onWeatherDragStart(e, idx) {
    drag.current = { type: 'weather-field', fromIdx: idx };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  function onWeatherDrop(e, toIdx) {
    e.preventDefault();
    if (!drag.current || drag.current.type !== 'weather-field') return;
    const { fromIdx } = drag.current;
    if (fromIdx !== toIdx) {
      const next = [...weatherFields];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      setWeatherConfig({ ...weatherConfig, fields: next });
    }
    drag.current = null;
    setDropTarget(null);
  }

  function onIconRuleDragStart(e, idx) {
    drag.current = { type: 'icon-rule', fromIdx: idx };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  function onIconRuleDrop(e, toIdx) {
    e.preventDefault();
    if (!drag.current || drag.current.type !== 'icon-rule') return;
    const { fromIdx } = drag.current;
    if (fromIdx !== toIdx) {
      const rules = eventIconsCfg?.rules ?? DEFAULT_ICON_RULES;
      const next = [...rules];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      setEventIconsCfg({ ...(eventIconsCfg || {}), rules: next });
    }
    drag.current = null;
    setDropTarget(null);
  }

  // dropTarget: null | 'unassigned' | `section-${id}` | { sectionId, beforeIdx }
  const [dropTarget, setDropTarget] = useState(null);
  const drag = useRef(null);

  // Inject virtual forecast "calendar" when forecast data is available
  const FORECAST_VIRTUAL = { id: '__weather_forecast', name: '⛅ Weather Forecast', color: '#4fc3f7', visible: true, virtual: true };
  const baseCalendars = calConfig || [];
  const calendars     = weatherForecast?.length
    ? baseCalendars.some((c) => c.id === '__weather_forecast')
      ? baseCalendars
      : [...baseCalendars, FORECAST_VIRTUAL]
    : baseCalendars;
  const sectionList = sections   || [];
  const assignedIds = new Set(sectionList.flatMap((s) => s.calendarIds || []));
  const unassigned  = calendars.filter((c) => !assignedIds.has(c.id));

  // Merge task list config with live data from Supabase
  const listRows = allTaskLists.map((l) => {
    const cfg = (listConfig || []).find((c) => c.list_id === l.list_id);
    return { list_id: l.list_id, name: cfg?.name || l.list_name, visible: cfg?.visible ?? true, itemCount: (l.items || []).length };
  });

  // --- Calendar field updates (skip virtual entries like forecast) ---
  function updateCalendar(id, field, value) {
    setCalConfig(calendars.filter((c) => !c.virtual).map((c) => c.id === id ? { ...c, [field]: value } : c));
  }

  // --- List field updates ---
  function updateListRow(listId, field, value) {
    const updated = listRows.map((r) => r.list_id === listId ? { ...r, [field]: value } : r);
    setListConfig(updated);
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

  // --- Drag: sections ---
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

  function onCalDropAtPosition(e, toSectionId, toIdx) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag.current || drag.current.type !== 'calendar') return;
    const { calId, fromSectionId, fromIdx } = drag.current;

    setSections(
      sectionList.map((s) => {
        if (s.id === fromSectionId && s.id === toSectionId) {
          const ids = [...s.calendarIds];
          ids.splice(fromIdx, 1);
          const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
          ids.splice(insertAt, 0, calId);
          return { ...s, calendarIds: ids };
        }
        if (s.id === fromSectionId) return { ...s, calendarIds: s.calendarIds.filter((id) => id !== calId) };
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
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ sectionId: fromSectionId, beforeIdx: idx }); }}
        onDrop={(e) => onCalDropAtPosition(e, fromSectionId, idx)}
      >
        <span className="drag-handle">⠿</span>
        {cal.virtual ? (
          // Virtual entries (e.g. Weather Forecast) — read-only, no color/name editing
          <>
            <span className="cal-dot" style={{ background: cal.color }} />
            <span style={{ fontSize: 13, flex: 1 }}>{cal.name}</span>
          </>
        ) : (
          <>
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
              type="text"
              value={cal.emoji || ''}
              onChange={(e) => updateCalendar(cal.id, 'emoji', e.target.value.slice(0, 2) || null)}
              placeholder="✦"
              title="Calendar emoji (optional)"
              style={{ width: 32, textAlign: 'center', fontSize: 15, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', padding: '2px 2px', flexShrink: 0 }}
            />
            <input
              className="cal-name-input"
              value={cal.name || ''}
              onChange={(e) => updateCalendar(cal.id, 'name', e.target.value)}
              placeholder="Calendar name"
            />
          </>
        )}
      </div>
    );
  }

  const DEFAULT_ICON_RULES = [
    { keyword: 'birthday',  icon: '🎂' },
    { keyword: 'dinner',    icon: '🍽️' },
    { keyword: 'lunch',     icon: '🥗' },
    { keyword: 'breakfast', icon: '🍳' },
    { keyword: 'gym',       icon: '🏋️' },
    { keyword: 'workout',   icon: '💪' },
    { keyword: 'run',       icon: '🏃' },
    { keyword: 'flight',    icon: '✈️' },
    { keyword: 'travel',    icon: '🧳' },
    { keyword: 'school',    icon: '📚' },
    { keyword: 'doctor',    icon: '🩺' },
    { keyword: 'dentist',   icon: '🦷' },
    { keyword: 'meeting',   icon: '💼' },
    { keyword: 'party',     icon: '🎉' },
    { keyword: 'game',      icon: '⚽' },
    { keyword: 'practice',  icon: '🏃' },
    { keyword: 'movie',     icon: '🎬' },
    { keyword: 'date',      icon: '💕' },
    { keyword: 'hair',      icon: '✂️' },
    { keyword: 'holiday',   icon: '🏖️' },
  ];

  const TABS = [
    { id: 'calendars',   label: 'Calendars' },
    { id: 'eventicons',  label: 'Event Icons' },
    { id: 'eventcards',  label: 'Event Cards' },
    { id: 'lists',       label: 'Lists' },
    { id: 'weather',     label: 'Weather' },
    { id: 'display',     label: 'Display' },
  ];

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

        <div className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="settings-body">

          {/* ── Calendars tab ─────────────────────────────────── */}
          {activeTab === 'calendars' && (
            <>
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
                            isDropTarget={dropTarget?.sectionId === section.id && dropTarget?.beforeIdx === i}
                          />
                        ))}
                        {calIds.length === 0 && <div className="drop-hint">Drop calendars here</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

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
                    {unassigned.length === 0 && <div className="drop-hint">All calendars are assigned</div>}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Event Icons tab ───────────────────────────────── */}
          {activeTab === 'eventicons' && (
            <div className="settings-section">
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ flex: 1, margin: 0 }}>Event Icons</h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={eventIconsCfg?.enabled ?? true}
                    onChange={(e) => setEventIconsCfg({ ...(eventIconsCfg || { rules: DEFAULT_ICON_RULES }), enabled: e.target.checked })}
                  />
                  Enable
                </label>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
                Keyword → emoji rules applied to event titles. First match wins. Separate multiple keywords with commas.
              </p>
              {(eventIconsCfg?.enabled ?? true) && (() => {
                const rules = eventIconsCfg?.rules ?? DEFAULT_ICON_RULES;
                function updateRule(i, field, val) {
                  const next = rules.map((r, ri) => ri === i ? { ...r, [field]: val } : r);
                  setEventIconsCfg({ ...(eventIconsCfg || {}), enabled: true, rules: next });
                }
                function removeRule(i) {
                  setEventIconsCfg({ ...(eventIconsCfg || {}), enabled: true, rules: rules.filter((_, ri) => ri !== i) });
                }
                function addRule() {
                  setEventIconsCfg({ ...(eventIconsCfg || {}), enabled: true, rules: [...rules, { keyword: '', icon: '' }] });
                }
                return (
                  <>
                    {rules.map((rule, i) => {
                      const isDropTarget = dropTarget?.type === 'icon-rule' && dropTarget?.beforeIdx === i;
                      return (
                      <div
                        key={i}
                        className={`cal-row${isDropTarget ? ' cal-row-drop-target' : ''}`}
                        draggable
                        onDragStart={(e) => onIconRuleDragStart(e, i)}
                        onDragEnd={onDragEnd}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ type: 'icon-rule', beforeIdx: i }); }}
                        onDrop={(e) => onIconRuleDrop(e, i)}
                        style={{ gap: 6 }}
                      >
                        <span className="drag-handle">⠿</span>
                        <input
                          type="text"
                          value={rule.icon}
                          onChange={(e) => updateRule(i, 'icon', e.target.value.slice(0, 2))}
                          placeholder="🎂"
                          style={{ width: 40, textAlign: 'center', fontSize: 16, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', padding: '4px', flexShrink: 0 }}
                        />
                        <input
                          type="text"
                          value={rule.keyword}
                          onChange={(e) => updateRule(i, 'keyword', e.target.value)}
                          placeholder="keyword, alias, ..."
                          style={{ flex: 1, fontSize: 13, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', padding: '5px 8px' }}
                        />
                        <button className="btn-icon" style={{ fontSize: 13 }} onClick={() => removeRule(i)}>✕</button>
                      </div>
                      );
                    })}
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginTop: 4 }} onClick={addRule}>
                      + Add rule
                    </button>
                  </>
                );
              })()}
            </div>
          )}

          {/* ── Event Cards tab ───────────────────────────────── */}
          {activeTab === 'eventcards' && (() => {
            const cs = cardStyleCfg || {};
            const popout = cs.popout || {};
            function setCs(patch) { setCardStyleCfg({ ...cs, ...patch }); }
            function setPopout(patch) { setCardStyleCfg({ ...cs, popout: { ...popout, ...patch } }); }

            const LAYOUTS = [
              {
                id: 'standard', label: 'Standard',
                preview: (
                  <div style={{ lineHeight: 1.4 }}>
                    <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 1 }}>3:00 PM</div>
                    <div style={{ fontSize: 10, fontWeight: 600 }}>Event Title</div>
                    <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 1 }}>Calendar</div>
                  </div>
                ),
              },
              {
                id: 'minimal', label: 'Minimal',
                preview: (
                  <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                    <div style={{ fontSize: 10, fontWeight: 600 }}>Event Title</div>
                  </div>
                ),
              },
              {
                id: 'inline', label: 'Inline',
                preview: (
                  <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                    <div style={{ fontSize: 9 }}><span style={{ color: 'var(--text-muted)' }}>3pm · </span><strong>Event Title</strong></div>
                  </div>
                ),
              },
              {
                id: 'comfortable', label: 'Comfortable',
                preview: (
                  <div style={{ lineHeight: 1.4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Event Title</div>
                    <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>3:00 PM</div>
                  </div>
                ),
              },
            ];

            const active = cs.layout || 'standard';

            return (
              <div className="settings-section">

                {/* Layout */}
                <h3 style={{ marginBottom: 12 }}>Card Layout</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setCs({ layout: l.id })}
                      style={{
                        border: `2px solid ${active === l.id ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 8,
                        background: active === l.id ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                        cursor: 'pointer',
                        padding: 0,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {/* mini card mockup */}
                      <div style={{
                        margin: 10,
                        padding: '6px 8px',
                        borderLeft: `3px solid ${active === l.id ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 3,
                        background: 'var(--bg-secondary)',
                        minHeight: 44,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        textAlign: 'left',
                      }}>
                        {l.preview}
                      </div>
                      <div style={{
                        fontSize: 11, fontWeight: active === l.id ? 600 : 400,
                        color: active === l.id ? 'var(--accent)' : 'var(--text-muted)',
                        padding: '4px 8px 8px',
                        textAlign: 'center',
                        fontFamily: 'var(--font)',
                      }}>
                        {l.label}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Card elements */}
                <h3 style={{ marginBottom: 10 }}>Card Elements</h3>
                {[
                  { key: 'showTime',        label: 'Event time',           note: 'e.g. 3:00 PM' },
                  { key: 'showCalName',     label: 'Calendar name',        note: 'shown below the title' },
                  { key: 'showDescSnippet', label: 'Description snippet',  note: 'first 60 characters' },
                ].map(({ key, label, note }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <input
                      type="checkbox"
                      checked={cs[key] ?? true}
                      onChange={(e) => setCs({ [key]: e.target.checked })}
                      style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{note}</span>
                  </div>
                ))}

                {/* Popout elements */}
                <h3 style={{ marginBottom: 10, marginTop: 20 }}>Popout Elements</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Shown when you tap or click an event card.
                </p>
                {[
                  { key: 'showCalName',     label: 'Calendar name'  },
                  { key: 'showDate',        label: 'Date'           },
                  { key: 'showTime',        label: 'Time'           },
                  { key: 'showLocation',    label: 'Location'       },
                  { key: 'showDescription', label: 'Description'    },
                ].map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <input
                      type="checkbox"
                      checked={popout[key] ?? true}
                      onChange={(e) => setPopout({ [key]: e.target.checked })}
                      style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13 }}>{label}</span>
                  </div>
                ))}

              </div>
            );
          })()}

          {/* ── Lists tab ──────────────────────────────────────── */}
          {activeTab === 'lists' && (
            <div className="settings-section">
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
                Choose which Google Task lists appear in the sidebar. Lists are synced from Google Tasks every 5 minutes.
              </p>

              {listRows.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  No task lists found. Open Google Keep or wait for a sync.
                </p>
              )}

              {listRows.map((row) => (
                <div key={row.list_id} className="cal-row">
                  <input
                    type="checkbox"
                    checked={row.visible}
                    onChange={(e) => updateListRow(row.list_id, 'visible', e.target.checked)}
                  />
                  <input
                    className="cal-name-input"
                    value={row.name}
                    onChange={(e) => updateListRow(row.list_id, 'name', e.target.value)}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {row.itemCount} item{row.itemCount !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Weather tab ───────────────────────────────────── */}
          {activeTab === 'weather' && (
            <div className="settings-section">

              {/* Enable toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <input
                  type="checkbox"
                  id="weather-enabled"
                  checked={weatherEnabled}
                  onChange={(e) => setWeatherConfig({ ...weatherConfig, enabled: e.target.checked })}
                />
                <label htmlFor="weather-enabled" style={{ fontWeight: 500 }}>Show weather widget</label>
              </div>

              {/* Widget position */}
              <h3 style={{ marginBottom: 8 }}>Widget Position</h3>
              <div style={{ marginBottom: 18 }}>
                <select
                  className="cal-name-input"
                  style={{ fontSize: 13, padding: '5px 8px' }}
                  value={weatherConfig?.position || 'below-header'}
                  onChange={(e) => setWeatherConfig({ ...weatherConfig, position: e.target.value })}
                >
                  <option value="below-header">Below header bar</option>
                  <option value="in-header">Inside header bar</option>
                </select>
              </div>

              {/* API Keys */}
              <h3 style={{ marginBottom: 10 }}>Ambient Weather API Keys</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                Get these from <strong>ambientweather.net → Account → API Keys</strong>.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                <label style={{ fontSize: 13 }}>
                  API Key
                  <input
                    className="cal-name-input"
                    style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                    type="password"
                    value={awApiKey}
                    onChange={(e) => setAwApiKey(e.target.value)}
                    placeholder="Your API key"
                    autoComplete="off"
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  Application Key
                  <input
                    className="cal-name-input"
                    style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                    type="password"
                    value={awAppKey}
                    onChange={(e) => setAwAppKey(e.target.value)}
                    placeholder="Your application key"
                    autoComplete="off"
                  />
                </label>
                <button
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  onClick={saveWeatherKeys}
                >
                  {keysSaved ? '✓ Saved' : 'Save Keys'}
                </button>
              </div>

              {/* Display options */}
              <h3 style={{ marginBottom: 8 }}>Display Options</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <input
                  type="checkbox"
                  id="hide-rain-zero"
                  checked={weatherConfig?.hideRainIfZero !== false}
                  onChange={(e) => setWeatherConfig({ ...weatherConfig, hideRainIfZero: e.target.checked })}
                />
                <label htmlFor="hide-rain-zero" style={{ fontSize: 13 }}>
                  Hide "Rain Today" when there has been no rain
                </label>
              </div>

              {/* Reorderable fields list */}
              <h3 style={{ marginBottom: 6 }}>Display Fields</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
                Check fields to show them. Use arrows to reorder.
              </p>

              {/* Enabled fields in order — draggable */}
              {weatherFields.map((key, idx) => {
                const def = ALL_WEATHER_FIELDS.find((f) => f.key === key);
                if (!def) return null;
                const isDropTarget = dropTarget?.type === 'weather-field' && dropTarget?.beforeIdx === idx;
                return (
                  <div
                    key={key}
                    className={`cal-row${isDropTarget ? ' cal-row-drop-target' : ''}`}
                    draggable
                    onDragStart={(e) => onWeatherDragStart(e, idx)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ type: 'weather-field', beforeIdx: idx }); }}
                    onDrop={(e) => onWeatherDrop(e, idx)}
                  >
                    <span className="drag-handle">⠿</span>
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => toggleWeatherField(key)}
                    />
                    <span style={{ fontSize: 13 }}>{def.label}</span>
                  </div>
                );
              })}

              {/* Disabled fields — click checkbox to add to bottom of list */}
              {ALL_WEATHER_FIELDS.filter(({ key }) => !weatherFields.includes(key)).map(({ key, label }) => (
                <div key={key} className="cal-row" style={{ gap: 6, opacity: 0.5 }}>
                  <span className="drag-handle" style={{ visibility: 'hidden' }}>⠿</span>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => toggleWeatherField(key)}
                  />
                  <span style={{ fontSize: 13 }}>{label}</span>
                </div>
              ))}

            </div>
          )}

          {/* ── Display tab ───────────────────────────────────── */}
          {activeTab === 'display' && (
            <div className="settings-section">

              {/* App Name */}
              <h3 style={{ marginBottom: 8 }}>App Name</h3>
              <input
                type="text"
                className="login-input"
                value={appName ?? ''}
                placeholder="Family Hub"
                onChange={(e) => setAppName(e.target.value || null)}
                style={{ marginBottom: 20, fontSize: 14 }}
              />

              {/* Accent Color */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ flex: 1, margin: 0 }}>Accent Color</h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={accentColorCfg?.enabled ?? false}
                    onChange={(e) => setAccentColorCfg({ ...(accentColorCfg || {}), enabled: e.target.checked })}
                  />
                  Enable
                </label>
              </div>
              {accentColorCfg?.enabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <input
                    type="color"
                    className="cal-color-input"
                    value={accentColorCfg?.color || '#1a73e8'}
                    onChange={(e) => setAccentColorCfg({ ...(accentColorCfg || {}), enabled: true, color: e.target.value })}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>
                    Replaces the default blue on buttons, highlights, and today's date.
                  </span>
                  <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => setAccentColorCfg({ ...(accentColorCfg || {}), color: '#1a73e8' })}>
                    Reset
                  </button>
                </div>
              )}
              {!(accentColorCfg?.enabled) && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 20 }}>
                  Uses the default blue accent. Enable to override.
                </p>
              )}

              {/* Header Style */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ flex: 1, margin: 0 }}>Header Style</h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={headerStyleCfg?.enabled ?? false}
                    onChange={(e) => setHeaderStyleCfg({ ...(headerStyleCfg || { preset: 'sunrise' }), enabled: e.target.checked })}
                  />
                  Enable
                </label>
              </div>
              {headerStyleCfg?.enabled && (() => {
                const PRESETS = [
                  { id: 'sunrise',  label: '🌅 Sunrise',  bg: 'linear-gradient(135deg,#ffecd2,#fcb69f)' },
                  { id: 'ocean',    label: '🌊 Ocean',    bg: 'linear-gradient(135deg,#a1c4fd,#c2e9fb)' },
                  { id: 'forest',   label: '🌿 Forest',   bg: 'linear-gradient(135deg,#d4fc79,#96e6a1)' },
                  { id: 'twilight', label: '🌆 Twilight', bg: 'linear-gradient(135deg,#a18cd1,#fbc2eb)' },
                  { id: 'slate',    label: '🩶 Slate',    bg: 'linear-gradient(135deg,#e0eafc,#cfdef3)' },
                  { id: 'custom',   label: '🎨 Custom',   bg: null },
                ];
                const active = headerStyleCfg?.preset || 'sunrise';
                return (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {PRESETS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setHeaderStyleCfg({ ...(headerStyleCfg || {}), preset: p.id })}
                          style={{
                            padding: '6px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                            border: `2px solid ${active === p.id ? 'var(--accent)' : 'var(--border)'}`,
                            background: p.bg || (active === p.id ? 'color-mix(in srgb,var(--accent) 10%,var(--surface))' : 'var(--surface)'),
                            color: 'var(--text)', fontFamily: 'var(--font)',
                            fontWeight: active === p.id ? 600 : 400,
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {active === 'custom' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <input type="color" className="cal-color-input"
                          value={headerStyleCfg?.color1 || '#a1c4fd'}
                          onChange={(e) => setHeaderStyleCfg({ ...(headerStyleCfg || {}), color1: e.target.value })} />
                        <span style={{ color: 'var(--text-muted)' }}>→</span>
                        <input type="color" className="cal-color-input"
                          value={headerStyleCfg?.color2 || '#c2e9fb'}
                          onChange={(e) => setHeaderStyleCfg({ ...(headerStyleCfg || {}), color2: e.target.value })} />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gradient colors</span>
                      </div>
                    )}
                  </>
                );
              })()}
              {!(headerStyleCfg?.enabled) && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 20 }}>
                  Solid header. Enable to add a gradient.
                </p>
              )}

              {/* Theme */}
              <h3 style={{ marginBottom: 12, marginTop: headerStyleCfg?.enabled ? 16 : 0 }}>Theme</h3>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { value: 'auto',  icon: '🌓', label: 'Auto'  },
                  { value: 'light', icon: '☀️', label: 'Light' },
                  { value: 'dark',  icon: '🌙', label: 'Dark'  },
                ].map(({ value, icon, label }) => (
                  <button
                    key={value}
                    onClick={() => onThemeChange(value)}
                    style={{
                      flex: 1, padding: '14px 8px', borderRadius: 'var(--radius)', cursor: 'pointer',
                      border: `2px solid ${theme === value ? 'var(--accent)' : 'var(--border)'}`,
                      background: theme === value ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : 'var(--surface)',
                      color: theme === value ? 'var(--accent)' : 'var(--text)',
                      fontFamily: 'var(--font)', fontWeight: theme === value ? 600 : 400, fontSize: 13,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10, marginBottom: 20 }}>
                Auto follows your device's system preference.
              </p>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
