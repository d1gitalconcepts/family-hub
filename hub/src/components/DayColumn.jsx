import EventCard from './EventCard';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DayColumn({ date, events, calendarConfig, isActive }) {
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  // Build lookup maps from config
  const colorMap = {};
  const nameMap = {};
  if (calendarConfig) {
    calendarConfig.forEach((c) => {
      colorMap[c.id] = c.color;
      nameMap[c.id] = c.name;
    });
  }

  // Ordered visible calendars (array order = display order)
  const orderedVisible = calendarConfig
    ? calendarConfig.filter((c) => c.visible !== false)
    : [];

  // Events that belong to no configured calendar (show at bottom, ungrouped)
  const configuredIds = new Set(orderedVisible.map((c) => c.id));

  const visibleEvents = calendarConfig
    ? events.filter((e) => configuredIds.has(e.calendar_id))
    : events;

  const ungrouped = events.filter((e) => !configuredIds.has(e.calendar_id));

  // Sort events within a group: all-day first, then timed by start time
  function sortGroup(evs) {
    const allDay = evs.filter((e) => e.is_all_day);
    const timed  = evs.filter((e) => !e.is_all_day).sort((a, b) =>
      new Date(a.start_at) - new Date(b.start_at)
    );
    return [...allDay, ...timed];
  }

  // Build ordered groups
  const groups = orderedVisible
    .map((cal) => ({
      cal,
      events: sortGroup(visibleEvents.filter((e) => e.calendar_id === cal.id)),
    }))
    .filter((g) => g.events.length > 0);

  const hasAny = groups.length > 0 || ungrouped.length > 0;

  return (
    <div className={`day-column${isActive ? ' active-day' : ''}`}>
      <div className={`day-header${isToday ? ' today' : ''}`}>
        {DAY_NAMES[date.getDay()]}
        <span className="day-date">{date.getDate()}</span>
      </div>
      <div className="day-events">
        {groups.map(({ cal, events: evs }) => (
          <div key={cal.id} className="cal-group">
            <div className="cal-group-label" style={{ '--cal-color': colorMap[cal.id] }}>
              <span className="cal-group-dot" />
              <span>{nameMap[cal.id] || cal.name}</span>
            </div>
            {evs.map((e) => (
              <EventCard key={e.google_id} event={e} calColor={colorMap[e.calendar_id]} />
            ))}
          </div>
        ))}

        {ungrouped.map((e) => (
          <EventCard key={e.google_id} event={e} calColor={colorMap[e.calendar_id]} />
        ))}

        {!hasAny && (
          <span style={{ color: 'var(--text-muted)', fontSize: 12, padding: 4 }}>—</span>
        )}
      </div>
    </div>
  );
}
