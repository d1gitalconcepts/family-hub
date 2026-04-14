import { useState } from 'react';

export default function EventCard({ event, calColor, calEmoji, iconRules }) {
  const [open, setOpen] = useState(false);
  const color = calColor || event.cal_color || '#4285f4';

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatDate(iso, dateStr) {
    const d = iso ? new Date(iso) : dateStr ? new Date(dateStr + 'T12:00:00') : null;
    if (!d) return '';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function isUrl(str) {
    try { new URL(str); return true; } catch { return false; }
  }

  function mapsUrl(location) {
    const enc = encodeURIComponent(location);
    return `https://www.google.com/maps/dir/?api=1&destination=${enc}`;
  }

  // Calendar emoji takes priority; fall back to first matching keyword rule
  function getKeywordIcon(title) {
    if (!iconRules?.length) return null;
    const lower = title.toLowerCase();
    for (const rule of iconRules) {
      if (!rule.icon || !rule.keyword) continue;
      const keywords = rule.keyword.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      if (keywords.some((k) => lower.includes(k))) return rule.icon;
    }
    return null;
  }

  const emoji = calEmoji || getKeywordIcon(event.summary || '');

  return (
    <>
      <div
        className={`event-card${event.is_all_day ? ' all-day' : ''}`}
        style={{ '--cal-color': color, cursor: 'pointer' }}
        onClick={() => setOpen(true)}
      >
        {!event.is_all_day && (
          <span className="event-time">{formatTime(event.start_at)}</span>
        )}
        <span className="event-title">
          {emoji && <span className="event-emoji">{emoji}</span>}
          {event.summary}
        </span>
        <span className="event-cal">{event.cal_name}</span>
      </div>

      {open && (
        <div className="event-popout-overlay" onClick={() => setOpen(false)}>
          <div
            className="event-popout"
            style={{ '--cal-color': color }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="event-popout-bar" />

            <div className="event-popout-header">
              <div className="event-popout-title">
                {emoji && <span style={{ marginRight: 6 }}>{emoji}</span>}
                {event.summary}
              </div>
              <button className="btn-icon" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="event-popout-meta">
              <span className="event-popout-cal" style={{ color }}>● {event.cal_name}</span>
            </div>

            <div className="event-popout-body">
              <div className="event-popout-row">
                <span className="event-popout-label">Date</span>
                <span>{formatDate(event.start_at, event.start_date)}</span>
              </div>

              {!event.is_all_day && event.start_at && (
                <div className="event-popout-row">
                  <span className="event-popout-label">Time</span>
                  <span>
                    {formatTime(event.start_at)}
                    {event.end_at ? ` – ${formatTime(event.end_at)}` : ''}
                  </span>
                </div>
              )}

              {event.location && (
                <div className="event-popout-row">
                  <span className="event-popout-label">Where</span>
                  <a href={mapsUrl(event.location)} target="_blank" rel="noreferrer" className="event-popout-location-link">
                    {event.location}
                  </a>
                </div>
              )}

              {event.description && (
                <div className="event-popout-row event-popout-desc">
                  <span className="event-popout-label">Details</span>
                  <span>
                    {isUrl(event.description.trim())
                      ? <a href={event.description.trim()} target="_blank" rel="noreferrer">{event.description.trim()}</a>
                      : event.description}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
