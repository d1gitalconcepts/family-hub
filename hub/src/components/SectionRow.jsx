import EventCard from './EventCard';
import ForecastCard from './ForecastCard';

const FORECAST_ID = '__weather_forecast';

export default function SectionRow({ section, days, events, calendarConfig, forecast, gridStyle, dayClasses, iconRules, cardStyle }) {
  const calIds = new Set(section.calendarIds || []);
  const showForecast = calIds.has(FORECAST_ID);

  const colorMap = {};
  const emojiMap = {};
  const visibleIds = new Set();
  (calendarConfig || []).forEach((c) => {
    colorMap[c.id] = c.color;
    emojiMap[c.id] = c.emoji || null;
    if (calIds.has(c.id) && c.visible !== false) visibleIds.add(c.id);
  });

  // Only show all events unfiltered for the explicit __all fallback section
  const unfiltered = section.id === '__all';

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

  function forecastForDay(day) {
    if (!showForecast || !forecast?.length) return null;
    const dateStr = day.toISOString().split('T')[0];
    return forecast.find((f) => f.date === dateStr) ?? null;
  }

  // Hide the entire section row if every visible day is empty
  const hasContent = days.some((day) => eventsForDay(day).length > 0 || forecastForDay(day) !== null);
  if (!hasContent) return null;

  return (
    <div className={`section-row${showForecast ? ' section-row--forecast' : ''}`}>
      <div className="section-row-label">
        {section.name && <span>{section.name}</span>}
      </div>
      <div className="section-cells" style={gridStyle}>
        {days.map((day, i) => {
          const dayEvents   = eventsForDay(day);
          const forecastDay = forecastForDay(day);
          const isEmpty     = dayEvents.length === 0 && !forecastDay;
          return (
            <div key={i} className={`day-cell${dayClasses?.[i] ? ' ' + dayClasses[i] : ''}`}>
              {forecastDay && <ForecastCard day={forecastDay} />}
              {dayEvents.map((e) => (
                <EventCard key={e.google_id} event={e} calColor={colorMap[e.calendar_id]} calEmoji={emojiMap[e.calendar_id]} iconRules={iconRules} cardStyle={cardStyle} />
              ))}
              {isEmpty && <span className="day-cell-empty">—</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
