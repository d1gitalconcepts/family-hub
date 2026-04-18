export const APP_VERSION = '1.8.0';

export const CHANGELOG = [
  {
    version: '1.8.0',
    date: 'April 2026',
    notes: [
      'Icon settings: favicon and header icon are now independently configurable',
      'Monogram header icon renders as a native styled element (larger, crisp text) with support for up to 4 characters',
      'Custom icon upload: provide your own image for favicon and/or header icon',
      '"Apply to header" / "Apply to favicon" buttons to sync both in one click',
    ],
  },
  {
    version: '1.7.0',
    date: 'April 2026',
    notes: [
      'Golf leaderboard: correct Pos (T-prefix ties), Score, Today, Thru columns using actual ESPN API field paths',
      'Golf tee times: fetched from ESPN core API competitor status endpoint, converted from UTC using auto-detected tournament timezone',
      'Golf: "Full leaderboard ↗" link to ESPN tournament page',
      'Golf: even-par score normalised to "E", header columns right-aligned',
      'NBA enrichment added (quarter linescore, records)',
      'Multi-day calendar events now display across all days (SectionRow range check + useCalendarEvents cross-week fetch)',
      'Sports worker: subrequest limit fixes — 1-day lookback, skip future events, dedup same-game calendar entries',
    ],
  },
  {
    version: '1.6.1',
    date: 'April 2026',
    notes: [
      'Fixed duplicate Saturday meal events — all-day events now use the correct exclusive end date per Google Calendar API spec',
      'Worker now deduplicates "Meal Planning" calendars if multiple were accidentally created',
    ],
  },
  {
    version: '1.6.0',
    date: 'April 2026',
    notes: [
      'Keep scraper now reads full note content via focused-card URL navigation — Meal Planning no longer truncated at 10 lines',
      'Checklist notes (Shopping List etc.) now read the full item list from the focused card DOM, not just the card preview',
      'Checklist item cap: all unchecked items always included, up to 50 total items per note',
      'Scraper runs fully headless (no xvfb-run required) — faster and simpler cron setup',
      '14-day weather forecast (was 7 days)',
      'Keep note URLs configurable per-note in Hub Settings (Keep Notes tab)',
    ],
  },
  {
    version: '1.5.2',
    date: 'April 2026',
    notes: [
      'Recipe link previews: dish photo shown in event popout when description is a recipe URL',
    ],
  },
  {
    version: '1.5.1',
    date: 'April 2026',
    notes: [
      'NHL goal log restricted to Full Detail (was appearing at Box Score level)',
      'NHL PP/SH/EN strength badges now readable on light-colored calendars',
    ],
  },
  {
    version: '1.5.0',
    date: 'April 2026',
    notes: [
      'Sports enrichment — MLB box scores, standings, decisions, walk-off notes, series context',
      'NHL enrichment — goal log, period grid, goalie duel, Three Stars, PP/SOG stats',
      'NFL, Golf, F1, NASCAR enrichment via ESPN and OpenF1 APIs',
      'Per-sport detail level: Score only / Box Score / Full Detail',
      'Score chip on event cards (toggleable)',
      'Nav bar gradient theming with 3-color center stop and spread slider',
      'Font size scaling fixed across all settings UI elements',
      'Leading emoji stripped from calendar event titles for consistent icon rules',
    ],
  },
  {
    version: '1.4.0',
    date: 'April 2026',
    notes: [
      'New event card styles: Chip (solid colour) and Logo (emoji circle badge)',
      'Added Open-Meteo weather source — no personal weather station required',
      'Weather location options: device GPS or zip code lookup',
      'Reorganised weather settings into labelled sections',
      'Favicon picker with custom SVG icons (house, calendar, hub, mono)',
      'Selected favicon shown next to page title in header',
      'Hourly forecast popout with bar chart layout option',
      'Wider event popout on desktop',
      'Past days now correctly dimmed (not just yesterday)',
      'Event popout no longer inherits dimming from past-day columns',
    ],
  },
  {
    version: '1.3.0',
    date: 'April 2026',
    notes: [
      'Multi-note Keep sidebar — configure any number of checklist notes',
      'Keep Notes settings tab replaces hardcoded list',
      'Checkbox write-back from hub to Google Keep',
      'Scraper now searches for off-screen (unpinned) notes',
      'Google Translate overlay fix for headless scraper',
      'Configurable event card layout and elements',
      'Event icon rules — keyword-to-emoji mapping',
      'Event filter rules — hide events by keyword',
    ],
  },
  {
    version: '1.2.0',
    date: 'April 2026',
    notes: [
      'Weather widget with Ambient Weather station support',
      'Current conditions display: temp, humidity, wind, UV, pressure',
      'Seven-day forecast on calendar with clickable detail cards',
      'Weather widget position: in-header or below-header',
      'Label style toggle: text or icons',
    ],
  },
  {
    version: '1.1.0',
    date: 'April 2026',
    notes: [
      'Google Keep scraper with Playwright headless browser',
      'Shopping List and Meal Planning sync to Supabase',
      'Sidebar checklist with real-time updates',
      'Watcher process for instant write-back on checkbox toggle',
      'pm2 process management for Linux server',
    ],
  },
  {
    version: '1.0.0',
    date: 'April 2026',
    notes: [
      'Initial release',
      'Google Calendar sync via Cloudflare Worker',
      'Week view with all-day and timed events',
      'Google Tasks sidebar integration',
      'Admin settings panel',
      'Light / dark / auto theme',
      'Mobile-responsive layout',
    ],
  },
];
