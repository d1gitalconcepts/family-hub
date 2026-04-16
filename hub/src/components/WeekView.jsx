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
  const [navStyleCfg]     = useConfig('nav_style');

  const navBg = (() => {
    const preset = navStyleCfg?.preset;
    if (!preset || preset === 'none') return {};
    if (preset === 'accent') return { background: 'color-mix(in srgb, var(--accent) 18%, var(--bg-secondary))' };

    // Preset colors use rgba so they tint rather than override — works in both light and dark mode
    const PRESET_COLORS = {
      sunrise:  ['rgba(255,110,40,0.32)',  'rgba(255,195,80,0.32)'],
      ocean:    ['rgba(30,130,255,0.32)',  'rgba(0,205,225,0.32)'],
      forest:   ['rgba(35,170,70,0.32)',   'rgba(120,205,55,0.32)'],
      twilight: ['rgba(148,60,215,0.32)',  'rgba(228,75,165,0.32)'],
      slate:    ['rgba(85,125,168,0.28)',  'rgba(135,170,208,0.28)'],
    };

    const c3raw  = navStyleCfg?.color3 || null;
    const spread = navStyleCfg?.centerSpread ?? 30; // % of bar the center color occupies
    const cStart = Math.max(0,  (100 - spread) / 2);
    const cEnd   = Math.min(100, (100 + spread) / 2);

    if (preset === 'custom') {
      const c1 = navStyleCfg?.color1 || '#a1c4fd';
      const c2 = navStyleCfg?.color2 || '#c2e9fb';
      const stops = c3raw
        ? `${c1}, ${c3raw} ${cStart}%, ${c3raw} ${cEnd}%, ${c2}`
        : `${c1}, ${c2}`;
      return { background: `linear-gradient(90deg, ${stops})` };
    }

    const colors = PRESET_COLORS[preset];
    if (!colors) return {};
    const [c1, c2] = colors;
    // Center color: convert hex to rgba so it blends consistently with the preset's opacity
    const c3 = c3raw ? (() => {
      const r = parseInt(c3raw.slice(1,3),16), g = parseInt(c3raw.slice(3,5),16), b = parseInt(c3raw.slice(5,7),16);
      return `rgba(${r},${g},${b},0.32)`;
    })() : null;
    const stops = c3
      ? `${c1}, ${c3} ${cStart}%, ${c3} ${cEnd}%, ${c2}`
      : `${c1}, ${c2}`;
    return { background: `linear-gradient(90deg, ${stops})` };
  })();
  const isMobile    = useIsMobile();

  // Mobile: default to today's index in the week (0=Sun … 6=Sat)
  const [mobileDayIdx, setMobileDayIdx] = useState(() => new Date().getDay());

  const today     = new Date();
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
    sameDay(d, today) ? 'today' : d < today && !sameDay(d, today) ? 'past' : ''
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
        <div className="week-nav" style={navBg}>
          <button className="btn-icon" onClick={prevWeek}>‹</button>
          <span>{formatWeekLabel(days)}</span>
          <button className="btn" onClick={goToday}>Today</button>
          <button className="btn-icon" onClick={nextWeek}>›</button>
        </div>
      )}

      {/* Mobile nav */}
      {isMobile && (
        <div className="week-nav" style={navBg}>
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
