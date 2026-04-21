import { useRef, useLayoutEffect } from 'react';
import EventCard from './EventCard';
import ForecastCard from './ForecastCard';

const FORECAST_ID = '__weather_forecast';

function isEventHidden(event, filterRules) {
  if (!filterRules?.length) return false;
  const title = (event.summary || '').toLowerCase();
  return filterRules.some((rule) => {
    if (!rule.keyword || rule.enabled === false) return false;
    const keywords = rule.keyword.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    return keywords.some((k) => title.includes(k));
  });
}

export default function SectionRow({ section, days, events, calendarConfig, forecast, gridStyle, dayClasses, iconRules, iconRulesOverride, cardStyle, compact, filterRules, enrichments, sportsDisplay }) {
  const cellsRef = useRef(null);

  useLayoutEffect(() => {
    if (!cellsRef.current) return;
    cellsRef.current.querySelectorAll('.day-cell').forEach(cell => {
      const cards = cell.querySelectorAll('.event-card');
      if (cards.length <= 1) return;
      cards.forEach(c => (c.style.minHeight = ''));
      const maxH = Math.max(...Array.from(cards).map(c => c.getBoundingClientRect().height));
      cards.forEach(c => (c.style.minHeight = `${maxH}px`));
    });
  });

  const calIds = new Set(section.calendarIds || []);
  const showForecast = calIds.has(FORECAST_ID);

  const colorMap     = {};
  const emojiMap     = {};
  const abbrevMap    = {};
  const printWrapMap = {};
  const visibleIds = new Set();
  (calendarConfig || []).forEach((c) => {
    colorMap[c.id]     = c.color;
    emojiMap[c.id]     = c.emoji     || null;
    abbrevMap[c.id]    = c.abbrev    || null;
    printWrapMap[c.id] = c.printWrap || false;
    if (calIds.has(c.id) && c.visible !== false) visibleIds.add(c.id);
  });

  // Only show all events unfiltered for the explicit __all fallback section
  const unfiltered = section.id === '__all';

  function eventsForDay(day) {
    const y = day.getFullYear(), m = String(day.getMonth() + 1).padStart(2, '0'), d = String(day.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    return events
      .filter((e) => {
        if (!unfiltered && !visibleIds.has(e.calendar_id)) return false;
        if (isEventHidden(e, filterRules)) return false;
        if (e.is_all_day) {
          // Multi-day all-day events: end_date is exclusive (Google Calendar spec)
          // Show the event on every day in [start_date, end_date)
          if (e.end_date && e.end_date > e.start_date) {
            return dateStr >= e.start_date && dateStr < e.end_date;
          }
          return e.start_date === dateStr;
        }
        if (!e.start_at) return false;
        // Compare local dates: UTC timestamps for evening events can roll into the next UTC day
        const ed = new Date(e.start_at);
        const ey = ed.getFullYear(), em = String(ed.getMonth() + 1).padStart(2, '0'), eday = String(ed.getDate()).padStart(2, '0');
        return `${ey}-${em}-${eday}` === dateStr;
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
      <div className="section-cells" style={gridStyle} ref={cellsRef}>
        {days.map((day, i) => {
          const dayEvents   = eventsForDay(day);
          const forecastDay = forecastForDay(day);
          const isEmpty     = dayEvents.length === 0 && !forecastDay;
          return (
            <div key={i} className={`day-cell${dayClasses?.[i] ? ' ' + dayClasses[i] : ''}`}>
              {forecastDay && <ForecastCard day={forecastDay} cardStyle={cardStyle} />}
              {dayEvents.map((e) => (
                <EventCard key={e.google_id} event={e} calColor={colorMap[e.calendar_id]} calEmoji={emojiMap[e.calendar_id]} calAbbrev={abbrevMap[e.calendar_id]} iconRules={iconRules} iconRulesOverride={iconRulesOverride} cardStyle={cardStyle} compact={compact} enrichment={enrichments?.[e.google_id]} sportsDisplay={sportsDisplay} printWrap={printWrapMap[e.calendar_id]} />
              ))}
              {isEmpty && <span className="day-cell-empty">—</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
