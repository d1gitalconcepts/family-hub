import EventCard from './EventCard';

export default function SectionRow({ section, days, events, calendarConfig }) {
  const calIds = new Set(section.calendarIds || []);

  const colorMap = {};
  const visibleIds = new Set();
  (calendarConfig || []).forEach((c) => {
    colorMap[c.id] = c.color;
    if (calIds.has(c.id) && c.visible !== false) visibleIds.add(c.id);
  });

  // If no calIds configured (e.g. __all fallback), show every event unfiltered
  const unfiltered = calIds.size === 0;

  function eventsForDay(day) {
    const dateStr = day.toISOString().split('T')[0];
    return events
      .filter((e) => {
        if (!unfiltered && !visibleIds.has(e.calendar_id)) return false;
        if (e.is_all_day) return e.start_date === dateStr;
        if (!e.start_at) return false;
        return new Date(e.start_at).toISOString().split('T')[0] === dateStr;
      })
      .sort((a, b) => {
        if (a.is_all_day !== b.is_all_day) return a.is_all_day ? -1 : 1;
        if (a.start_at && b.start_at) return new Date(a.start_at) - new Date(b.start_at);
        return 0;
      });
  }

  return (
    <div className="section-row">
      <div className="section-row-label">
        {section.name && <span>{section.name}</span>}
      </div>
      <div className="section-cells">
        {days.map((day, i) => {
          const dayEvents = eventsForDay(day);
          return (
            <div key={i} className="day-cell">
              {dayEvents.map((e) => (
                <EventCard key={e.google_id} event={e} calColor={colorMap[e.calendar_id]} />
              ))}
              {dayEvents.length === 0 && <span className="day-cell-empty">—</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
