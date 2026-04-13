import { useState } from 'react';
import DayColumn from './DayColumn';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useConfig } from '../hooks/useConfig';

function getWeekDays(anchor) {
  // anchor to Sunday
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatWeekLabel(days) {
  const opts = { month: 'short', day: 'numeric' };
  return `${days[0].toLocaleDateString(undefined, opts)} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function WeekView() {
  const [anchor, setAnchor] = useState(new Date());
  const [activeDay, setActiveDay] = useState(new Date().getDay()); // for mobile
  const [calConfig] = useConfig('visible_calendars');

  const days = getWeekDays(anchor);
  const weekStart = days[0];
  const weekEnd = new Date(days[6]); weekEnd.setHours(23, 59, 59, 999);

  const events = useCalendarEvents(weekStart, weekEnd);

  function prevWeek() {
    const d = new Date(anchor);
    d.setDate(d.getDate() - 7);
    setAnchor(d);
  }

  function nextWeek() {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 7);
    setAnchor(d);
  }

  function goToday() { setAnchor(new Date()); }

  // Group events by day (using date string as key)
  function eventsForDay(day) {
    const dateStr = day.toISOString().split('T')[0];
    return events.filter((e) => {
      if (e.is_all_day) return e.start_date === dateStr;
      if (!e.start_at) return false;
      return new Date(e.start_at).toISOString().split('T')[0] === dateStr;
    });
  }

  return (
    <div className="main-area">
      <div className="week-nav">
        <button className="btn-icon" onClick={prevWeek}>‹</button>
        {/* Mobile day navigation */}
        <button className="btn-icon" style={{ display: 'none' }} onClick={() => setActiveDay((d) => (d + 6) % 7)}>‹</button>
        <span>{formatWeekLabel(days)}</span>
        <button className="btn" onClick={goToday} style={{ fontSize: 12, padding: '4px 8px' }}>Today</button>
        <button className="btn-icon" onClick={nextWeek}>›</button>
      </div>
      <div className="week-grid">
        {days.map((day, i) => (
          <DayColumn
            key={i}
            date={day}
            events={eventsForDay(day)}
            calendarConfig={calConfig}
            isActive={i === activeDay}
          />
        ))}
      </div>
    </div>
  );
}
