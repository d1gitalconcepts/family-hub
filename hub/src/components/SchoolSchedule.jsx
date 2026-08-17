import { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useProfiles } from '../hooks/useProfiles';
import { useSchoolSchedules } from '../hooks/useSchoolSchedules';
import { useSchoolSchedulePeriods } from '../hooks/useSchoolSchedulePeriods';
import { useSchoolClasses } from '../hooks/useSchoolClasses';
import { useSchoolScheduleAssignments } from '../hooks/useSchoolScheduleAssignments';
import { useSchoolCalendarExceptions } from '../hooks/useSchoolCalendarExceptions';
import {
  dateStr, parseDateStr, parsePastedDate, getDayKey, getDayEntries, formatTime,
  addMinutesToTime, minutesBetween, getWeekdayStrip, sameDay, WEEKDAY_LABELS,
} from '../utils/schoolSchedule';

const WEEKLY_DAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

// Block 1/2/4 as one 82-minute row, Block 3 split into three 41-minute
// rows around lunch — the shape this app is built around by default.
// Purely a starting point: every label/time here is editable afterward,
// and rows can be added/removed/reordered freely.
const DEFAULT_TEMPLATE = [
  { label: 'Block 1',  minutes: 82 },
  { label: 'Block 2',  minutes: 82 },
  { label: 'Block 3a', minutes: 41 },
  { label: 'Block 3b', minutes: 41 },
  { label: 'Block 3c', minutes: 41 },
  { label: 'Block 4',  minutes: 82 },
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

// Each row is its own top-level period — block_number is just a sequential
// row-order key here (slot_index is always 0), so "splitting a block" is
// nothing more than adding another ordinary row and naming it e.g. "3b".
async function seedDefaultPeriods(scheduleId) {
  let cursor = '08:00';
  const rows = DEFAULT_TEMPLATE.map((block, i) => {
    const start = cursor;
    const end = addMinutesToTime(start, block.minutes);
    cursor = end;
    return { schedule_id: scheduleId, block_number: i + 1, slot_index: 0, label: block.label, start_time: start, end_time: end };
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
// Three separate concerns, each its own tab:
//   Classes — the reusable catalog (course + teacher + room), defined once.
//   Blocks  — the time template (label + time), shared across every day-letter.
//   Days    — per day-letter, drag classes from the catalog onto blocks to
//             build that day's schedule (school_schedule_assignments).
export default function SchoolSchedule({ profile, onClose }) {
  const schedules   = useSchoolSchedules();
  const [allProfiles] = useProfiles();
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
  const [showExPaste, setShowExPaste] = useState(false);
  const [exPasteText, setExPasteText] = useState('');
  const [exPasteError, setExPasteError] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [swapEditingId, setSwapEditingId] = useState(null);
  const [swapDate, setSwapDate]         = useState(() => dateStr(new Date()));
  const [swapClassId, setSwapClassId]   = useState('');
  const [classDrafts, setClassDrafts]   = useState([]);
  const [newClassName, setNewClassName]   = useState('');
  const [newClassTeacher, setNewClassTeacher] = useState('');
  const [newClassRoom, setNewClassRoom]   = useState('');
  const [classError, setClassError]       = useState('');
  const [showClassPaste, setShowClassPaste] = useState(false);
  const [classPasteText, setClassPasteText] = useState('');
  const drag = useRef(null);
  const classesSyncedForRef = useRef(null);

  // Non-admin accounts (e.g. kids logging in on their own profile) are
  // scoped to whichever schedule links to their own profile_id — no
  // switcher, no seeing siblings' schedules. Admins keep the full
  // switcher below so a parent can check on every kid at a glance.
  const myScheduleId = schedules.find((s) => s.profile_id === profile?.id)?.id || null;
  const activeId = isAdmin
    ? (selectedId && schedules.some((s) => s.id === selectedId) ? selectedId : (schedules[0]?.id || null))
    : myScheduleId;
  const activeSchedule = schedules.find((s) => s.id === activeId) || null;
  const periods = useSchoolSchedulePeriods(activeId);
  const [rawClasses, classesFetchError] = useSchoolClasses(activeId); // rawClasses: undefined until first load for activeId, then always an array
  const assignments = useSchoolScheduleAssignments(activeId);

  // Local mirror of rawClasses, synced from the server exactly once per
  // schedule (its first load) — every add/edit/delete after that updates
  // classDrafts directly and persists in the background. Re-syncing on
  // every later fetch (e.g. the realtime event caused by our own delete)
  // would risk a stale/racing fetch pasting a just-deleted row back in
  // when several edits happen in quick succession.
  useEffect(() => {
    if (rawClasses !== undefined && classesSyncedForRef.current !== activeId) {
      setClassDrafts(rawClasses);
      classesSyncedForRef.current = activeId;
    }
  }, [rawClasses, activeId]);

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
      setManageTab('classes');
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

  async function updateExceptionField(date, field, value) {
    const { error } = await supabase.from('school_calendar_exceptions').update({ [field]: value }).eq('date', date);
    if (error) setExPasteError(error.message);
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

  function renderClassesTab() {
    if (schedules.length === 0) {
      return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>Add a schedule first in the Schedules tab.</p>;
    }

    // Edits apply to classDrafts immediately (instant feedback, no
    // dependency on a realtime round-trip) and persist in the background.
    function updateClassLocal(id, field, value) {
      setClassDrafts((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    }

    async function saveClassField(id, field, value) {
      const { error } = await supabase.from('school_classes').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) setClassError(error.message);
    }

    async function handleAddClass() {
      const name = newClassName.trim();
      if (!name) { setClassError('Class name is required.'); return; }
      setClassError('');
      const { data, error } = await supabase.from('school_classes').insert({
        schedule_id: activeId, name, teacher: newClassTeacher.trim() || null, room: newClassRoom.trim() || null,
      }).select().maybeSingle();
      if (error) { setClassError(error.message); return; }
      if (data) setClassDrafts((rows) => [...rows, data]);
      setNewClassName(''); setNewClassTeacher(''); setNewClassRoom('');
    }

    function onNewClassKeyDown(e) {
      if (e.key === 'Enter') handleAddClass();
    }

    async function handleDeleteClass(id) {
      setClassDrafts((rows) => rows.filter((r) => r.id !== id));
      const { error } = await supabase.from('school_classes').delete().eq('id', id);
      if (error) setClassError(error.message);
    }

    async function handleClassPasteImport() {
      const lines = classPasteText.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length === 0) return;

      const rows = lines
        .map((line) => line.split('\t').map((cell) => cell.trim()))
        // Drop an obvious header row (e.g. pasted "Class / Teacher / Room" too)
        .filter((cols, i) => !(i === 0 && /^(class|course|name)$/i.test(cols[0] || '')))
        .map(([name, teacher, room]) => ({
          schedule_id: activeId,
          name: name || '',
          teacher: teacher || null,
          room: room || null,
        }))
        .filter((r) => r.name);

      if (rows.length === 0) { setClassError('Nothing to add — check the pasted rows have a class name in the first column.'); return; }
      setClassError('');
      const { data, error } = await supabase.from('school_classes').insert(rows).select();
      if (error) { setClassError(error.message); return; }
      if (data) setClassDrafts((prev) => [...prev, ...data]);
      setClassPasteText('');
      setShowClassPaste(false);
    }

    return (
      <div className="settings-section">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Classes</h3>
          <select value={activeId || ''} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.profile?.display_name || 'Unknown'}</option>)}
          </select>
          <button className="btn" style={{ fontSize: 'var(--s-sm)', marginLeft: 'auto' }}
            onClick={() => setShowClassPaste((v) => !v)}>
            {showClassPaste ? 'Cancel paste' : '📋 Paste from Excel'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
          The classes this person takes — teacher and room included. Drag these onto blocks per
          day in the Days tab; define each class once here and reuse it everywhere it repeats.
        </p>

        {showClassPaste && (
          <div className="school-paste-box">
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-xs)', margin: '0 0 6px' }}>
              In Excel, select the Class/Course, Teacher, and Room columns (in that order) and copy
              (Ctrl+C) — then paste below. One class per row; teacher/room are optional.
            </p>
            <textarea className="school-paste-textarea" rows={6} value={classPasteText}
              onChange={(e) => setClassPasteText(e.target.value)}
              placeholder={'English 7\tMrs. Snyder\t170\nMath 7\tMr. Jackson\t171'} />
            <button className="btn btn-primary" style={{ fontSize: 'var(--s-sm)', marginTop: 8 }}
              disabled={!classPasteText.trim()} onClick={handleClassPasteImport}>
              Add these classes
            </button>
          </div>
        )}

        {classesFetchError && (
          <p style={{ color: 'var(--danger)', fontSize: 'var(--s-sm)', marginBottom: 10 }}>
            ⚠ Couldn't load classes: {classesFetchError}
          </p>
        )}

        {classError && (
          <p style={{ color: 'var(--danger)', fontSize: 'var(--s-sm)', marginBottom: 10 }}>⚠ {classError}</p>
        )}

        {classDrafts.length === 0 && !classesFetchError && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 12 }}>
            No classes yet — add the first one below.
          </p>
        )}

        {classDrafts.map((c) => (
          <div key={c.id} className="school-class-row">
            <input className="cal-name-input" style={{ ...inputBoxStyle, flex: '1 1 160px' }} placeholder="Class name"
              value={c.name} onChange={(e) => updateClassLocal(c.id, 'name', e.target.value)}
              onBlur={(e) => saveClassField(c.id, 'name', e.target.value.trim() || 'New class')} />
            <input className="cal-name-input" style={{ ...inputBoxStyle, flex: '1 1 130px' }} placeholder="Teacher"
              value={c.teacher || ''} onChange={(e) => updateClassLocal(c.id, 'teacher', e.target.value)}
              onBlur={(e) => saveClassField(c.id, 'teacher', e.target.value)} />
            <input className="cal-name-input" style={{ ...inputBoxStyle, width: 80 }} placeholder="Room"
              value={c.room || ''} onChange={(e) => updateClassLocal(c.id, 'room', e.target.value)}
              onBlur={(e) => saveClassField(c.id, 'room', e.target.value)} />
            <button className="btn-icon" style={{ color: 'var(--danger)' }} title="Delete class"
              onClick={() => handleDeleteClass(c.id)}>✕</button>
          </div>
        ))}

        <div className="school-class-add-form">
          <input className="cal-name-input" style={{ ...inputBoxStyle, flex: '1 1 160px' }} placeholder="Class name"
            value={newClassName} onChange={(e) => setNewClassName(e.target.value)} onKeyDown={onNewClassKeyDown} />
          <input className="cal-name-input" style={{ ...inputBoxStyle, flex: '1 1 130px' }} placeholder="Teacher (optional)"
            value={newClassTeacher} onChange={(e) => setNewClassTeacher(e.target.value)} onKeyDown={onNewClassKeyDown} />
          <input className="cal-name-input" style={{ ...inputBoxStyle, width: 80 }} placeholder="Room"
            value={newClassRoom} onChange={(e) => setNewClassRoom(e.target.value)} onKeyDown={onNewClassKeyDown} />
          <button className="btn btn-primary" style={{ fontSize: 'var(--s-sm)' }} disabled={!newClassName.trim()} onClick={handleAddClass}>
            + Add class
          </button>
        </div>
      </div>
    );
  }

  function renderBlocksTab() {
    if (schedules.length === 0) {
      return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>Add a schedule first in the Schedules tab.</p>;
    }

    const sortedPeriods = [...periods].sort((a, b) => a.block_number - b.block_number);

    async function handleAddRow() {
      const nextNum = sortedPeriods.length ? Math.max(...sortedPeriods.map((p) => p.block_number)) + 1 : 1;
      const lastEnd = sortedPeriods[sortedPeriods.length - 1]?.end_time || '08:00';
      await supabase.from('school_schedule_periods').insert({
        schedule_id: activeId, block_number: nextNum, slot_index: 0,
        label: `Block ${nextNum}`, start_time: lastEnd, end_time: addMinutesToTime(lastEnd, 41),
      });
    }

    async function handleDeleteRow(id) {
      await supabase.from('school_schedule_periods').delete().eq('id', id);
    }

    function moveRow(period, direction) {
      const idx = sortedPeriods.findIndex((p) => p.id === period.id);
      const otherIdx = idx + direction;
      if (otherIdx < 0 || otherIdx >= sortedPeriods.length) return;
      const other = sortedPeriods[otherIdx];
      updatePeriodField(period.id, 'block_number', other.block_number);
      updatePeriodField(other.id, 'block_number', period.block_number);
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
          <h3 style={{ margin: 0 }}>Blocks</h3>
          <select value={activeId || ''} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.profile?.display_name || 'Unknown'}</option>)}
          </select>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
          The time slots, shared across every day-letter. A block with a lunch break in the middle
          is just three ordinary rows (e.g. "Block 3a/3b/3c") rather than one split into parts.
          Assign classes to these in the Days tab.
        </p>

        {sortedPeriods.length === 0 && (
          <button className="btn btn-primary" style={{ fontSize: 'var(--s-sm)', marginBottom: 16 }}
            onClick={() => seedDefaultPeriods(activeId)}>
            🪄 Use default: Block 1, 2, 3a/3b/3c (lunch), 4
          </button>
        )}

        {sortedPeriods.map((p, i) => (
          <div key={p.id} className="school-block-row">
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <button className="btn-icon" style={{ padding: '0 3px', fontSize: 9, lineHeight: 1 }} disabled={i === 0}
                title="Move up" onClick={() => moveRow(p, -1)}>▲</button>
              <button className="btn-icon" style={{ padding: '0 3px', fontSize: 9, lineHeight: 1 }} disabled={i === sortedPeriods.length - 1}
                title="Move down" onClick={() => moveRow(p, 1)}>▼</button>
            </div>
            <input className="cal-name-input" style={{ ...inputBoxStyle, width: 90 }}
              defaultValue={p.label || `Block ${i + 1}`}
              onBlur={(e) => updatePeriodField(p.id, 'label', e.target.value || `Block ${i + 1}`)} />
            <input type="time" style={{ ...inputBoxStyle, width: 92 }} value={(p.start_time || '').slice(0, 5)}
              onChange={(e) => handleStartChange(p, e.target.value)} />
            <span style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)' }}>for</span>
            <input type="number" min={1} className="school-duration-input" style={{ ...inputBoxStyle, width: 62 }}
              value={minutesBetween(p.start_time, p.end_time)}
              onChange={(e) => handleDurationChange(p, parseInt(e.target.value, 10) || 1)} />
            <span style={{ fontSize: 'var(--s-sm)', color: 'var(--text-muted)' }}>min (ends {formatTime(p.end_time)})</span>
            <button className="btn-icon" style={{ color: 'var(--danger)', marginLeft: 'auto' }} title="Delete row"
              onClick={() => handleDeleteRow(p.id)}>✕</button>
          </div>
        ))}

        <button className="btn" style={{ fontSize: 'var(--s-sm)', marginTop: 10 }} onClick={handleAddRow}>+ Add block</button>
      </div>
    );
  }

  function renderDaysTab() {
    if (schedules.length === 0) {
      return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>Add a schedule first in the Schedules tab.</p>;
    }

    const sortedPeriods = [...periods].sort((a, b) => a.block_number - b.block_number);
    const dayKeys = dayKeyOptionsFor(activeSchedule);
    const currentDayKey = selectedDayKey && dayKeys.includes(selectedDayKey) ? selectedDayKey : dayKeys[0];

    function slotAssignments(periodId) {
      return assignments.filter((a) => a.period_id === periodId && a.day_key === currentDayKey);
    }

    async function assignClassToPeriod(periodId, classId) {
      const existing = assignments.filter((a) => a.period_id === periodId && a.day_key === currentDayKey);
      for (const e of existing) await supabase.from('school_schedule_assignments').delete().eq('id', e.id);
      await supabase.from('school_schedule_assignments').insert({
        schedule_id: activeId, period_id: periodId, day_key: currentDayKey, class_id: classId,
      });
    }

    async function moveAssignment(assignment, toPeriodId) {
      if (toPeriodId === assignment.period_id) return;
      const existing = assignments.filter((a) => a.period_id === toPeriodId && a.day_key === currentDayKey);
      for (const e of existing) await supabase.from('school_schedule_assignments').delete().eq('id', e.id);
      await supabase.from('school_schedule_assignments').update({ period_id: toPeriodId, updated_at: new Date().toISOString() }).eq('id', assignment.id);
    }

    async function handleRemoveAssignment(id) {
      await supabase.from('school_schedule_assignments').delete().eq('id', id);
    }

    async function handleSplitAssignment(assignment) {
      if (!swapClassId || !swapDate) return;
      const cutover = parseDateStr(swapDate);
      const before = new Date(cutover);
      before.setDate(before.getDate() - 1);
      await supabase.from('school_schedule_assignments').update({ valid_until: dateStr(before) }).eq('id', assignment.id);
      await supabase.from('school_schedule_assignments').insert({
        schedule_id: activeId, period_id: assignment.period_id, day_key: assignment.day_key, class_id: swapClassId, valid_from: swapDate,
      });
      setSwapEditingId(null);
      setSwapClassId('');
    }

    function onClassDragStart(e, classId) {
      drag.current = { type: 'class', classId };
      e.dataTransfer.effectAllowed = 'copy';
    }

    function onAssignmentDragStart(e, assignment) {
      drag.current = { type: 'assignment', assignment };
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    }

    function onSlotDrop(e, periodId) {
      e.preventDefault();
      if (drag.current?.type === 'class') assignClassToPeriod(periodId, drag.current.classId);
      else if (drag.current?.type === 'assignment') moveAssignment(drag.current.assignment, periodId);
      drag.current = null;
      setDropTarget(null);
    }

    function onDragEnd() { drag.current = null; setDropTarget(null); }

    if (sortedPeriods.length === 0) {
      return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>Set up your blocks in the Blocks tab first.</p>;
    }
    if (classDrafts.length === 0) {
      return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)' }}>Add some classes in the Classes tab first.</p>;
    }

    return (
      <div className="settings-section">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Days</h3>
          <select value={activeId || ''} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.profile?.display_name || 'Unknown'}</option>)}
          </select>
        </div>

        <div className="school-rotation-setup">
          <label className="school-rotation-field">
            <span>Schedule type</span>
            <select value={activeSchedule.schedule_type} style={selectStyle}
              onChange={(e) => updateScheduleField(activeId, 'schedule_type', e.target.value)}>
              <option value="rotation">Rotation (day-letters)</option>
              <option value="weekly">Weekly (fixed Mon–Fri)</option>
            </select>
          </label>
          {activeSchedule.schedule_type === 'rotation' && (
            <>
              <label className="school-rotation-field">
                <span>First day of school</span>
                <input type="date" style={inputBoxStyle}
                  value={activeSchedule.rotation_anchor_date || ''}
                  onChange={(e) => updateScheduleField(activeId, 'rotation_anchor_date', e.target.value || null)} />
              </label>
              <label className="school-rotation-field">
                <span>...is Day</span>
                <select value={activeSchedule.rotation_anchor_letter || dayKeys[0] || ''} style={selectStyle}
                  onChange={(e) => updateScheduleField(activeId, 'rotation_anchor_letter', e.target.value)}>
                  {dayKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {dayKeys.map((k) => (
            <button key={k} className={`btn${currentDayKey === k ? ' btn-primary' : ''}`} style={{ fontSize: 'var(--s-sm)' }}
              onClick={() => setSelectedDayKey(k)}>{k}</button>
          ))}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
          Drag a class onto a block to assign it to Day {currentDayKey}. Drag an assigned class to
          a different block to move it there instead.
        </p>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div className="school-classes-palette">
            {classDrafts.map((c) => (
              <div key={c.id} className="school-class-chip" draggable
                onDragStart={(e) => onClassDragStart(e, c.id)} onDragEnd={onDragEnd}>
                <strong>{c.name}</strong>
                {c.teacher && <span>{c.teacher}</span>}
              </div>
            ))}
          </div>

          <div style={{ flex: '1 1 280px', minWidth: 260 }}>
            {sortedPeriods.map((p) => {
              const cell = slotAssignments(p.id);
              const isDropTarget = dropTarget === p.id;
              return (
                <div key={p.id} className={`school-slot-row${isDropTarget ? ' school-slot-row--drop-target' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDropTarget(p.id); }}
                  onDragLeave={() => setDropTarget((dt) => (dt === p.id ? null : dt))}
                  onDrop={(e) => onSlotDrop(e, p.id)}>
                  <div className="school-slot-label">
                    <strong>{p.label}</strong>
                    <span>{formatTime(p.start_time)}–{formatTime(p.end_time)}</span>
                  </div>
                  <div className="school-slot-content">
                    {cell.length === 0 && <span className="school-slot-empty">Drop a class here</span>}
                    {cell.map((a) => {
                      const cls = classDrafts.find((c) => c.id === a.class_id);
                      if (!cls) return null;
                      return (
                        <div key={a.id} className="school-class-chip school-class-chip--assigned" draggable
                          onDragStart={(e) => onAssignmentDragStart(e, a)} onDragEnd={onDragEnd}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <strong style={{ flex: 1 }}>{cls.name}</strong>
                            <button className="btn-icon" style={{ padding: '1px 3px', fontSize: 11 }} title="Changes later in the year?"
                              onClick={() => setSwapEditingId(swapEditingId === a.id ? null : a.id)}>📅</button>
                            <button className="btn-icon" style={{ padding: '1px 3px', fontSize: 11, color: 'var(--danger)' }} title="Remove"
                              onClick={() => handleRemoveAssignment(a.id)}>✕</button>
                          </div>
                          {(cls.teacher || cls.room) && <span>{[cls.teacher, cls.room].filter(Boolean).join(' · ')}</span>}
                          {(a.valid_from || a.valid_until) && (
                            <span className="school-chip-dates">
                              {a.valid_from ? parseDateStr(a.valid_from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'start'}
                              {' – '}
                              {a.valid_until ? parseDateStr(a.valid_until).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'end'}
                            </span>
                          )}
                          {swapEditingId === a.id && (
                            <div className="school-swap-form" onClick={(e) => e.stopPropagation()}>
                              <span>Changes to</span>
                              <select value={swapClassId} onChange={(e) => setSwapClassId(e.target.value)} style={selectStyle}>
                                <option value="">Pick a class…</option>
                                {classDrafts.filter((c) => c.id !== a.class_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              <span>starting</span>
                              <input type="date" style={inputBoxStyle} value={swapDate} onChange={(e) => setSwapDate(e.target.value)} />
                              <button className="btn btn-primary" style={{ fontSize: 'var(--s-xs)', padding: '3px 8px' }}
                                disabled={!swapClassId} onClick={() => handleSplitAssignment(a)}>Split</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderSnowDaysTab() {
    const todayStr = dateStr(new Date());
    const hasToday = !!exceptionsByDate[todayStr];

    async function handleExceptionPasteImport() {
      const lines = exPasteText.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length === 0) return;

      // Fixed columns: Start Date | End Date | Label. End Date blank = single day.
      const rows = [];
      lines.forEach((line, i) => {
        const [startRaw, endRaw, labelRaw] = line.split('\t').map((c) => (c || '').trim());
        if (i === 0 && /^(date|start|start date)$/i.test(startRaw || '')) return; // skip a pasted header row

        const startDate = parsePastedDate(startRaw);
        if (!startDate) return;
        const endDate = parsePastedDate(endRaw); // null if blank/unparseable = single day
        const label = labelRaw || '';

        let cursor = parseDateStr(startDate);
        const endObj = parseDateStr(endDate || startDate);
        let guard = 0;
        while (cursor <= endObj && guard < 60) { // safety cap — no real school break spans 60+ days
          rows.push({ date: dateStr(cursor), type: endDate ? 'break' : 'holiday', note: label || null, school_closed: true });
          cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
          guard++;
        }
      });

      if (rows.length === 0) {
        setExPasteError('Nothing to add — check the first column has a date like 9/7/2026.');
        return;
      }
      setExPasteError('');
      const { error } = await supabase.from('school_calendar_exceptions').upsert(rows, { onConflict: 'date' });
      if (error) { setExPasteError(error.message); return; }
      setExPasteText('');
      setShowExPaste(false);
    }

    return (
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Snow Days & Calendar Exceptions</h3>
          <button className="btn" style={{ fontSize: 'var(--s-sm)', marginLeft: 'auto' }}
            onClick={() => setShowExPaste((v) => !v)}>
            {showExPaste ? 'Cancel paste' : '📋 Paste from Excel'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-sm)', marginBottom: 14 }}>
          Shared across every kid. Adding a day here removes it from every rotation schedule's
          day-letter count — everything after it pushes forward automatically.
        </p>

        {showExPaste && (
          <div className="school-paste-box">
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--s-xs)', margin: '0 0 6px' }}>
              Every row is Start Date [tab] End Date [tab] Label — leave End Date blank for a
              single day. A range expands into one entry per day. Dates like 9/7/2026 or
              2026-09-07.
            </p>
            <textarea className="school-paste-textarea" rows={6} value={exPasteText}
              onChange={(e) => setExPasteText(e.target.value)}
              placeholder={'9/7/2026\t\tLabor Day\n12/22/2026\t1/2/2027\tWinter Break'} />
            <button className="btn btn-primary" style={{ fontSize: 'var(--s-sm)', marginTop: 8 }}
              disabled={!exPasteText.trim()} onClick={handleExceptionPasteImport}>
              Add these dates
            </button>
          </div>
        )}

        {exPasteError && (
          <p style={{ color: 'var(--danger)', fontSize: 'var(--s-sm)', marginBottom: 10 }}>⚠ {exPasteError}</p>
        )}

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
            <div key={ex.date} className="cal-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 500, width: 100, flexShrink: 0 }}>
                {parseDateStr(ex.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <select value={ex.type} style={{ ...selectStyle, flex: '0 0 170px' }}
                onChange={(e) => updateExceptionField(ex.date, 'type', e.target.value)}>
                {EXCEPTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input className="cal-name-input" style={{ ...inputBoxStyle, flex: '1 1 140px' }} placeholder="Note"
                defaultValue={ex.note || ''} onBlur={(e) => updateExceptionField(ex.date, 'note', e.target.value || null)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--s-xs)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={ex.school_closed}
                  onChange={(e) => updateExceptionField(ex.date, 'school_closed', e.target.checked)} />
                Closed
              </label>
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
    const dayEntries = getDayEntries(periods, assignments, classDrafts, dayKey, viewDate);
    const ex = exceptionsByDate[dateStr(viewDate)];
    const noSchool = ex?.school_closed;
    const isWeekly = activeSchedule.schedule_type === 'weekly';
    const needsAnchor = !isWeekly && !activeSchedule.rotation_anchor_date;

    // ‹ › page by week (the day-strip below picks a specific day within
    // whichever week is showing) — paging by single day made the strip
    // feel like it was shifting by one day every click instead of moving
    // cleanly between weeks.
    function goWeek(delta) {
      const d = new Date(viewDate);
      d.setDate(d.getDate() + delta * 7);
      setViewDate(d);
    }

    return (
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button className="btn-icon" title="Previous week" onClick={() => goWeek(-1)}>‹</button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>
            {viewDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
          <button className="btn" onClick={() => setViewDate(new Date())}>Today</button>
          <button className="btn-icon" title="Next week" onClick={() => goWeek(1)}>›</button>
        </div>

        {needsAnchor && (
          <div className="school-exception-banner" style={{ display: 'block', marginBottom: 14 }}>
            ⚠ No rotation start date set yet for {activeSchedule.school_name || activeSchedule.profile?.display_name || 'this schedule'}
            — every day will show blank until you set one (e.g. "the first day of school is Day A").
            {isAdmin && (
              <button className="btn" style={{ fontSize: 'var(--s-xs)', marginLeft: 10, padding: '2px 8px' }}
                onClick={() => setManageTab('schedules')}>Set it now</button>
            )}
          </div>
        )}

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
              {dayEntries.map(({ period, assignment, class: cls }) => (
                <tr key={assignment.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatTime(period.start_time)}–{formatTime(period.end_time)}</td>
                  <td>{cls.name}</td>
                  <td>{cls.teacher || '—'}</td>
                  <td>{cls.room || '—'}</td>
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
    { id: 'classes',   label: 'Classes' },
    { id: 'blocks',    label: 'Blocks' },
    { id: 'days',      label: 'Days' },
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
          {manageTab === 'classes'   && renderClassesTab()}
          {manageTab === 'blocks'    && renderBlocksTab()}
          {manageTab === 'days'      && renderDaysTab()}
          {manageTab === 'snowdays'  && renderSnowDaysTab()}

          {!manageTab && schedules.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>
              No school schedules set up yet. {isAdmin ? 'Click "Manage" above to add one.' : 'Ask an admin to set one up.'}
            </p>
          )}

          {!manageTab && schedules.length > 0 && !isAdmin && !activeSchedule && (
            <p style={{ color: 'var(--text-muted)' }}>
              No school schedule has been linked to your account yet. Ask an admin to add one in
              Settings → School Schedule → Manage → Schedules.
            </p>
          )}

          {!manageTab && activeSchedule && (
            <>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  {schedules.map((s) => (
                    <button key={s.id} className={`btn${activeId === s.id ? ' btn-primary' : ''}`} style={{ fontSize: 'var(--s-sm)' }}
                      onClick={() => setSelectedId(s.id)}>
                      {s.profile?.display_name || 'Unknown'}
                    </button>
                  ))}
                </div>
              )}
              {renderDayView()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
