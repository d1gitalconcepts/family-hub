import { useState } from 'react';
import { createPortal } from 'react-dom';

const DEFAULT_ELEMENTS = [
  { key: 'time',    visible: true  },
  { key: 'title',   visible: true  },
  { key: 'calName', visible: true  },
  { key: 'desc',    visible: false },
];

// Backward-compat: convert old layout-based config to element array
function resolveElements(style) {
  if (style.cardElements) return style.cardElements;
  // Legacy layout conversion
  const base = DEFAULT_ELEMENTS.map(e => ({ ...e }));
  if (style.layout === 'minimal') {
    return base.map(e => ({ ...e, visible: e.key === 'title' }));
  }
  if (style.layout === 'inline' || style.layout === 'chip') {
    // time inline before title, no calName
    return [
      { key: 'time',    visible: style.showTime ?? true },
      { key: 'title',   visible: true },
      { key: 'calName', visible: false },
      { key: 'desc',    visible: false },
    ];
  }
  // standard / logo / default
  return base.map(e => ({
    ...e,
    visible: e.key === 'time'    ? (style.showTime        ?? true)  :
             e.key === 'calName' ? (style.showCalName      ?? true)  :
             e.key === 'desc'    ? (style.showDescSnippet  ?? false) : true,
  }));
}

const DEFAULT_POPOUT = {
  showDate: true, showTime: true, showLocation: true, showDescription: true, showCalName: true,
};

export default function EventCard({ event, calColor, calEmoji, iconRules, cardStyle }) {
  const [open, setOpen] = useState(false);
  const color = calColor || event.cal_color || '#4285f4';

  const style = {
    popout: { ...DEFAULT_POPOUT },
    ...(cardStyle || {}),
    popout: { ...DEFAULT_POPOUT, ...(cardStyle?.popout || {}) },
  };

  const chipStyle    = style.chipStyle    || false;
  const emojiAsBadge = style.emojiAsBadge || false;
  const align        = style.align        || 'left';
  const elements     = resolveElements(style);
  const visible      = elements.filter(e => e.visible !== false);

  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const justifyContent = justifyMap[align] || 'flex-start';

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
      const keywords = rule.keyword.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      if (keywords.some(k => lower.includes(k))) return rule.icon;
    }
    return null;
  }

  const emoji = calEmoji || getKeywordIcon(event.summary || '');

  function renderCardContent() {
    return (
      <div className="event-card-body" style={{ textAlign: align }}>
        {visible.map((el) => {
          if (el.key === 'time') {
            if (event.is_all_day || !event.start_at) return null;
            return <span key="time" className="event-time">{formatTime(event.start_at)}</span>;
          }
          if (el.key === 'title') {
            if (emojiAsBadge && emoji) {
              return (
                <div key="title" className="event-badge-row" style={{ justifyContent }}>
                  <svg className="event-logo-circle" viewBox="0 0 32 32" width="28" height="28">
                    <circle cx="16" cy="16" r="15" fill="var(--cal-color, #4285f4)" opacity="0.2" />
                    <circle cx="16" cy="16" r="15" fill="none" stroke="var(--cal-color, #4285f4)" strokeWidth="1.5" opacity="0.5" />
                    <text x="16" y="22" textAnchor="middle" fontSize="18" fill="var(--cal-color, #4285f4)">{emoji}</text>
                  </svg>
                  <span className="event-title">{event.summary}</span>
                </div>
              );
            }
            return (
              <span key="title" className="event-title">
                {emoji && <span className="event-emoji">{emoji}</span>}
                {event.summary}
              </span>
            );
          }
          if (el.key === 'calName') {
            return <span key="calName" className="event-cal">{event.cal_name}</span>;
          }
          if (el.key === 'desc' && event.description) {
            return (
              <span key="desc" className="event-desc-snippet">
                {event.description.slice(0, 60)}{event.description.length > 60 ? '…' : ''}
              </span>
            );
          }
          return null;
        })}
      </div>
    );
  }

  // Card CSS class
  const cardClass = [
    'event-card',
    event.is_all_day ? 'all-day' : '',
    chipStyle ? 'event-card--chip' : 'event-card--border',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={cardClass}
        style={{ '--cal-color': color, cursor: 'pointer' }}
        onClick={() => setOpen(true)}
      >
        {renderCardContent()}
      </div>

      {open && createPortal(
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
      , document.body)}
    </>
  );
}
