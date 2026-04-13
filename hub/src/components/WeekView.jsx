import { useState } from 'react';
import SectionRow from './SectionRow';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useConfig } from '../hooks/useConfig';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDays(anchor) {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatWeekLabel(days) {
  const opts = { month: 'short', day: 'numeric' };
  return `${days[0].toLocaleDateString(undefined, opts)} – ${days[7].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function WeekView() {
  const [anchor, setAnchor] = useState(new Date());
  const [calConfig] = useConfig('visible_calendars');
  const [sections] = useConfig('calendar_sections');

  const days = getWeekDays(anchor);
  const weekStart = days[0];
  const weekEnd = new Date(days[7]); weekEnd.setHours(23, 59, 59, 999);
  const events = useCalendarEvents(weekStart, weekEnd);

  const today = new Date();

  function prevWeek() { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }
  function nextWeek() { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }
  function goToday()  { setAnchor(new Date()); }

  const calendars  = calConfig  || [];
  const sectionList = sections  || [];

  const assignedIds = new Set(sectionList.flatMap((s) => s.calendarIds || []));
  const unassigned  = calendars.filter((c) => !assignedIds.has(c.id) && c.visible !== false);

  // Deduplicate: each calendar ID appears only in the first section that claims it
  const seen = new Set();
  const deduped = sectionList.map((s) => ({
    ...s,
    calendarIds: (s.calendarIds || []).filter((id) => !seen.has(id) && seen.add(id)),
  }));

  // If no sections yet, show everything in one unlabelled band
  const resolvedSections = deduped.length > 0
    ? [
        ...deduped,
        ...(unassigned.length > 0
          ? [{ id: '__other', name: 'Other', calendarIds: unassigned.map((c) => c.id) }]
          : []),
      ]
    : [{ id: '__all', name: '', calendarIds: calendars.map((c) => c.id) }];

  return (
    <div className="main-area">
      <div className="week-nav">
        <button className="btn-icon" onClick={prevWeek}>‹</button>
        <span>{formatWeekLabel(days)}</span>
        <button className="btn" onClick={goToday} style={{ fontSize: 12, padding: '4px 8px' }}>Today</button>
        <button className="btn-icon" onClick={nextWeek}>›</button>
      </div>

      <div className="week-container">
        {/* Shared sticky day headers */}
        <div className="day-headers">
          {days.map((day, i) => {
            const isToday =
              day.getDate()     === today.getDate()     &&
              day.getMonth()    === today.getMonth()    &&
              day.getFullYear() === today.getFullYear();
            return (
              <div key={i} className={`day-header${isToday ? ' today' : ''}`}>
                {DAY_NAMES[day.getDay()]}
                <span className="day-date">{day.getDate()}</span>
              </div>
            );
          })}
        </div>

        {/* Horizontal section bands */}
        <div className="sections-body">
          {resolvedSections.map((section) => (
            <SectionRow
              key={section.id}
              section={section}
              days={days}
              events={events}
              calendarConfig={calendars}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
