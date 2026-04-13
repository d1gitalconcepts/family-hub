import EventCard from './EventCard';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DayColumn({ date, events, calendarConfig, isActive }) {
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  // Build color lookup from config
  const colorMap = {};
  if (calendarConfig) {
    calendarConfig.forEach((c) => { colorMap[c.id] = c.color; });
  }

  // Visible calendars set
  const visibleIds = calendarConfig
    ? new Set(calendarConfig.filter((c) => c.visible !== false).map((c) => c.id))
    : null;

  const filtered = visibleIds
    ? events.filter((e) => visibleIds.has(e.calendar_id))
    : events;

  const allDay = filtered.filter((e) => e.is_all_day);
  const timed  = filtered.filter((e) => !e.is_all_day).sort((a, b) =>
    new Date(a.start_at) - new Date(b.start_at)
  );

  return (
    <div className={`day-column${isActive ? ' active-day' : ''}`}>
      <div className={`day-header${isToday ? ' today' : ''}`}>
        {DAY_NAMES[date.getDay()]}
        <span className="day-date">{date.getDate()}</span>
      </div>
      <div className="day-events">
        {allDay.map((e) => (
          <EventCard key={e.google_id} event={e} calColor={colorMap[e.calendar_id]} />
        ))}
        {timed.map((e) => (
          <EventCard key={e.google_id} event={e} calColor={colorMap[e.calendar_id]} />
        ))}
        {filtered.length === 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: 12, padding: 4 }}>—</span>
        )}
      </div>
    </div>
  );
}
