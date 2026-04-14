import { useState } from 'react';

const DEFAULT_CARD_STYLE = {
  layout:          'standard',
  showTime:        true,
  showCalName:     true,
  showDescSnippet: false,
  popout: {
    showDate:        true,
    showTime:        true,
    showLocation:    true,
    showDescription: true,
    showCalName:     true,
  },
};

export default function EventCard({ event, calColor, calEmoji, iconRules, cardStyle }) {
  const [open, setOpen] = useState(false);
  const color  = calColor || event.cal_color || '#4285f4';
  const style  = {
    ...DEFAULT_CARD_STYLE,
    ...cardStyle,
    popout: { ...DEFAULT_CARD_STYLE.popout, ...(cardStyle?.popout || {}) },
  };
  const layout = style.layout || 'standard';

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
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`;
  }

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

  const emoji   = calEmoji || getKeywordIcon(event.summary || '');
  const titleEl = (
    <span className="event-title">
      {emoji && <span className="event-emoji">{emoji}</span>}
      {event.summary}
    </span>
  );

  const descSnippet = style.showDescSnippet && event.description
    ? <span className="event-desc-snippet">{event.description.slice(0, 60)}{event.description.length > 60 ? '…' : ''}</span>
    : null;

  function renderCardContent() {
    if (layout === 'minimal') {
      return titleEl;
    }
    if (layout === 'inline') {
      return (
        <span className="event-title">
          {style.showTime && !event.is_all_day && event.start_at && (
            <span className="event-time-inline">{formatTime(event.start_at)} · </span>
          )}
          {emoji && <span className="event-emoji">{emoji}</span>}
          {event.summary}
        </span>
      );
    }
    if (layout === 'comfortable') {
      return (
        <>
          {titleEl}
          {style.showTime && !event.is_all_day && event.start_at && (
            <span className="event-time">{formatTime(event.start_at)}</span>
          )}
          {style.showCalName && <span className="event-cal">{event.cal_name}</span>}
          {descSnippet}
        </>
      );
    }
    // standard (default)
    return (
      <>
        {style.showTime && !event.is_all_day && event.start_at && (
          <span className="event-time">{formatTime(event.start_at)}</span>
        )}
        {titleEl}
        {style.showCalName && <span className="event-cal">{event.cal_name}</span>}
        {descSnippet}
      </>
    );
  }

  return (
    <>
      <div
        className={`event-card${event.is_all_day ? ' all-day' : ''} event-card--${layout}`}
        style={{ '--cal-color': color, cursor: 'pointer' }}
        onClick={() => setOpen(true)}
      >
        {renderCardContent()}
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

            {style.popout.showCalName && (
              <div className="event-popout-meta">
                <span className="event-popout-cal" style={{ color }}>● {event.cal_name}</span>
              </div>
            )}

            <div className="event-popout-body">
              {style.popout.showDate && (
                <div className="event-popout-row">
                  <span className="event-popout-label">Date</span>
                  <span>{formatDate(event.start_at, event.start_date)}</span>
                </div>
              )}

              {style.popout.showTime && !event.is_all_day && event.start_at && (
                <div className="event-popout-row">
                  <span className="event-popout-label">Time</span>
                  <span>
                    {formatTime(event.start_at)}
                    {event.end_at ? ` – ${formatTime(event.end_at)}` : ''}
                  </span>
                </div>
              )}

              {style.popout.showLocation && event.location && (
                <div className="event-popout-row">
                  <span className="event-popout-label">Where</span>
                  <a href={mapsUrl(event.location)} target="_blank" rel="noreferrer" className="event-popout-location-link">
                    {event.location}
                  </a>
                </div>
              )}

              {style.popout.showDescription && event.description && (
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
