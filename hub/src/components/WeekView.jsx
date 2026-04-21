import { useState, useEffect, useLayoutEffect } from 'react';
import SectionRow from './SectionRow';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useConfig } from '../hooks/useConfig';
import { useSportsEnrichment } from '../hooks/useSportsEnrichment';
import WeatherNavCanvas from './WeatherNavCanvas';
import TwilightNavCanvas from './TwilightNavCanvas';
import HolidayNavCanvas, { getActiveHoliday } from './HolidayNavCanvas';

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

function sunriseNavBg(sunriseIso, sunsetIso) {
  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  function isoToMin(iso) {
    if (!iso) return null;
    const t = (iso.includes('T') ? iso.split('T')[1] : iso).split(':');
    return parseInt(t[0], 10) * 60 + (parseInt(t[1], 10) || 0);
  }

  const rise = isoToMin(sunriseIso) ?? 360;
  const set  = isoToMin(sunsetIso)  ?? 1200;

  // [minutes-from-midnight, [r,g,b,a] left-stop, [r,g,b,a] right-stop]
  const pts = [
    [0,              [15,  20,  80,  0.42], [25,  15,  90,  0.42]],
    [rise - 90,      [30,  20,  90,  0.42], [70,  30, 130,  0.40]],
    [rise - 15,      [190, 65,  20,  0.42], [240, 130, 40,  0.40]],
    [rise,           [255, 100, 30,  0.40], [255, 185, 65,  0.38]],
    [rise + 60,      [255, 165, 50,  0.36], [255, 210, 90,  0.30]],
    [(rise+set)/2,   [255, 210, 80,  0.26], [255, 235, 115, 0.22]],
    [set - 60,       [255, 165, 50,  0.36], [255, 210, 90,  0.30]],
    [set - 15,       [255, 85,  20,  0.42], [230, 55,  85,  0.40]],
    [set,            [235, 60,  25,  0.44], [195, 40, 105,  0.42]],
    [set + 45,       [100, 25, 120,  0.44], [55,  15, 105,  0.44]],
    [set + 120,      [15,  20,  80,  0.42], [25,  15,  90,  0.42]],
    [1440,           [15,  20,  80,  0.42], [25,  15,  90,  0.42]],
  ];

  let lo = pts[0], hi = pts[pts.length - 1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (nowMin >= pts[i][0] && nowMin < pts[i + 1][0]) {
      lo = pts[i]; hi = pts[i + 1]; break;
    }
  }

  const t = hi[0] > lo[0] ? (nowMin - lo[0]) / (hi[0] - lo[0]) : 0;
  function lerp(a, b) { return a + (b - a) * t; }
  function rgba(ca, cb) {
    return `rgba(${Math.round(lerp(ca[0],cb[0]))},${Math.round(lerp(ca[1],cb[1]))},${Math.round(lerp(ca[2],cb[2]))},${lerp(ca[3],cb[3]).toFixed(2)})`;
  }

  return { background: `linear-gradient(90deg, ${rgba(lo[1], hi[1])}, ${rgba(lo[2], hi[2])})` };
}

const WEATHER_BG = {
  clear:        'linear-gradient(90deg, rgba(100,160,220,0.28), rgba(70,130,200,0.22))',
  partly:       'linear-gradient(90deg, rgba(120,150,195,0.30), rgba(95,130,180,0.25))',
  overcast:     'linear-gradient(90deg, rgba(110,115,135,0.36), rgba(90,95,118,0.34))',
  fog:          'linear-gradient(90deg, rgba(165,165,178,0.36), rgba(148,148,165,0.33))',
  drizzle:      'linear-gradient(90deg, rgba(65,90,130,0.38),   rgba(50,75,118,0.35))',
  rain:         'linear-gradient(90deg, rgba(48,68,110,0.44),   rgba(32,52,95,0.42))',
  'heavy-rain': 'linear-gradient(90deg, rgba(32,48,90,0.50),    rgba(18,36,75,0.48))',
  snow:         'linear-gradient(90deg, rgba(185,205,225,0.32), rgba(200,218,235,0.27))',
  storm:        'linear-gradient(90deg, rgba(20,24,48,0.56),    rgba(12,15,38,0.54))',
};

function weatherKind(code) {
  if (code == null || code <= 1)                                                              return 'clear';
  if (code === 2)                                                                             return 'partly';
  if (code === 3)                                                                             return 'overcast';
  if (code === 45 || code === 48)                                                             return 'fog';
  if (code === 51 || code === 53 || code === 55)                                              return 'drizzle';
  if (code === 65 || code === 82)                                                             return 'heavy-rain';
  if (code === 61 || code === 63 || code === 80 || code === 81)                               return 'rain';
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return 'snow';
  if (code === 95 || code === 96 || code === 99)                                              return 'storm';
  return 'clear';
}

export default function WeekView() {
  const [anchor, setAnchor] = useState(new Date());
  const [calConfig]        = useConfig('visible_calendars');
  const [sections]         = useConfig('calendar_sections');
  const [forecast]         = useConfig('weather_forecast');
  const [weatherCurrent]   = useConfig('weather_current');
  const [eventIconsCfg]    = useConfig('event_icons');
  const [cardStyleCfg]     = useConfig('card_style');
  const [eventFiltersCfg]  = useConfig('event_filters');
  const [navStyleCfg]      = useConfig('nav_style');
  const [sportsDisplayCfg] = useConfig('sports_display');

  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    if (navStyleCfg?.preset !== 'sunrise') return;
    const id = setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [navStyleCfg?.preset]);

  // testCode overrides real conditions for preview; otherwise use weather_current code (Open-Meteo)
  // with hourly forecast fallback. Returns undefined while config hasn't loaded yet (suppresses flash).
  const currentWeatherCode = (() => {
    if (navStyleCfg?.testCode != null) return navStyleCfg.testCode;
    if (weatherCurrent === undefined) return undefined;
    if (weatherCurrent?.code  != null) return weatherCurrent.code;
    const hourStr = String(new Date().getHours()).padStart(2, '0') + ':00';
    return (forecast?.[0]?.hourly || []).find((h) => h.hour === hourStr)?.code ?? null;
  })();

  const navBg = (() => {
    const preset = navStyleCfg?.preset;
    if (!preset || preset === 'none') return {};
    if (preset === 'accent')  return { background: 'color-mix(in srgb, var(--accent) 18%, var(--bg-secondary))' };
    if (preset === 'sunrise') return sunriseNavBg(forecast?.[0]?.sunrise, forecast?.[0]?.sunset);
    if (preset === 'weather') return currentWeatherCode === undefined ? { position: 'relative', overflow: 'hidden' } : {
      background: WEATHER_BG[weatherKind(currentWeatherCode)] || WEATHER_BG.clear,
      position: 'relative',
      overflow: 'hidden',
    };
    if (preset === 'twilight') return {
      background: 'linear-gradient(90deg, rgba(148,60,215,0.32), rgba(228,75,165,0.32))',
      position: 'relative',
      overflow: 'hidden',
    };

    // Preset colors use rgba so they tint rather than override — works in both light and dark mode
    const PRESET_COLORS = {
      ocean:    ['rgba(30,130,255,0.32)',  'rgba(0,205,225,0.32)'],
      forest:   ['rgba(35,170,70,0.32)',   'rgba(120,205,55,0.32)'],
      twilight: null, // handled separately below with canvas overlay
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

  const activeHoliday = navStyleCfg?.easterEggs
    ? getActiveHoliday(navStyleCfg?.testHoliday ?? null)
    : null;

  const navDivStyle = activeHoliday
    ? { ...navBg, position: 'relative', overflow: 'hidden' }
    : navBg;

  const isMobile    = useIsMobile();
  const enrichments = useSportsEnrichment();

  const [isPrinting, setIsPrinting] = useState(false);
  useEffect(() => {
    const before = () => setIsPrinting(true);
    const after  = () => {
      setIsPrinting(false);
      const root = document.getElementById('root');
      if (root) root.style.zoom = '';
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint',  after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  // After the full-week re-render, zoom down only if content overflows the page
  useLayoutEffect(() => {
    if (!isPrinting) return;
    const root = document.getElementById('root');
    if (!root) return;
    const pageH    = root.clientHeight;
    const contentH = root.scrollHeight;
    if (pageH > 0 && contentH > pageH) {
      root.style.zoom = String(pageH / contentH);
    }
  }, [isPrinting]);

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

  const visibleDays  = (isMobile && !isPrinting) ? [days[mobileDayIdx]] : days;
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
        <div className="week-nav" style={navDivStyle}>
          {navStyleCfg?.preset === 'weather' && currentWeatherCode !== undefined && <WeatherNavCanvas code={currentWeatherCode} sunrise={forecast?.[0]?.sunrise} sunset={forecast?.[0]?.sunset} testNight={navStyleCfg?.testNight ?? null} />}
          {navStyleCfg?.preset === 'twilight' && <TwilightNavCanvas />}
          {activeHoliday && <HolidayNavCanvas holiday={activeHoliday} isTest={!!navStyleCfg?.testHoliday} />}
          {/* Wrapper ensures content stacks above the absolute-positioned canvas */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', flex: 1, gap: '6px' }}>
            <button className="btn-icon" onClick={prevWeek}>‹</button>
            <span>{formatWeekLabel(days)}</span>
            <button className="btn" onClick={goToday}>Today</button>
            <button className="btn-icon" onClick={nextWeek}>›</button>
          </div>
        </div>
      )}

      {/* Mobile nav — «» week-skip removed to reduce crowding; ‹/› already wrap weeks */}
      {isMobile && (
        <div className="week-nav" style={navDivStyle}>
          {navStyleCfg?.preset === 'weather' && currentWeatherCode !== undefined && <WeatherNavCanvas code={currentWeatherCode} sunrise={forecast?.[0]?.sunrise} sunset={forecast?.[0]?.sunset} testNight={navStyleCfg?.testNight ?? null} />}
          {navStyleCfg?.preset === 'twilight' && <TwilightNavCanvas />}
          {activeHoliday && <HolidayNavCanvas holiday={activeHoliday} isTest={!!navStyleCfg?.testHoliday} />}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', flex: 1, gap: '8px' }}>
            <button className="btn-icon" onClick={() => {
              if (mobileDayIdx <= 0) { prevWeek(); setMobileDayIdx(6); }
              else setMobileDayIdx((i) => i - 1);
            }}>‹</button>
            <span style={{ flex: 1, textAlign: 'center' }}>
              {DAY_NAMES[selectedDay.getDay()]} {selectedDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <button className="btn" onClick={goToday}>Today</button>
            <button className="btn-icon" onClick={() => {
              if (mobileDayIdx >= 6) { nextWeek(); setMobileDayIdx(0); }
              else setMobileDayIdx((i) => i + 1);
            }}>›</button>
          </div>
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
              enrichments={enrichments}
              sportsDisplay={sportsDisplayCfg}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
