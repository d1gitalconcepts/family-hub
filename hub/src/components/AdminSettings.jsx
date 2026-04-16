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
  const [fontSizeCfg,    setFontSizeCfg]   = useConfig('font_size');
  const [accentColorCfg,  setAccentColorCfg]  = useConfig('accent_color');
  const [headerStyleCfg,  setHeaderStyleCfg]  = useConfig('header_style');
  const [eventIconsCfg,    setEventIconsCfg]    = useConfig('event_icons');
  const [cardStyleCfg,     setCardStyleCfg]     = useConfig('card_style');
  const [eventFiltersCfg,  setEventFiltersCfg]  = useConfig('event_filters');
  const [keepNotesCfg,     setKeepNotesCfg]     = useConfig('keep_notes');
  const [mealPlanCfg,      setMealPlanCfg]      = useConfig('meal_plan');
  const [faviconCfg,       setFaviconCfg]       = useConfig('favicon');
  const [weatherSource,    setWeatherSource]    = useConfig('weather_source');
  const [weatherLocation,  setWeatherLocation]  = useConfig('weather_location');
  const allTaskLists = useTaskLists();

  const [awApiKey,       setAwApiKey]       = useState('');
  const [awAppKey,       setAwAppKey]       = useState('');
  const [keysSaved,      setKeysSaved]      = useState(false);
  const [zipInput,       setZipInput]       = useState('');
  const [locationStatus, setLocationStatus] = useState(null); // null | 'loading' | 'ok' | 'error'
  const [locationMsg,    setLocationMsg]    = useState('');

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
    { key: 'sunrise',   label: 'Sunrise' },
    { key: 'sunset',    label: 'Sunset' },
  ];

  async function lookupZip() {
    const zip = zipInput.trim();
    if (!zip) return;
    setLocationStatus('loading');
    setLocationMsg('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&countrycodes=us&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'FamilyHub/1.0' } }
      );
      const data = await res.json();
      if (!data?.length) throw new Error('Zip code not found');
      const { lat, lon, display_name } = data[0];
      // Shorten label to "City, ST"
      const parts = display_name.split(', ');
      const label = parts.length >= 2 ? `${parts[0]}, ${parts[parts.length - 2]}` : display_name;
      setWeatherLocation({ lat: parseFloat(lat), lon: parseFloat(lon), label, source: 'zip' });
      setWeatherSource('openmeteo');
      setLocationStatus('ok');
      setLocationMsg(`📍 ${label}`);
    } catch (e) {
      setLocationStatus('error');
      setLocationMsg(e.message || 'Lookup failed');
    }
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationMsg('Geolocation not supported by this browser');
      return;
    }
    setLocationStatus('loading');
    setLocationMsg('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        // Reverse geocode for a human-readable label
        let label = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            { headers: { 'Accept-Language': 'en', 'User-Agent': 'FamilyHub/1.0' } }
          );
          const data = await res.json();
          const a = data.address;
          if (a) label = [a.city || a.town || a.village, a.state].filter(Boolean).join(', ') || label;
        } catch {}
        setWeatherLocation({ lat, lon, label, source: 'device' });
        setWeatherSource('openmeteo');
        setLocationStatus('ok');
        setLocationMsg(`📍 ${label}`);
      },
      (err) => {
        setLocationStatus('error');
        setLocationMsg(err.message || 'Could not get location');
      }
    );
  }

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
            <span style={{ fontSize: 'var(--s-base)', flex: 1 }}>{cal.name}</span>
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
              style={{ width: 32, textAlign: 'center', fontSize: 'var(--s-base)', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', padding: '2px 2px', flexShrink: 0 }}
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
    { id: 'calendars',    label: 'Calendars'   },
    { id: 'eventicons',   label: 'Event Icons' },
    { id: 'eventcards',   label: 'Event Cards' },
    { id: 'eventfilters', label: 'Filters'     },
    { id: 'keepnotes',    label: 'Keep Notes'  },
    { id: 'mealplan',     label: 'Meal Plan'   },
    { id: 'weather',      label: 'Weather'     },
    { id: 'display',      label: 'Display'     },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>

        <div className="settings-panel-header">
          Settings
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" style={{ fontSize: 'var(--s-base)', padding: '5px 14px' }} onClick={onClose}>
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
                  <button className="btn" style={{ fontSize: 'var(--s-sm)', padding: '3px 10px' }} onClick={addSection}>
                    + Add Section
                  </button>
                </div>

                {sectionList.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-base)' }}>
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
                          style={{ fontSize: 'var(--s-sm)', color: 'var(--danger)' }}
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--s-base)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={eventIconsCfg?.enabled ?? true}
                    onChange={(e) => setEventIconsCfg({ ...(eventIconsCfg || { rules: DEFAULT_ICON_RULES }), enabled: e.target.checked })}
                  />
                  Enable
                </label>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 10 }}>
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
                          style={{ flex: 1, fontSize: 'var(--s-base)', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', padding: '5px 8px' }}
                        />
                        <button className="btn-icon" style={{ fontSize: 'var(--s-base)' }} onClick={() => removeRule(i)}>✕</button>
                      </div>
                      );
                    })}
                    <button className="btn" style={{ fontSize: 'var(--s-sm)', padding: '4px 10px', marginTop: 4 }} onClick={addRule}>
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

  const DEFAULT_ELEMENTS = [
    { key: 'time',    label: 'Time',        visible: true  },
    { key: 'title',   label: 'Title',       visible: true  },
    { key: 'calName', label: 'Calendar',    visible: true  },
    { key: 'desc',    label: 'Description', visible: false },
  ];
  const cardElements = cs.cardElements || DEFAULT_ELEMENTS;
  const chipStyle    = cs.chipStyle    || false;
  const emojiAsBadge = cs.emojiAsBadge || false;
  const align        = cs.align        || 'left';
  const valign       = cs.valign       || 'top';

  const SAMPLE_COLOR = '#4285f4';
  const SAMPLE_EMOJI = '📅';
  const visibleElems = cardElements.filter(e => e.visible !== false);
  const justifyMap   = { left: 'flex-start', center: 'center', right: 'flex-end' };

  // Tinted text colors used by both border and chip preview (chip just has a stronger bg)
  const previewTitle = '#1d5bb7';
  const previewMeta  = 'rgba(29,91,183,0.72)';

  function previewTextEl(el) {
    if (el.key === 'time')    return <span key="time"    style={{ fontSize: 'var(--s-xs)', color: previewMeta }}>3:00 PM</span>;
    if (el.key === 'title')   return <span key="title"   style={{ fontSize: 'var(--s-base)', fontWeight: 600, color: previewTitle }}>Team Meeting</span>;
    if (el.key === 'calName') return <span key="calName" style={{ fontSize: 'var(--s-xs)', color: previewMeta }}>Work</span>;
    if (el.key === 'desc')    return <span key="desc"    style={{ fontSize: 'var(--s-xs)', color: previewMeta, fontStyle: 'italic' }}>Q3 planning session…</span>;
    return null;
  }

  const valignMap = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

  function renderPreviewContent() {
    const textCol = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: align, flex: 1, minWidth: 0 }}>
        {visibleElems.map(previewTextEl)}
      </div>
    );
    if (emojiAsBadge) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: justifyMap[align] }}>
          <svg viewBox="0 0 32 32" width="30" height="30" style={{ flexShrink: 0 }}>
            <circle cx="16" cy="16" r="15" fill="rgba(66,133,244,0.15)" />
            <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(66,133,244,0.4)" strokeWidth="1.5" />
            <text x="16" y="22" textAnchor="middle" fontSize="18" fill={SAMPLE_COLOR}>{SAMPLE_EMOJI}</text>
          </svg>
          {textCol}
        </div>
      );
    }
    return <div style={{ width: '100%' }}>{textCol}</div>;
  }

  const POPOUT_SAMPLES = {
    calName:     { label: 'Calendar',  value: '● Work',                  color: SAMPLE_COLOR },
    date:        { label: 'Date',      value: 'Tuesday, April 14'        },
    time:        { label: 'Time',      value: '3:00 PM – 4:00 PM'        },
    location:    { label: 'Where',     value: '123 Main St'              },
    description: { label: 'Details',   value: 'Q3 planning session…'     },
  };

  function onElemDragStart(e, idx) {
    drag.current = { type: 'card-element', fromIdx: idx };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }
  function onElemDrop(e, toIdx) {
    e.preventDefault();
    if (!drag.current || drag.current.type !== 'card-element') return;
    const { fromIdx } = drag.current;
    if (fromIdx !== toIdx) {
      const next = [...cardElements];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      setCs({ cardElements: next });
    }
    drag.current = null;
    setDropTarget(null);
  }
  function toggleElem(idx) {
    const next = cardElements.map((el, i) => i === idx ? { ...el, visible: !el.visible } : el);
    setCs({ cardElements: next });
  }

  const DEFAULT_POPOUT_ELEMENTS = [
    { key: 'calName',     label: 'Calendar name' },
    { key: 'date',        label: 'Date'           },
    { key: 'time',        label: 'Time'           },
    { key: 'location',    label: 'Location'       },
    { key: 'description', label: 'Description'    },
  ];
  const popoutElements = cs.popoutElements || DEFAULT_POPOUT_ELEMENTS;

  function onPopoutDragStart(e, idx) {
    drag.current = { type: 'popout-element', fromIdx: idx };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }
  function onPopoutDrop(e, toIdx) {
    e.preventDefault();
    if (!drag.current || drag.current.type !== 'popout-element') return;
    const { fromIdx } = drag.current;
    if (fromIdx !== toIdx) {
      const next = [...popoutElements];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      setCs({ popoutElements: next });
    }
    drag.current = null;
    setDropTarget(null);
  }
  function togglePopoutElem(idx) {
    const next = popoutElements.map((el, i) => i === idx ? { ...el, visible: !el.visible } : el);
    setCs({ popoutElements: next });
  }

  return (
    <div className="settings-section">

      {/* ── Live preview ── */}
      <h3 style={{ marginBottom: 10 }}>Card Preview</h3>
      <div style={{
        background: chipStyle ? 'rgba(66,133,244,0.14)' : 'var(--surface)',
        borderTop:    `1px solid ${chipStyle ? 'rgba(66,133,244,0.25)' : 'var(--border)'}`,
        borderRight:  `1px solid ${chipStyle ? 'rgba(66,133,244,0.25)' : 'var(--border)'}`,
        borderBottom: `1px solid ${chipStyle ? 'rgba(66,133,244,0.25)' : 'var(--border)'}`,
        borderLeft:   chipStyle ? `1px solid rgba(66,133,244,0.25)` : `4px solid ${SAMPLE_COLOR}`,
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 24,
        height: 88,
        display: 'flex',
        alignItems: 'stretch',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: valignMap[valign] || 'flex-start',
          width: '100%',
        }}>
          {renderPreviewContent()}
        </div>
      </div>

      {/* ── Card background style ── */}
      <h3 style={{ marginBottom: 10 }}>Card Background</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[['border', '◧ Border'], ['chip', '▮ Solid']].map(([val, lbl]) => {
          const active = (val === 'chip') === chipStyle;
          return (
            <button
              key={val}
              onClick={() => setCs({ chipStyle: val === 'chip' })}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 'var(--s-base)', cursor: 'pointer',
                fontFamily: 'var(--font)',
                border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--text)',
                fontWeight: active ? 600 : 400,
              }}
            >
              {lbl}
            </button>
          );
        })}
      </div>

      {/* ── Card elements ── */}
      <h3 style={{ marginBottom: 4 }}>Card Elements</h3>
      <p style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', marginBottom: 10 }}>
        Drag to reorder · toggle checkbox to show or hide
      </p>
      {cardElements.map((el, i) => {
        const isTarget = dropTarget === `card-elem-${i}`;
        return (
          <div
            key={el.key}
            draggable
            onDragStart={(e) => onElemDragStart(e, i)}
            onDragOver={(e) => { e.preventDefault(); setDropTarget(`card-elem-${i}`); }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => onElemDrop(e, i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 6, marginBottom: 6, cursor: 'grab',
              border: `1px solid ${isTarget ? 'var(--accent)' : 'var(--border)'}`,
              background: isTarget ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--bg-secondary)',
            }}
          >
            <span style={{ color: 'var(--text-muted)', fontSize: 16, cursor: 'grab', lineHeight: 1 }}>⠿</span>
            <input
              type="checkbox"
              checked={el.visible !== false}
              onChange={() => toggleElem(i)}
              style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 'var(--s-base)', flex: 1, color: el.visible !== false ? 'var(--text)' : 'var(--text-muted)' }}>
              {el.label}
            </span>
          </div>
        );
      })}

      {/* ── Options ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 0', borderTop: '1px solid var(--border)', marginTop: 4,
      }}>
        <input
          type="checkbox"
          checked={emojiAsBadge}
          onChange={(e) => setCs({ emojiAsBadge: e.target.checked })}
          style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
        />
        <span style={{ flex: 1, fontSize: 'var(--s-base)' }}>Show emoji as circle badge</span>
        <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>from icon rules</span>
      </div>

      {/* ── Alignment 3×3 grid ── */}
      <h3 style={{ marginBottom: 10, marginTop: 20 }}>Alignment</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 24, maxWidth: 200 }}>
        {[
          ['top','left','↖'],['top','center','↑'],['top','right','↗'],
          ['middle','left','←'],['middle','center','·'],['middle','right','→'],
          ['bottom','left','↙'],['bottom','center','↓'],['bottom','right','↘'],
        ].map(([v, h, icon]) => {
          const active = valign === v && align === h;
          return (
            <button
              key={`${v}-${h}`}
              onClick={() => setCs({ align: h, valign: v })}
              title={`${v} ${h}`}
              style={{
                padding: '10px 0', borderRadius: 6, fontSize: 16, cursor: 'pointer',
                fontFamily: 'var(--font)', lineHeight: 1,
                border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {icon}
            </button>
          );
        })}
      </div>

      {/* ── Popout preview ── */}
      <h3 style={{ marginBottom: 10, marginTop: 4 }}>Popout Preview</h3>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
          background: `color-mix(in srgb, ${SAMPLE_COLOR} 8%, var(--surface))`,
        }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--s-base)' }}>{SAMPLE_EMOJI} Team Meeting</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--s-base)' }}>✕</span>
        </div>
        <div style={{ padding: '4px 0' }}>
          {popoutElements.filter(e => e.visible !== false).map((el) => {
            const s = POPOUT_SAMPLES[el.key];
            if (!s) return null;
            return (
              <div key={el.key} style={{
                display: 'flex', gap: 12, padding: '6px 14px',
                fontSize: 'var(--s-sm)', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 60 }}>{s.label}</span>
                <span style={{ color: s.color || 'var(--text)' }}>{s.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Popout elements ── */}
      <h3 style={{ marginBottom: 4 }}>Popout Elements</h3>
      <p style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', marginBottom: 10 }}>
        Drag to reorder · toggle to show or hide.
      </p>
      {popoutElements.map((el, i) => {
        const isTarget = dropTarget === `popout-elem-${i}`;
        return (
          <div
            key={el.key}
            draggable
            onDragStart={(e) => onPopoutDragStart(e, i)}
            onDragOver={(e) => { e.preventDefault(); setDropTarget(`popout-elem-${i}`); }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => onPopoutDrop(e, i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 6, marginBottom: 6, cursor: 'grab',
              border: `1px solid ${isTarget ? 'var(--accent)' : 'var(--border)'}`,
              background: isTarget ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--bg-secondary)',
            }}
          >
            <span style={{ color: 'var(--text-muted)', fontSize: 16, cursor: 'grab', lineHeight: 1 }}>⠿</span>
            <input
              type="checkbox"
              checked={el.visible !== false}
              onChange={() => togglePopoutElem(i)}
              style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 'var(--s-base)', flex: 1, color: el.visible !== false ? 'var(--text)' : 'var(--text-muted)' }}>
              {el.label}
            </span>
          </div>
        );
      })}

    </div>
  );
})()}

          {/* ── Filters tab ───────────────────────────────────── */}
          {activeTab === 'eventfilters' && (() => {
            const rules = eventFiltersCfg?.rules ?? [];

            function updateRule(i, field, val) {
              const next = rules.map((r, ri) => ri === i ? { ...r, [field]: val } : r);
              setEventFiltersCfg({ ...(eventFiltersCfg || {}), rules: next });
            }
            function removeRule(i) {
              setEventFiltersCfg({ ...(eventFiltersCfg || {}), rules: rules.filter((_, ri) => ri !== i) });
            }
            function addRule() {
              setEventFiltersCfg({ ...(eventFiltersCfg || {}), rules: [...rules, { keyword: '', enabled: true }] });
            }
            function onFilterDragStart(e, idx) {
              drag.current = { type: 'filter-rule', fromIdx: idx };
              e.dataTransfer.effectAllowed = 'move';
              e.stopPropagation();
            }
            function onFilterDrop(e, toIdx) {
              e.preventDefault();
              if (!drag.current || drag.current.type !== 'filter-rule') return;
              const { fromIdx } = drag.current;
              if (fromIdx !== toIdx) {
                const next = [...rules];
                const [moved] = next.splice(fromIdx, 1);
                next.splice(toIdx, 0, moved);
                setEventFiltersCfg({ ...(eventFiltersCfg || {}), rules: next });
              }
              drag.current = null;
              setDropTarget(null);
            }

            return (
              <div className="settings-section">
                <h3 style={{ marginBottom: 6 }}>Hidden Event Rules</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
                  Events whose title matches any active rule are hidden from the calendar.
                  Separate multiple keywords with commas — any match will hide the event.
                </p>

                {rules.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-base)', padding: '8px 0' }}>
                    No filters yet. Add one below.
                  </p>
                )}

                {rules.map((rule, i) => {
                  const isDropTgt = dropTarget?.type === 'filter-rule' && dropTarget?.beforeIdx === i;
                  return (
                    <div
                      key={i}
                      className={`cal-row${isDropTgt ? ' cal-row-drop-target' : ''}`}
                      draggable
                      onDragStart={(e) => onFilterDragStart(e, i)}
                      onDragEnd={onDragEnd}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ type: 'filter-rule', beforeIdx: i }); }}
                      onDrop={(e) => onFilterDrop(e, i)}
                      style={{ gap: 8 }}
                    >
                      <span className="drag-handle">⠿</span>
                      <input
                        type="checkbox"
                        checked={rule.enabled !== false}
                        onChange={(e) => updateRule(i, 'enabled', e.target.checked)}
                        title="Enable this filter"
                        style={{ accentColor: 'var(--danger)', flexShrink: 0 }}
                      />
                      <input
                        type="text"
                        value={rule.keyword}
                        onChange={(e) => updateRule(i, 'keyword', e.target.value)}
                        placeholder="vitamin, reminder, daily check-in…"
                        style={{ flex: 1, fontSize: 'var(--s-base)', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', padding: '5px 8px' }}
                      />
                      <button className="btn-icon" style={{ fontSize: 'var(--s-base)', color: 'var(--danger)' }} onClick={() => removeRule(i)}>✕</button>
                    </div>
                  );
                })}

                <button className="btn" style={{ fontSize: 'var(--s-sm)', padding: '4px 10px', marginTop: 8 }} onClick={addRule}>
                  + Add filter rule
                </button>
              </div>
            );
          })()}

          {/* ── Keep Notes tab ─────────────────────────────────── */}
          {activeTab === 'keepnotes' && (() => {
            const DEFAULT_KEEP_NOTES = [
              { title: 'Shopping List', key: 'shopping-list', label: 'Shopping List', visible: true },
            ];
            const notes = (keepNotesCfg && keepNotesCfg.length > 0) ? keepNotesCfg : DEFAULT_KEEP_NOTES;

            function slugify(str) {
              return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            }
            function updateNote(i, field, val) {
              const next = notes.map((n, ni) => ni === i ? { ...n, [field]: val } : n);
              setKeepNotesCfg(next);
            }
            function removeNote(i) {
              setKeepNotesCfg(notes.filter((_, ni) => ni !== i));
            }
            function addNote() {
              setKeepNotesCfg([...notes, { title: '', key: '', label: '', visible: true }]);
            }

            return (
              <div className="settings-section">
                <h3 style={{ marginBottom: 6 }}>Google Keep Notes</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
                  Configure which Google Keep notes the scraper reads and the sidebar displays.
                  The <strong>Note Title</strong> must match the exact title in Google Keep.
                  After adding a new note, the scraper will pick it up automatically on the next run.
                </p>

                {notes.map((note, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={note.visible !== false}
                        onChange={(e) => updateNote(i, 'visible', e.target.checked)}
                        title="Show in sidebar"
                        style={{ flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 160px' }}>
                          <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>Note Title (exact match in Keep)</span>
                          <input
                            className="cal-name-input"
                            value={note.title}
                            onChange={(e) => {
                              const title = e.target.value;
                              const updates = { title };
                              // Auto-fill key if it hasn't been manually set yet
                              if (!note.key || note.key === slugify(notes[i]?.title || '')) {
                                updates.key = slugify(title);
                              }
                              // Auto-fill label if it matches the old title
                              if (!note.label || note.label === notes[i]?.title) {
                                updates.label = title;
                              }
                              const next = notes.map((n, ni) => ni === i ? { ...n, ...updates } : n);
                              setKeepNotesCfg(next);
                            }}
                            placeholder="Shopping List"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 140px' }}>
                          <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>Sidebar Label</span>
                          <input
                            className="cal-name-input"
                            value={note.label || note.title}
                            onChange={(e) => updateNote(i, 'label', e.target.value)}
                            placeholder="Shopping List"
                          />
                        </div>
                      </div>
                      <button
                        className="btn-icon"
                        style={{ fontSize: 'var(--s-base)', color: 'var(--danger)', flexShrink: 0 }}
                        onClick={() => removeNote(i)}
                        title="Remove note"
                      >✕</button>
                    </div>
                    <div style={{ paddingLeft: 24, fontSize: 'var(--s-xs)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      key: {note.key || <em style={{ fontFamily: 'var(--font)' }}>auto-generated from title</em>}
                    </div>
                  </div>
                ))}

                <button
                  className="btn"
                  style={{ fontSize: 'var(--s-sm)', padding: '4px 10px', marginTop: 12 }}
                  onClick={addNote}
                >
                  + Add Keep note
                </button>

                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginTop: 16 }}>
                  <strong>Using meal planning?</strong> Add your meal plan note here first, then go to the <em>Meal Plan</em> tab and select it as the source. The note doesn't need to be sidebar-visible unless you want it there.
                </p>

                {/* Task Lists sub-section */}
                <h3 style={{ marginTop: 24, marginBottom: 6 }}>Google Task Lists</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-base)', marginBottom: 12 }}>
                  Choose which Google Task lists are visible. Synced every 5 minutes.
                </p>
                {listRows.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-base)' }}>
                    No task lists found. Wait for the next sync.
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
                    <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {row.itemCount} item{row.itemCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Meal Plan tab ─────────────────────────────────── */}
          {activeTab === 'mealplan' && (() => {
  const mp  = mealPlanCfg || {};
  function setMp(patch) { setMealPlanCfg({ ...mp, ...patch }); }

  const noteKey       = mp.noteKey       ?? 'meal-planning';
  const prepStartDay  = 'prepStartDay' in mp ? mp.prepStartDay : 4;  // null = off, 4 = default Thu
  const freezePast    = mp.freezePastDays ?? true;
  const eventPrefix   = mp.eventPrefix   ?? 'Dinner: ';
  const noteFormat    = mp.noteFormat    ?? 'multiline';

  // Week display order: Sat Sun Mon Tue Wed Thu Fri
  // Each entry: [label, JS dow]
  const WEEK = [
    ['Sat', 6], ['Sun', 0], ['Mon', 1], ['Tue', 2],
    ['Wed', 3], ['Thu', 4], ['Fri', 5],
  ];

  // Source note options from keepNotesCfg
  const keepNotes = keepNotesCfg && keepNotesCfg.length > 0 ? keepNotesCfg : [];

  // Format example text
  const sampleMeal = eventPrefix ? `${eventPrefix}Pizza Margherita` : 'Pizza Margherita';
  const multilineExample = `Saturday:\n- Pizza Margherita\n\nSunday:\n- Roast Chicken\nhttps://recipe.example.com\n\nMonday:\n- Tacos`;
  const inlineExample    = `Saturday: Pizza Margherita\nSunday: Roast Chicken\nMonday: Tacos`;

  return (
    <div className="settings-section">

      {/* ── Source note ── */}
      <h3 style={{ marginBottom: 6 }}>Meal Plan Note</h3>
      <p style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', marginBottom: 10 }}>
        Select which Google Keep note contains your meal plan. If it doesn't appear here, add it in the <strong>Keep Notes</strong> tab first.
      </p>
      {keepNotes.length === 0 ? (
        <p style={{ fontSize: 'var(--s-base)', color: 'var(--danger)' }}>
          No Keep notes configured yet — go to the <strong>Keep Notes</strong> tab and add your meal plan note, then come back here.
        </p>
      ) : (
        <select
          value={noteKey}
          onChange={(e) => setMp({ noteKey: e.target.value })}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: 'var(--s-base)', fontFamily: 'var(--font)',
            marginBottom: 24,
          }}
        >
          {keepNotes.map((n) => (
            <option key={n.key} value={n.key}>{n.label || n.title} ({n.key})</option>
          ))}
        </select>
      )}

      {/* ── Week anchoring ── */}
      <h3 style={{ marginBottom: 6 }}>Week Anchoring</h3>
      <p style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', marginBottom: 14 }}>
        On which day does editing the note mean you're planning <strong>next</strong> week?
        Days to the left update the current week. Days to the right prep next week.
        Set to <strong>Off</strong> to always update the current week.
      </p>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, marginBottom: 8 }}>
        {WEEK.map(([label, dow], i) => {
          const isNextWeek  = prepStartDay !== null && dow === prepStartDay;
          const isInNext    = prepStartDay !== null && (() => {
            // Is this day in the "next week" zone?
            const weekOrder = [6,0,1,2,3,4,5]; // Sat→Fri
            return weekOrder.indexOf(dow) >= weekOrder.indexOf(prepStartDay);
          })();
          const active = isInNext;

          return (
            <button
              key={dow}
              onClick={() => setMp({ prepStartDay: dow === prepStartDay ? null : dow })}
              title={active ? `${label}: preps next week` : `${label}: updates this week`}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 'var(--s-sm)',
                fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active
                  ? 'color-mix(in srgb, var(--accent) 14%, var(--surface))'
                  : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                position: 'relative',
              }}
            >
              {label}
              {isNextWeek && (
                <span style={{
                  position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 9, background: 'var(--accent)', color: '#fff',
                  borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap',
                }}>cutover</span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setMp({ prepStartDay: null })}
          title="Never prep ahead — always update current week"
          style={{
            padding: '10px 10px', borderRadius: 6, fontSize: 'var(--s-xs)',
            cursor: 'pointer', fontFamily: 'var(--font)',
            border: `2px solid ${prepStartDay === null ? 'var(--accent)' : 'var(--border)'}`,
            background: prepStartDay === null
              ? 'color-mix(in srgb, var(--accent) 14%, var(--surface))'
              : 'var(--surface)',
            color: prepStartDay === null ? 'var(--accent)' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          Off
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--s-xs)', color: 'var(--text-muted)', marginBottom: 24 }}>
        <span>← Updates this week</span>
        {prepStartDay !== null && <span>Preps next week →</span>}
        {prepStartDay === null && <span style={{ color: 'var(--accent)' }}>Always current week</span>}
      </div>

      {/* ── Freeze past days ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)', marginBottom: 24 }}>
        <input
          type="checkbox"
          checked={freezePast}
          onChange={(e) => setMp({ freezePastDays: e.target.checked })}
          style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
        />
        <div>
          <div style={{ fontSize: 'var(--s-base)', fontWeight: 500 }}>Freeze past days</div>
          <div style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>
            Never create, update, or delete calendar events for dates that have already passed. Today is always editable.
          </div>
        </div>
      </div>

      {/* ── Event prefix ── */}
      <h3 style={{ marginBottom: 6 }}>Calendar Event Prefix</h3>
      <p style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', marginBottom: 8 }}>
        Text prepended to the meal name in Google Calendar. Leave blank for just the meal name.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <input
          className="cal-name-input"
          value={eventPrefix}
          onChange={(e) => setMp({ eventPrefix: e.target.value })}
          placeholder="Dinner: "
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', flexShrink: 0 }}>
          → shows as "{sampleMeal}"
        </span>
      </div>
      <div style={{ marginBottom: 24 }} />

      {/* ── Note format ── */}
      <h3 style={{ marginBottom: 6 }}>Note Format</h3>
      <p style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', marginBottom: 10 }}>
        How your meal plan note is structured in Google Keep.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['multiline', 'Multi-line'], ['inline', 'Inline']].map(([val, lbl]) => {
          const active = noteFormat === val;
          return (
            <button
              key={val}
              onClick={() => setMp({ noteFormat: val })}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 'var(--s-base)',
                cursor: 'pointer', fontFamily: 'var(--font)',
                border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--text)',
                fontWeight: active ? 600 : 400,
              }}
            >
              {lbl}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)', marginBottom: 8 }}>
        {noteFormat === 'multiline'
          ? 'Day name on its own line, meal on the next line starting with "- ". Optionally add a recipe URL on its own line after the meal — it will appear as a link in the calendar event.'
          : 'Day name and meal on the same line, separated by a colon. Recipe URLs are not supported in inline format.'}
      </p>
      <pre style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '10px 14px', fontSize: 'var(--s-sm)',
        fontFamily: 'monospace', color: 'var(--text)', whiteSpace: 'pre',
        overflowX: 'auto', lineHeight: 1.6,
      }}>
        {noteFormat === 'multiline' ? multilineExample : inlineExample}
      </pre>

    </div>
  );
})()}

          {/* ── Weather tab ───────────────────────────────────── */}
          {activeTab === 'weather' && (() => {
            const src = weatherSource || 'ambient';
            const SectionDivider = ({ label }) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 16px' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 'var(--s-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            );
            const OptionPicker = ({ options, value, onChange }) => (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {options.map(({ id, label, desc }) => {
                  const active = value === id;
                  return (
                    <button key={id} onClick={() => onChange(id)} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                      border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                      color: active ? 'var(--accent)' : 'var(--text)', fontFamily: 'var(--font)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    }}>
                      <span style={{ fontWeight: 600, fontSize: 'var(--s-base)' }}>{label}</span>
                      {desc && <span style={{ fontSize: 'var(--s-xs)', color: active ? 'var(--accent)' : 'var(--text-muted)', opacity: 0.85 }}>{desc}</span>}
                    </button>
                  );
                })}
              </div>
            );

            return (
              <div className="settings-section">

                {/* ── Enable ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    id="weather-enabled"
                    checked={weatherEnabled}
                    onChange={(e) => setWeatherConfig({ ...weatherConfig, enabled: e.target.checked })}
                  />
                  <label htmlFor="weather-enabled" style={{ fontWeight: 500 }}>Show weather widget</label>
                </div>

                {/* ════ DATA SOURCE ════ */}
                <SectionDivider label="Data Source" />

                <p style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
                  Choose where current conditions come from. The 7-day forecast always uses Open-Meteo.
                </p>
                <OptionPicker
                  options={[
                    { id: 'ambient',   label: 'Ambient Weather', desc: 'Personal weather station' },
                    { id: 'openmeteo', label: 'Open-Meteo',      desc: 'No station required'      },
                  ]}
                  value={src}
                  onChange={setWeatherSource}
                />

                {/* Ambient API keys */}
                {src === 'ambient' && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '14px 16px', marginTop: 4 }}>
                    <h3 style={{ margin: '0 0 6px' }}>API Keys</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 12 }}>
                      From <strong>ambientweather.net → Account → API Keys</strong>. Location is read automatically from your station.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ fontSize: 'var(--s-base)' }}>
                        API Key
                        <input className="cal-name-input" type="password" value={awApiKey}
                          onChange={(e) => setAwApiKey(e.target.value)} placeholder="Your API key"
                          autoComplete="off"
                          style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'monospace', fontSize: 'var(--s-sm)' }} />
                      </label>
                      <label style={{ fontSize: 'var(--s-base)' }}>
                        Application Key
                        <input className="cal-name-input" type="password" value={awAppKey}
                          onChange={(e) => setAwAppKey(e.target.value)} placeholder="Your application key"
                          autoComplete="off"
                          style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'monospace', fontSize: 'var(--s-sm)' }} />
                      </label>
                      <button className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={saveWeatherKeys}>
                        {keysSaved ? '✓ Saved' : 'Save Keys'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Open-Meteo location */}
                {src === 'openmeteo' && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '14px 16px', marginTop: 4 }}>
                    <h3 style={{ margin: '0 0 6px' }}>Location</h3>
                    <p style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
                      Used for both current conditions and the forecast. Device location works worldwide; zip lookup is US only.
                    </p>
                    {weatherLocation?.label && (
                      <div style={{ fontSize: 'var(--s-base)', color: 'var(--accent)', marginBottom: 12, fontWeight: 500 }}>
                        📍 Current: {weatherLocation.label}
                      </div>
                    )}
                    <button className="btn" style={{ width: '100%', marginBottom: 10, fontSize: 'var(--s-base)' }}
                      onClick={useDeviceLocation} disabled={locationStatus === 'loading'}>
                      {locationStatus === 'loading' ? 'Detecting…' : '📡 Use device location'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>or enter a zip code</span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="cal-name-input" type="text" value={zipInput}
                        onChange={(e) => setZipInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && lookupZip()}
                        placeholder="e.g. 78701" maxLength={10} style={{ flex: 1, fontSize: 'var(--s-base)' }} />
                      <button className="btn btn-primary" style={{ fontSize: 'var(--s-base)', padding: '5px 14px', flexShrink: 0 }}
                        onClick={lookupZip} disabled={locationStatus === 'loading' || !zipInput.trim()}>
                        Look up
                      </button>
                    </div>
                    {locationMsg && (
                      <div style={{
                        marginTop: 8, fontSize: 'var(--s-sm)', padding: '6px 10px', borderRadius: 6,
                        background: locationStatus === 'error' ? 'color-mix(in srgb, var(--danger) 12%, var(--surface))' : 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
                        color: locationStatus === 'error' ? 'var(--danger)' : 'var(--accent)',
                      }}>{locationMsg}</div>
                    )}
                  </div>
                )}

                {/* ════ CURRENT CONDITIONS WIDGET ════ */}
                <SectionDivider label="Current Conditions Widget" />

                <h3 style={{ marginBottom: 8 }}>Position</h3>
                <select className="cal-name-input" style={{ fontSize: 'var(--s-base)', padding: '5px 8px', marginBottom: 18 }}
                  value={weatherConfig?.position || 'below-header'}
                  onChange={(e) => setWeatherConfig({ ...weatherConfig, position: e.target.value })}>
                  <option value="below-header">Below header bar</option>
                  <option value="in-header">Inside header bar</option>
                </select>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 16 }}>
                  On mobile the widget always appears below the header.
                </p>

                <h3 style={{ marginBottom: 8 }}>Label Style</h3>
                <OptionPicker
                  options={[
                    { id: 'text', label: 'Text', desc: 'Feels Like, Humidity…' },
                    { id: 'icon', label: 'Icons', desc: 'Single-colour SVG icons' },
                  ]}
                  value={weatherConfig?.labelMode || 'text'}
                  onChange={(v) => setWeatherConfig({ ...weatherConfig, labelMode: v })}
                />

                <h3 style={{ marginBottom: 6 }}>Fields</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 10 }}>
                  Drag to reorder. Check to show, uncheck to hide.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <input type="checkbox" id="hide-rain-zero"
                    checked={weatherConfig?.hideRainIfZero !== false}
                    onChange={(e) => setWeatherConfig({ ...weatherConfig, hideRainIfZero: e.target.checked })} />
                  <label htmlFor="hide-rain-zero" style={{ fontSize: 'var(--s-base)' }}>Hide Rain Today when value is zero</label>
                </div>

                {weatherFields.map((key, idx) => {
                  const def = ALL_WEATHER_FIELDS.find((f) => f.key === key);
                  if (!def) return null;
                  const isDropTarget = dropTarget?.type === 'weather-field' && dropTarget?.beforeIdx === idx;
                  return (
                    <div key={key} className={`cal-row${isDropTarget ? ' cal-row-drop-target' : ''}`}
                      draggable onDragStart={(e) => onWeatherDragStart(e, idx)} onDragEnd={onDragEnd}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ type: 'weather-field', beforeIdx: idx }); }}
                      onDrop={(e) => onWeatherDrop(e, idx)}>
                      <span className="drag-handle">⠿</span>
                      <input type="checkbox" checked={true} onChange={() => toggleWeatherField(key)} />
                      <span style={{ fontSize: 'var(--s-base)' }}>{def.label}</span>
                    </div>
                  );
                })}
                {ALL_WEATHER_FIELDS.filter(({ key }) => !weatherFields.includes(key)).map(({ key, label }) => (
                  <div key={key} className="cal-row" style={{ gap: 6, opacity: 0.5 }}>
                    <span className="drag-handle" style={{ visibility: 'hidden' }}>⠿</span>
                    <input type="checkbox" checked={false} onChange={() => toggleWeatherField(key)} />
                    <span style={{ fontSize: 'var(--s-base)' }}>{label}</span>
                  </div>
                ))}

                {/* ════ FORECAST ════ */}
                <SectionDivider label="Forecast" />

                <p style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
                  The 7-day forecast appears on the calendar. Tap any day's card to see the hourly detail.
                </p>
                <h3 style={{ marginBottom: 8 }}>Hourly Detail Layout</h3>
                <OptionPicker
                  options={[
                    { id: 'list',  label: 'List',  desc: 'Rows by hour' },
                    { id: 'chart', label: 'Chart', desc: 'Bar graph + temp line' },
                  ]}
                  value={weatherConfig?.forecastLayout || 'list'}
                  onChange={(v) => setWeatherConfig({ ...weatherConfig, forecastLayout: v })}
                />

              </div>
            );
          })()}

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
                style={{ marginBottom: 20, fontSize: 'var(--s-md)' }}
              />

              {/* Favicon */}
              <h3 style={{ marginBottom: 10 }}>App Icon</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
                {[
                  { id: 'house',    label: 'House',    src: '/favicon-house.svg'    },
                  { id: 'calendar', label: 'Calendar', src: '/favicon-calendar.svg' },
                  { id: 'hub',      label: 'Hub',      src: '/favicon-hub.svg'      },
                  { id: 'mono',     label: 'Monogram', src: '/favicon-mono.svg'     },
                  { id: 'bolt',     label: 'Bolt',     src: '/favicon.svg'          },
                ].map(({ id, label, src }) => {
                  const active = (faviconCfg || 'house') === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setFaviconCfg(id)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                      }}
                    >
                      <img src={src} width="28" height="28" alt={label} style={{ display: 'block' }} />
                      <span style={{ fontSize: 'var(--s-xs)', fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text-muted)' }}>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Text Size */}
              <h3 style={{ marginBottom: 10 }}>Text Size</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
                {[
                  { id: 'compact', label: 'Compact', sample: '12px' },
                  { id: 'default', label: 'Default', sample: '14px' },
                  { id: 'large',   label: 'Large',   sample: '17px' },
                  { id: 'xl',      label: 'XL',      sample: '20px' },
                ].map(({ id, label, sample }) => {
                  const active = (fontSizeCfg || 'default') === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setFontSizeCfg(id)}
                      style={{
                        border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 8,
                        background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                        cursor: 'pointer',
                        padding: '10px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span style={{ fontSize: sample, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)', lineHeight: 1 }}>Aa</span>
                      <span style={{ fontSize: 'var(--s-xs)', fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text-muted)' }}>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Accent Color */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ flex: 1, margin: 0 }}>Accent Color</h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--s-base)', color: 'var(--text-muted)', cursor: 'pointer' }}>
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
                  <span style={{ fontSize: 'var(--s-base)', color: 'var(--text-muted)', flex: 1 }}>
                    Replaces the default blue on buttons, highlights, and today's date.
                  </span>
                  <button className="btn" style={{ fontSize: 'var(--s-xs)', padding: '3px 8px' }}
                    onClick={() => setAccentColorCfg({ ...(accentColorCfg || {}), color: '#1a73e8' })}>
                    Reset
                  </button>
                </div>
              )}
              {!(accentColorCfg?.enabled) && (
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 20 }}>
                  Uses the default blue accent. Enable to override.
                </p>
              )}

              {/* Header Style */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ flex: 1, margin: 0 }}>Header Style</h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--s-base)', color: 'var(--text-muted)', cursor: 'pointer' }}>
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
                            padding: '6px 10px', fontSize: 'var(--s-sm)', borderRadius: 6, cursor: 'pointer',
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
                        <span style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)' }}>Gradient colors</span>
                      </div>
                    )}
                  </>
                );
              })()}
              {!(headerStyleCfg?.enabled) && (
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 20 }}>
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
                      fontFamily: 'var(--font)', fontWeight: theme === value ? 600 : 400, fontSize: 'var(--s-base)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginTop: 10, marginBottom: 20 }}>
                Auto follows your device's system preference.
              </p>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
