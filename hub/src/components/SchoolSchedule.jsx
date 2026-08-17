import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useProfiles } from '../hooks/useProfiles';
import { useSchoolSchedules } from '../hooks/useSchoolSchedules';
import { useSchoolSchedulePeriods } from '../hooks/useSchoolSchedulePeriods';
import { useSchoolScheduleAssignments } from '../hooks/useSchoolScheduleAssignments';
import { useSchoolCalendarExceptions } from '../hooks/useSchoolCalendarExceptions';
import {
  dateStr, parseDateStr, getDayKey, getDayEntries, groupPeriodsByBlock, formatTime,
  addMinutesToTime, minutesBetween, getWeekdayStrip, sameDay, WEEKDAY_LABELS,
} from '../utils/schoolSchedule';

const WEEKLY_DAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

// Block 1/2/4 as one 82-minute period, Block 3 split into three 41-minute
// parts around lunch — the shape this app is built around by default.
// Purely a starting point: every number here is editable afterward.
const DEFAULT_TEMPLATE = [
  { parts: 1, minutes: 82 },
  { parts: 1, minutes: 82 },
  { parts: 3, minutes: 41 },
  { parts: 1, minutes: 82 },
];

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

async function seedDefaultPeriods(scheduleId) {
  let cursor = '08:00';
  const rows = [];
  DEFAULT_TEMPLATE.forEach((block, bi) => {
    for (let slot = 0; slot < block.parts; slot++) {
      const start = cursor;
      const end = addMinutesToTime(start, block.minutes);
      rows.push({ schedule_id: scheduleId, block_number: bi + 1, slot_index: slot, start_time: start, end_time: end });
      cursor = end;
    }
  });
  await supabase.from('school_schedule_periods').insert(rows);
}

// Editable, general-purpose block/rotation school schedule — supports as
// many kids, day-letter styles, and rotation lengths as needed (a 4-block
// A/B/C/D middle-school rotation today, a plain Mon–Fri elementary
// schedule, or something else entirely next year). Nothing about any
// specific kid's actual classes lives in this file — it's all data,
// entered and edited through the Manage UI below.
//
// Block/time structure (school_schedule_periods) is entered once per
// schedule and shared across every day-letter; the day-by-day content
// (school_schedule_assignments) is a grid of period × day-letter.
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
  const [expandedDates, setExpandedDates] = useState(() => new Set());

  const activeId = selectedId && schedules.some((s) => s.id === selectedId) ? selectedId : (schedules[0]?.id || null);
  const activeSchedule = schedules.find((s) => s.id === activeId) || null;
  const periods = useSchoolSchedulePeriods(activeId);
  const assignments = useSchoolScheduleAssignments(activeId);

  const exceptionsByDate = {};
  exceptions.forEach((e) => { exceptionsByDate[e.date] = e; });

  function dayKeyOptionsFor(schedule) {
    return schedule?.schedule_type === 'weekly' ? WEEKLY_DAY_KEYS : (schedule?.day_letters || []);
  }

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
    if (data) {
      await seedDefaultPeriods(data.id);
      setSelectedId(data.id);
      setManageTab('structure');
    }
  }

  async function handleDeleteSchedule(id) {
    await supabase.from('school_schedules').delete().eq('id', id);
    setDeleteConfirmId(null);
  }

  async function updatePeriodField(id, field, value) {
    await supabase.from('school_schedule_periods').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', id);
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

  function renderStructureTab() {
    if (schedules.length === 0) {
      return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>Add a schedule first in the Schedules tab.</p>;
    }

    const blocks = groupPeriodsByBlock(periods);

    async function handleSetPartCount(blockNumber, newCount) {
      const group = blocks.find((b) => b.blockNumber === blockNumber);
      const existing = group ? group.slots : [];
      const currentCount = existing.length;
      if (newCount > currentCount) {
        const rows = [];
        let prevEnd = existing[existing.length - 1]?.end_time;
        const defaultMinutes = existing.length ? minutesBetween(existing[0].start_time, existing[0].end_time) : 41;
        for (let i = currentCount; i < newCount; i++) {
          const start = prevEnd || '08:00';
          const end = addMinutesToTime(start, defaultMinutes);
          rows.push({ schedule_id: activeId, block_number: blockNumber, slot_index: i, start_time: start, end_time: end });
          prevEnd = end;
        }
        await supabase.from('school_schedule_periods').insert(rows);
      } else if (newCount < currentCount) {
        const toRemove = existing.slice(newCount).map((p) => p.id);
        await supabase.from('school_schedule_periods').delete().in('id', toRemove);
      }
    }

    async function handleAddBlock() {
      const nextNum = blocks.length ? Math.max(...blocks.map((b) => b.blockNumber)) + 1 : 1;
      const lastBlock = blocks[blocks.length - 1];
      const lastEnd = lastBlock ? lastBlock.slots[lastBlock.slots.length - 1].end_time : '08:00';
      await supabase.from('school_schedule_periods').insert({
        schedule_id: activeId, block_number: nextNum, slot_index: 0,
        start_time: lastEnd, end_time: addMinutesToTime(lastEnd, 82),
      });
    }

    async function handleDeleteBlock(blockNumber) {
      const group = blocks.find((b) => b.blockNumber === blockNumber);
      const ids = (group?.slots || []).map((p) => p.id);
      await supabase.from('school_schedule_periods').delete().in('id', ids);
    }

    function handleStartChange(period, newStart) {
      const duration = minutesBetween(period.start_time, period.end_time);
      updatePeriodField(period.id, 'start_time', newStart);
      updatePeriodField(period.id, 'end_time', addMinutesToTime(newStart, duration));
    }

    function handleDurationChange(period, minutes) {
      updatePeriodField(period.id, 'end_time', addMinutesToTime(period.start_time, minutes));
    }

    return (
      <div className="settings-section">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Block Structure</h3>
          <select value={activeId || ''} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.profile?.display_name || 'Unknown'}</option>)}
          </select>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
          These times are shared across every day-letter — set them once here, then fill in the
          actual classes per day in the Assignments tab. Split a block into parts for one with a
          lunch break in the middle.
        </p>

        {blocks.length === 0 && (
          <button className="btn btn-primary" style={{ fontSize: 'var(--s-sm)', marginBottom: 16 }}
            onClick={() => seedDefaultPeriods(activeId)}>
            🪄 Use default: 4 blocks (Block 3 split into 3 for lunch)
          </button>
        )}

        {blocks.map(({ blockNumber, slots }) => (
          <div key={blockNumber} className="school-block-group">
            <div className="school-block-group-header">
              <strong>Block {blockNumber}</strong>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--s-sm)' }}>
                Parts:
                <input type="number" min={1} max={6} value={slots.length} style={{ ...inputBoxStyle, width: 50 }}
                  onChange={(e) => handleSetPartCount(blockNumber, Math.max(1, parseInt(e.target.value, 10) || 1))} />
              </label>
              <button className="btn-icon" style={{ color: 'var(--danger)' }} title="Delete block"
                onClick={() => handleDeleteBlock(blockNumber)}>✕</button>
            </div>

            {slots.map((p) => (
              <div key={p.id} className="school-period-row">
                {slots.length > 1 && (
                  <input className="cal-name-input" style={{ ...inputBoxStyle, width: 90 }}
                    placeholder={`Part ${p.slot_index + 1}`}
                    defaultValue={p.label || ''}
                    onBlur={(e) => updatePeriodField(p.id, 'label', e.target.value || null)} />
                )}
                <input type="time" style={inputBoxStyle} value={(p.start_time || '').slice(0, 5)}
                  onChange={(e) => handleStartChange(p, e.target.value)} />
                <span style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)' }}>for</span>
                <input type="number" min={1} style={{ ...inputBoxStyle, width: 60 }}
                  value={minutesBetween(p.start_time, p.end_time)}
                  onChange={(e) => handleDurationChange(p, parseInt(e.target.value, 10) || 1)} />
                <span style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)' }}>
                  min &nbsp;(ends {formatTime(p.end_time)})
                </span>
              </div>
            ))}
          </div>
        ))}

        <button className="btn" style={{ fontSize: 'var(--s-sm)', marginTop: 10 }} onClick={handleAddBlock}>+ Add block</button>
      </div>
    );
  }

  function renderAssignmentsTab() {
    if (schedules.length === 0) {
      return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>Add a schedule first in the Schedules tab.</p>;
    }
    const blocks = groupPeriodsByBlock(periods);
    const dayKeys = dayKeyOptionsFor(activeSchedule);

    if (blocks.length === 0) {
      return (
        <div className="settings-section">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Assignments</h3>
            <select value={activeId || ''} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
              {schedules.map((s) => <option key={s.id} value={s.id}>{s.profile?.display_name || 'Unknown'}</option>)}
            </select>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>Set up the block structure in the Structure tab first.</p>
        </div>
      );
    }

    function cellAssignments(periodId, dayKey) {
      return assignments.filter((a) => a.period_id === periodId && a.day_key === dayKey);
    }

    async function updateAssignmentField(id, field, value) {
      await supabase.from('school_schedule_assignments').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', id);
    }

    async function handleCreateAssignment(periodId, dayKey, courseName) {
      if (!courseName.trim()) return;
      await supabase.from('school_schedule_assignments').insert({
        schedule_id: activeId, period_id: periodId, day_key: dayKey, course_name: courseName.trim(),
      });
    }

    async function handleAddAnother(periodId, dayKey) {
      await supabase.from('school_schedule_assignments').insert({
        schedule_id: activeId, period_id: periodId, day_key: dayKey, course_name: 'New class', valid_from: dateStr(new Date()),
      });
    }

    async function handleDeleteAssignment(id) {
      await supabase.from('school_schedule_assignments').delete().eq('id', id);
    }

    function toggleExpanded(id) {
      setExpandedDates((set) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }

    return (
      <div className="settings-section">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Assignments</h3>
          <select value={activeId || ''} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.profile?.display_name || 'Unknown'}</option>)}
          </select>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
          Type a course name to fill in a cell. Use 📅 on a filled-in cell if a class changes
          partway through the year (e.g. an elective that swaps at the semester).
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table className="school-assign-table">
            <thead>
              <tr>
                <th></th>
                {dayKeys.map((k) => <th key={k}>{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {blocks.map(({ blockNumber, slots }) => slots.map((p) => (
                <tr key={p.id}>
                  <td className="school-assign-periodcell">
                    <strong>Block {blockNumber}{slots.length > 1 ? ` · ${p.label || `Part ${p.slot_index + 1}`}` : ''}</strong>
                    <span>{formatTime(p.start_time)}–{formatTime(p.end_time)}</span>
                  </td>
                  {dayKeys.map((dayKey) => {
                    const cell = cellAssignments(p.id, dayKey);
                    return (
                      <td key={dayKey} className="school-assign-cell">
                        {cell.length === 0 && (
                          <input className="cal-name-input" style={{ ...inputBoxStyle, width: '100%' }} placeholder="+ Course"
                            onBlur={(e) => { handleCreateAssignment(p.id, dayKey, e.target.value); e.target.value = ''; }} />
                        )}
                        {cell.map((a) => (
                          <div key={a.id} className="school-assign-chip">
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input className="cal-name-input" style={{ ...inputBoxStyle, flex: 1 }} placeholder="Course"
                                defaultValue={a.course_name} onBlur={(e) => updateAssignmentField(a.id, 'course_name', e.target.value)} />
                              <button className="btn-icon" style={{ padding: '2px 4px', fontSize: 12 }} title="Only part of the year?"
                                onClick={() => toggleExpanded(a.id)}>📅</button>
                              <button className="btn-icon" style={{ padding: '2px 4px', fontSize: 12, color: 'var(--danger)' }} title="Delete"
                                onClick={() => handleDeleteAssignment(a.id)}>✕</button>
                            </div>
                            <input className="cal-name-input" style={{ ...inputBoxStyle, width: '100%' }} placeholder="Teacher"
                              defaultValue={a.teacher || ''} onBlur={(e) => updateAssignmentField(a.id, 'teacher', e.target.value)} />
                            <input className="cal-name-input" style={{ ...inputBoxStyle, width: '100%' }} placeholder="Room"
                              defaultValue={a.room || ''} onBlur={(e) => updateAssignmentField(a.id, 'room', e.target.value)} />
                            {expandedDates.has(a.id) && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <input type="date" style={{ ...inputBoxStyle, width: '100%' }} title="Valid from (blank = start of year)"
                                  value={a.valid_from || ''} onChange={(e) => updateAssignmentField(a.id, 'valid_from', e.target.value || null)} />
                                <input type="date" style={{ ...inputBoxStyle, width: '100%' }} title="Valid until (blank = end of year)"
                                  value={a.valid_until || ''} onChange={(e) => updateAssignmentField(a.id, 'valid_until', e.target.value || null)} />
                              </div>
                            )}
                          </div>
                        ))}
                        {cell.length > 0 && (
                          <button className="btn-icon" style={{ fontSize: 11, color: 'var(--text-muted)' }}
                            title="Add a version that starts later in the year" onClick={() => handleAddAnother(p.id, dayKey)}>
                            + later in the year
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
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
    const dayEntries = getDayEntries(periods, assignments, dayKey, viewDate);
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

        {dayKey && dayEntries.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginTop: 10 }}>
            No classes set up for {isWeekly ? WEEKDAY_LABELS[viewDate.getDay()] : `Day ${dayKey}`} yet.
          </p>
        )}

        {dayEntries.length > 0 && (
          <table className="sports-leaderboard" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Time</th><th>Course</th><th>Teacher</th><th>Room</th></tr>
            </thead>
            <tbody>
              {dayEntries.map(({ period, assignment }) => (
                <tr key={assignment.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatTime(period.start_time)}–{formatTime(period.end_time)}</td>
                  <td>{assignment.course_name}</td>
                  <td>{assignment.teacher || '—'}</td>
                  <td>{assignment.room || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  const MANAGE_TABS = [
    { id: 'schedules',   label: 'Schedules' },
    { id: 'structure',   label: 'Structure' },
    { id: 'assignments', label: 'Assignments' },
    { id: 'snowdays',    label: 'Snow Days' },
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
          {manageTab === 'schedules'   && renderSchedulesTab()}
          {manageTab === 'structure'   && renderStructureTab()}
          {manageTab === 'assignments' && renderAssignmentsTab()}
          {manageTab === 'snowdays'    && renderSnowDaysTab()}

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
