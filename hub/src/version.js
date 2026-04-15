export const APP_VERSION = '1.4.0';

export const CHANGELOG = [
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
    date: 'March 2026',
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
    date: 'February 2026',
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
    date: 'January 2026',
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
    date: 'December 2025',
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
