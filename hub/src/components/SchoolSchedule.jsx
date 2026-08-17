import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useProfiles } from '../hooks/useProfiles';
import { useSchoolSchedules } from '../hooks/useSchoolSchedules';
import { useSchoolScheduleBlocks } from '../hooks/useSchoolScheduleBlocks';
import { useSchoolCalendarExceptions } from '../hooks/useSchoolCalendarExceptions';
import {
  dateStr, parseDateStr, getDayKey, getBlocksForDay, formatTime,
  getWeekdayStrip, sameDay, WEEKDAY_LABELS,
} from '../utils/schoolSchedule';

const WEEKLY_DAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

const EXCEPTION_TYPES = [
  { value: 'snow_day',        label: '❄ Snow day' },
  { value: 'holiday',         label: '🎉 Holiday' },
  { value: 'break',           label: '🏖 Break' },
  { value: 'teacher_workday', label: '🧑‍🏫 Teacher workday' },
  { value: 'early_dismissal', label: '⏰ Early dismissal' },
  { value: 'other',           label: 'Other' },
];

const selectStyle = { fontSize: 'var(--s-sm)', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', padding: '5px 6px', fontFamily: 'var(--font)' };
const inputBoxStyle = { fontSize: 'var(--s-sm)', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', padding: '5px 8px', fontFamily: 'var(--font)' };
const fieldLabelStyle = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 'var(--s-xs)', color: 'var(--text-muted)' };

// Editable, general-purpose block/rotation school schedule — supports as
// many kids, day-letter styles, and rotation lengths as needed (a 4-block
// A/B/C/D middle-school rotation today, a plain Mon–Fri elementary
// schedule, or something else entirely next year). Nothing about any
// specific kid's actual classes lives in this file — it's all data,
// entered and edited through the Manage UI below.
export default function SchoolSchedule({ profile, onClose }) {
  const schedules   = useSchoolSchedules();
  const allProfiles = useProfiles();
  const exceptions  = useSchoolCalendarExceptions();
  const isAdmin = !!profile?.is_admin;

  const [selectedId, setSelectedId] = useState(null);
  const [viewDate, setViewDate]     = useState(() => new Date());
  const [manageTab, setManageTab]   = useState(null); // null = view mode
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [newScheduleProfileId, setNewScheduleProfileId] = useState('');
  const [newExDate, setNewExDate]   = useState(() => dateStr(new Date()));
  const [newExType, setNewExType]   = useState('snow_day');
  const [newExNote, setNewExNote]   = useState('');
  const [newExClosed, setNewExClosed] = useState(true);

  const activeId = selectedId && schedules.some((s) => s.id === selectedId) ? selectedId : (schedules[0]?.id || null);
  const activeSchedule = schedules.find((s) => s.id === activeId) || null;
  const blocks = useSchoolScheduleBlocks(activeId);

  const exceptionsByDate = {};
  exceptions.forEach((e) => { exceptionsByDate[e.date] = e; });

  async function updateScheduleField(id, field, value) {
    await supabase.from('school_schedules').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', id);
  }

  async function handleAddSchedule() {
    if (!newScheduleProfileId) return;
    const { data } = await supabase.from('school_schedules').insert({
      profile_id: newScheduleProfileId,
      schedule_type: 'rotation',
      day_letters: ['A', 'B', 'C', 'D'],
      school_days_of_week: [1, 2, 3, 4, 5],
    }).select().maybeSingle();
    setNewScheduleProfileId('');
    if (data) { setSelectedId(data.id); setManageTab('blocks'); }
  }

  async function handleDeleteSchedule(id) {
    await supabase.from('school_schedules').delete().eq('id', id);
    setDeleteConfirmId(null);
  }

  async function updateBlockField(id, field, value) {
    await supabase.from('school_schedule_blocks').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', id);
  }

  async function handleAddBlock() {
    const dayKeyOptions = activeSchedule?.schedule_type === 'weekly' ? WEEKLY_DAY_KEYS : (activeSchedule?.day_letters || []);
    await supabase.from('school_schedule_blocks').insert({
      schedule_id: activeId,
      day_key: dayKeyOptions[0] || 'A',
      start_time: '08:00',
      end_time: '08:45',
      course_name: 'New class',
    });
  }

  async function handleDeleteBlock(id) {
    await supabase.from('school_schedule_blocks').delete().eq('id', id);
  }

  async function handleAddException() {
    if (!newExDate) return;
    await supabase.from('school_calendar_exceptions').upsert(
      { date: newExDate, type: newExType, note: newExNote || null, school_closed: newExClosed },
      { onConflict: 'date' }
    );
    setNewExNote('');
  }

  async function handleQuickSnowDay() {
    await supabase.from('school_calendar_exceptions').upsert(
      { date: dateStr(new Date()), type: 'snow_day', school_closed: true },
      { onConflict: 'date' }
    );
  }

  async function handleDeleteException(date) {
    await supabase.from('school_calendar_exceptions').delete().eq('date', date);
  }

  function renderSchedulesTab() {
    const profilesWithoutSchedule = allProfiles.filter((p) => !schedules.some((s) => s.profile_id === p.id));

    return (
      <div className="settings-section">
        <h3 style={{ marginBottom: 6 }}>Schedules</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
          One schedule per person. "Rotation" cycles through day-letters (A, B, C, D…) that only
          advance on real school days — add a snow day in the Snow Days tab and every day-letter
          after it shifts automatically. "Weekly" is a fixed Mon–Fri schedule that doesn't rotate.
        </p>

        {schedules.map((s) => (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ flex: '1 1 120px' }}>{s.profile?.display_name || 'Unknown'}</strong>
              <select value={s.schedule_type} onChange={(e) => updateScheduleField(s.id, 'schedule_type', e.target.value)} style={selectStyle}>
                <option value="rotation">Rotation (day-letters)</option>
                <option value="weekly">Weekly (fixed Mon–Fri)</option>
              </select>
              <button className="btn-icon" style={{ color: 'var(--danger)' }} title="Delete schedule"
                onClick={() => setDeleteConfirmId(deleteConfirmId === s.id ? null : s.id)}>✕</button>
            </div>

            {deleteConfirmId === s.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--s-sm)' }}>Delete {s.profile?.display_name}'s schedule and all its blocks? This can't be undone.</span>
                <button className="btn" style={{ fontSize: 'var(--s-sm)', color: 'var(--danger)' }} onClick={() => handleDeleteSchedule(s.id)}>Delete</button>
                <button className="btn" style={{ fontSize: 'var(--s-sm)' }} onClick={() => setDeleteConfirmId(null)}>Cancel</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ ...fieldLabelStyle, flex: '1 1 200px' }}>
                <span>School / grade label</span>
                <input className="cal-name-input" style={inputBoxStyle}
                  defaultValue={s.school_name || ''}
                  placeholder="e.g. Lincoln Middle — 7th grade"
                  onBlur={(e) => updateScheduleField(s.id, 'school_name', e.target.value)} />
              </label>

              {s.schedule_type === 'rotation' && (
                <>
                  <label style={fieldLabelStyle}>
                    <span>Day letters (comma-separated)</span>
                    <input className="cal-name-input" style={{ ...inputBoxStyle, width: 100 }}
                      defaultValue={(s.day_letters || []).join(',')}
                      onBlur={(e) => {
                        const next = e.target.value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
                        updateScheduleField(s.id, 'day_letters', next.length ? next : ['A']);
                      }} />
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>Rotation starts</span>
                    <input type="date" style={inputBoxStyle}
                      value={s.rotation_anchor_date || ''}
                      onChange={(e) => updateScheduleField(s.id, 'rotation_anchor_date', e.target.value || null)} />
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>...as Day</span>
                    <select value={s.rotation_anchor_letter || (s.day_letters || [])[0] || ''} style={selectStyle}
                      onChange={(e) => updateScheduleField(s.id, 'rotation_anchor_letter', e.target.value)}>
                      {(s.day_letters || []).map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)', width: '100%' }}>School days</span>
              {WEEKDAY_LABELS.map((label, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--s-sm)' }}>
                  <input type="checkbox" checked={(s.school_days_of_week || []).includes(i)}
                    onChange={(e) => {
                      const cur = s.school_days_of_week || [];
                      const next = e.target.checked ? [...cur, i] : cur.filter((d) => d !== i);
                      updateScheduleField(s.id, 'school_days_of_week', next.sort());
                    }} />
                  {label.slice(0, 3)}
                </label>
              ))}
            </div>
          </div>
        ))}

        <h3 style={{ marginTop: 20, marginBottom: 6 }}>Add a schedule</h3>
        {profilesWithoutSchedule.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>
            Every family member already has a schedule. Add a new person first in Settings → People.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={newScheduleProfileId} onChange={(e) => setNewScheduleProfileId(e.target.value)} style={selectStyle}>
              <option value="">Choose a person…</option>
              {profilesWithoutSchedule.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
            <button className="btn btn-primary" style={{ fontSize: 'var(--s-sm)' }} disabled={!newScheduleProfileId} onClick={handleAddSchedule}>
              + Add schedule
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderBlocksTab() {
    if (schedules.length === 0) {
      return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>Add a schedule first in the Schedules tab.</p>;
    }

    const dayKeyOptions = activeSchedule?.schedule_type === 'weekly' ? WEEKLY_DAY_KEYS : (activeSchedule?.day_letters || []);
    const sortedBlocks = [...blocks].sort((a, b) =>
      a.day_key === b.day_key ? (a.start_time || '').localeCompare(b.start_time || '') : a.day_key.localeCompare(b.day_key)
    );

    return (
      <div className="settings-section">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Blocks</h3>
          <select value={activeId || ''} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.profile?.display_name || 'Unknown'}</option>)}
          </select>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
          Leave "From"/"Until" blank for a class that runs all year — set them only for classes
          that change partway through (e.g. an elective that swaps at the semester).
        </p>

        {sortedBlocks.map((b) => (
          <div key={b.id} className="school-block-row">
            <select value={b.day_key} style={selectStyle} onChange={(e) => updateBlockField(b.id, 'day_key', e.target.value)}>
              {dayKeyOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input type="time" style={inputBoxStyle} value={(b.start_time || '').slice(0, 5)}
              onChange={(e) => updateBlockField(b.id, 'start_time', e.target.value)} />
            <input type="time" style={inputBoxStyle} value={(b.end_time || '').slice(0, 5)}
              onChange={(e) => updateBlockField(b.id, 'end_time', e.target.value)} />
            <input className="cal-name-input" style={{ ...inputBoxStyle, flex: '1 1 140px' }} placeholder="Course"
              defaultValue={b.course_name} onBlur={(e) => updateBlockField(b.id, 'course_name', e.target.value)} />
            <input className="cal-name-input" style={{ ...inputBoxStyle, flex: '1 1 110px' }} placeholder="Teacher"
              defaultValue={b.teacher || ''} onBlur={(e) => updateBlockField(b.id, 'teacher', e.target.value)} />
            <input className="cal-name-input" style={{ ...inputBoxStyle, width: 70 }} placeholder="Room"
              defaultValue={b.room || ''} onBlur={(e) => updateBlockField(b.id, 'room', e.target.value)} />
            <input type="date" style={{ ...inputBoxStyle, width: 132 }} title="Valid from (blank = all year)"
              value={b.valid_from || ''} onChange={(e) => updateBlockField(b.id, 'valid_from', e.target.value || null)} />
            <input type="date" style={{ ...inputBoxStyle, width: 132 }} title="Valid until (blank = all year)"
              value={b.valid_until || ''} onChange={(e) => updateBlockField(b.id, 'valid_until', e.target.value || null)} />
            <button className="btn-icon" style={{ color: 'var(--danger)' }} title="Delete block" onClick={() => handleDeleteBlock(b.id)}>✕</button>
          </div>
        ))}

        <button className="btn" style={{ fontSize: 'var(--s-sm)', marginTop: 10 }} onClick={handleAddBlock}>+ Add block</button>
      </div>
    );
  }

  function renderSnowDaysTab() {
    const todayStr = dateStr(new Date());
    const hasToday = !!exceptionsByDate[todayStr];

    return (
      <div className="settings-section">
        <h3 style={{ marginBottom: 6 }}>Snow Days & Calendar Exceptions</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
          Shared across every kid. Adding a day here removes it from every rotation schedule's
          day-letter count — everything after it pushes forward automatically.
        </p>

        {!hasToday && (
          <button className="btn" style={{ fontSize: 'var(--s-sm)', marginBottom: 16 }} onClick={handleQuickSnowDay}>
            ❄ Mark today as a snow day
          </button>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
          <label style={fieldLabelStyle}>
            <span>Date</span>
            <input type="date" style={inputBoxStyle} value={newExDate} onChange={(e) => setNewExDate(e.target.value)} />
          </label>
          <label style={fieldLabelStyle}>
            <span>Type</span>
            <select value={newExType} style={selectStyle} onChange={(e) => setNewExType(e.target.value)}>
              {EXCEPTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={fieldLabelStyle}>
            <span>Note (optional)</span>
            <input className="cal-name-input" style={{ ...inputBoxStyle, width: 160 }} value={newExNote} onChange={(e) => setNewExNote(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--s-sm)', paddingBottom: 6 }}>
            <input type="checkbox" checked={newExClosed} onChange={(e) => setNewExClosed(e.target.checked)} />
            School closed
          </label>
          <button className="btn btn-primary" style={{ fontSize: 'var(--s-sm)' }} onClick={handleAddException}>+ Add</button>
        </div>

        {exceptions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>None yet.</p>
        ) : (
          [...exceptions].reverse().map((ex) => (
            <div key={ex.date} className="cal-row" style={{ gap: 10 }}>
              <span style={{ fontWeight: 500, width: 100, flexShrink: 0 }}>
                {parseDateStr(ex.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span style={{ flex: '0 0 160px' }}>{EXCEPTION_TYPES.find((t) => t.value === ex.type)?.label || ex.type}</span>
              <span style={{ flex: 1, color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>{ex.note}</span>
              {!ex.school_closed && <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>(school open)</span>}
              <button className="btn-icon" style={{ color: 'var(--danger)' }} title="Delete" onClick={() => handleDeleteException(ex.date)}>✕</button>
            </div>
          ))
        )}
      </div>
    );
  }

  function renderDayView() {
    const weekDays = getWeekdayStrip(viewDate);
    const dayKey = getDayKey(viewDate, activeSchedule, exceptionsByDate);
    const dayBlocks = getBlocksForDay(blocks, dayKey, viewDate);
    const ex = exceptionsByDate[dateStr(viewDate)];
    const noSchool = ex?.school_closed;
    const isWeekly = activeSchedule.schedule_type === 'weekly';

    function goDay(delta) {
      const d = new Date(viewDate);
      d.setDate(d.getDate() + delta);
      setViewDate(d);
    }

    return (
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button className="btn-icon" onClick={() => goDay(-1)}>‹</button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>
            {viewDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
          <button className="btn" onClick={() => setViewDate(new Date())}>Today</button>
          <button className="btn-icon" onClick={() => goDay(1)}>›</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {weekDays.map((d) => {
            const k = getDayKey(d, activeSchedule, exceptionsByDate);
            const e = exceptionsByDate[dateStr(d)];
            return (
              <button key={dateStr(d)} className="school-strip-day" data-selected={sameDay(d, viewDate) || undefined}
                onClick={() => setViewDate(d)}>
                <span className="school-strip-daynum">{d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}</span>
                <span className="school-strip-badge">{k ? (isWeekly ? '✓' : k) : (e?.school_closed ? '❄' : '')}</span>
              </button>
            );
          })}
        </div>

        <div className="school-day-badge">
          {dayKey ? (isWeekly ? WEEKDAY_LABELS[viewDate.getDay()] : `Day ${dayKey}`) : (noSchool ? 'No School' : '—')}
        </div>

        {ex && (
          <div className={`school-exception-banner${noSchool ? '' : ' school-exception-banner--open'}`}>
            {EXCEPTION_TYPES.find((t) => t.value === ex.type)?.label || ex.type}
            {ex.note ? ` — ${ex.note}` : ''}
          </div>
        )}

        {dayKey && dayBlocks.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginTop: 10 }}>
            No blocks set up for {isWeekly ? WEEKDAY_LABELS[viewDate.getDay()] : `Day ${dayKey}`} yet.
          </p>
        )}

        {dayBlocks.length > 0 && (
          <table className="sports-leaderboard" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Time</th><th>Course</th><th>Teacher</th><th>Room</th></tr>
            </thead>
            <tbody>
              {dayBlocks.map((b) => (
                <tr key={b.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatTime(b.start_time)}–{formatTime(b.end_time)}</td>
                  <td>
                    {b.course_name}
                    {b.period_label ? <span style={{ color: 'var(--text-muted)', fontSize: 'var(--s-xs)' }}> · {b.period_label}</span> : null}
                  </td>
                  <td>{b.teacher || '—'}</td>
                  <td>{b.room || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  const MANAGE_TABS = [
    { id: 'schedules', label: 'Schedules' },
    { id: 'blocks',    label: 'Blocks' },
    { id: 'snowdays',  label: 'Snow Days' },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <span>🎒 School Schedule</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isAdmin && (
              <button className="btn" style={{ fontSize: 'var(--s-sm)', padding: '4px 10px' }}
                onClick={() => setManageTab(manageTab ? null : 'schedules')}>
                {manageTab ? '✓ Done' : '⚙ Manage'}
              </button>
            )}
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        {manageTab && (
          <div className="settings-tabs">
            {MANAGE_TABS.map((t) => (
              <button key={t.id} className={`settings-tab${manageTab === t.id ? ' active' : ''}`} onClick={() => setManageTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="settings-body">
          {manageTab === 'schedules' && renderSchedulesTab()}
          {manageTab === 'blocks'    && renderBlocksTab()}
          {manageTab === 'snowdays'  && renderSnowDaysTab()}

          {!manageTab && schedules.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>
              No school schedules set up yet. {isAdmin ? 'Click "Manage" above to add one.' : 'Ask an admin to set one up.'}
            </p>
          )}

          {!manageTab && schedules.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                {schedules.map((s) => (
                  <button key={s.id} className={`btn${activeId === s.id ? ' btn-primary' : ''}`} style={{ fontSize: 'var(--s-sm)' }}
                    onClick={() => setSelectedId(s.id)}>
                    {s.profile?.display_name || 'Unknown'}
                  </button>
                ))}
              </div>
              {activeSchedule && renderDayView()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
