import { useState, useEffect } from 'react';
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

export default function WeekView() {
  const [anchor, setAnchor] = useState(new Date());
  const [calConfig] = useConfig('visible_calendars');
  const [sections]  = useConfig('calendar_sections');
  const [forecast]  = useConfig('weather_forecast');
  const [eventIconsCfg]   = useConfig('event_icons');
  const [cardStyleCfg]    = useConfig('card_style');
  const [eventFiltersCfg] = useConfig('event_filters');
  const isMobile    = useIsMobile();

  // Mobile: default to today's index in the week (0=Sun … 6=Sat)
  const [mobileDayIdx, setMobileDayIdx] = useState(() => new Date().getDay());

  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const days      = getWeekDays(anchor);
  const weekStart = days[0];
  const weekEnd   = new Date(days[7]); weekEnd.setHours(23, 59, 59, 999);
  const events    = useCalendarEvents(weekStart, weekEnd);

  function sameDay(a, b) {
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  }

  // Build grid template: today's column is wider than the rest
  const todayIdx = days.findIndex((d) => sameDay(d, today));
  const colTemplate = days.map((_, i) =>
    i === todayIdx ? 'minmax(160px, 2fr)' : 'minmax(100px, 1fr)'
  ).join(' ');
  // day-headers includes the label spacer; section-cells does not (label is a separate flex element)
  const headerGridStyle = { gridTemplateColumns: `var(--label-w) ${colTemplate}` };
  const cellsGridStyle  = { gridTemplateColumns: colTemplate };

  function prevWeek() { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }
  function nextWeek() { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }
  function goToday()  { setAnchor(new Date()); setMobileDayIdx(new Date().getDay()); }

  const visibleDays  = isMobile ? [days[mobileDayIdx]] : days;
  const dayClasses   = days.map((d) =>
    sameDay(d, today) ? 'today' : sameDay(d, yesterday) ? 'yesterday' : ''
  );

  const calendars   = calConfig  || [];
  const sectionList = sections   || [];

  const assignedIds = new Set(sectionList.flatMap((s) => s.calendarIds || []));
  const unassigned  = calendars.filter((c) => !assignedIds.has(c.id) && c.visible !== false);

  const seen = new Set();

  const DEFAULT_ICON_RULES = [
    { keyword: 'birthday',  icon: '🎂' },
    { keyword: 'dinner',    icon: '🍽️' },
    { keyword: 'lunch',     icon: '🥗' },
    { keyword: 'breakfast', icon: '🍳' },
    { keyword: 'gym',       icon: '🏋️' },
    { keyword: 'workout',   icon: '💪' },
    { keyword: 'run',       icon: '🏃' },
    { keyword: 'flight',    icon: '✈️' },
    { keyword: 'travel',    icon: '🧳' },
    { keyword: 'school',    icon: '📚' },
    { keyword: 'doctor',    icon: '🩺' },
    { keyword: 'dentist',   icon: '🦷' },
    { keyword: 'meeting',   icon: '💼' },
    { keyword: 'party',     icon: '🎉' },
    { keyword: 'game',      icon: '⚽' },
    { keyword: 'practice',  icon: '🏃' },
    { keyword: 'movie',     icon: '🎬' },
    { keyword: 'date',      icon: '💕' },
    { keyword: 'hair',      icon: '✂️' },
    { keyword: 'holiday',   icon: '🏖️' },
  ];
  const iconRules = (eventIconsCfg?.enabled ?? true)
    ? (eventIconsCfg?.rules ?? DEFAULT_ICON_RULES)
    : [];

  const deduped = sectionList.map((s) => ({
    ...s,
    calendarIds: (s.calendarIds || []).filter((id) => !seen.has(id) && seen.add(id)),
  }));

  const resolvedSections = deduped.length > 0
    ? [
        ...deduped,
        ...(unassigned.length > 0
          ? [{ id: '__other', name: 'Other', calendarIds: unassigned.map((c) => c.id) }]
          : []),
      ]
    : [{ id: '__all', name: '', calendarIds: calendars.map((c) => c.id) }];

  const selectedDay = days[mobileDayIdx];
  const mobileIsToday =
    selectedDay.getDate()     === today.getDate()     &&
    selectedDay.getMonth()    === today.getMonth()    &&
    selectedDay.getFullYear() === today.getFullYear();

  return (
    <div className="main-area">
      {/* Desktop nav */}
      {!isMobile && (
        <div className="week-nav">
          <button className="btn-icon" onClick={prevWeek}>‹</button>
          <span>{formatWeekLabel(days)}</span>
          <button className="btn" onClick={goToday}>Today</button>
          <button className="btn-icon" onClick={nextWeek}>›</button>
        </div>
      )}

      {/* Mobile nav */}
      {isMobile && (
        <div className="week-nav">
          <button className="btn-icon" onClick={prevWeek} title="Prev week">«</button>
          <button className="btn-icon" onClick={() => setMobileDayIdx((i) => Math.max(0, i - 1))}>‹</button>
          <span style={{ flex: 1, textAlign: 'center' }}>
            {DAY_NAMES[selectedDay.getDay()]} {selectedDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <button className="btn" onClick={goToday}>Today</button>
          <button className="btn-icon" onClick={() => setMobileDayIdx((i) => Math.min(7, i + 1))}>›</button>
          <button className="btn-icon" onClick={nextWeek} title="Next week">»</button>
        </div>
      )}

      <div className="week-container">
        {/* Day headers */}
        {!isMobile && (
          <div className="day-headers" style={headerGridStyle}>
            <div className="day-header-spacer" />
            {days.map((day, i) => (
              <div key={i} className={`day-header${dayClasses[i] ? ' ' + dayClasses[i] : ''}`}>
                {DAY_NAMES[day.getDay()]}
                <span className="day-date">{day.getDate()}</span>
              </div>
            ))}
          </div>
        )}

        <div className="sections-body">
          {resolvedSections.map((section) => (
            <SectionRow
              key={section.id}
              section={section}
              days={visibleDays}
              events={events}
              calendarConfig={calendars}
              forecast={forecast}
              isMobile={isMobile}
              gridStyle={isMobile ? undefined : cellsGridStyle}
              dayClasses={isMobile ? undefined : dayClasses}
              iconRules={iconRules}
              cardStyle={cardStyleCfg}
              filterRules={eventFiltersCfg?.rules || []}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
