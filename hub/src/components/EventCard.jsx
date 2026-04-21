import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SportsPanel from './SportsPanel';
import { useConfig } from '../hooks/useConfig';
import { getPlacePhoto, getSportVenueQuery } from '../utils/placePhoto';
import { getTitlePhoto } from '../utils/titlePhoto';

function usePlacePhoto(location, enabled, apiKey, isPast, refreshDays) {
  const [photoUrl, setPhotoUrl] = useState(null);
  useEffect(() => {
    if (!enabled || !location || !apiKey) { setPhotoUrl(null); return; }
    getPlacePhoto(location, apiKey, isPast, refreshDays).then(url => setPhotoUrl(url || null));
  }, [location, enabled, apiKey, isPast, refreshDays]);
  return photoUrl;
}

function useTitlePhoto(title, enabled, provider, apiKey, isPast, refreshDays) {
  const [photoUrl, setPhotoUrl] = useState(null);
  useEffect(() => {
    if (!enabled || !title || !provider || !apiKey) { setPhotoUrl(null); return; }
    getTitlePhoto(title, provider, apiKey, isPast, refreshDays).then(url => setPhotoUrl(url || null));
  }, [title, enabled, provider, apiKey, isPast, refreshDays]);
  return photoUrl;
}

function useLinkPreview(url) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!url) return;
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl || workerUrl.includes('YOUR_ACCOUNT')) return;
    fetch(`${workerUrl}/og?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(d => { if (d.image) setImage(d.image); })
      .catch(() => {});
  }, [url]);
  return image;
}

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

const DEFAULT_POPOUT_ELEMENTS = [
  { key: 'calName',     visible: true },
  { key: 'date',        visible: true },
  { key: 'time',        visible: true },
  { key: 'location',    visible: true },
  { key: 'description', visible: true },
];

function resolvePopoutElements(style) {
  if (style.popoutElements) return style.popoutElements;
  const p = { ...DEFAULT_POPOUT, ...(style.popout || {}) };
  return [
    { key: 'calName',     visible: p.showCalName     ?? true },
    { key: 'date',        visible: p.showDate         ?? true },
    { key: 'time',        visible: p.showTime         ?? true },
    { key: 'location',    visible: p.showLocation     ?? true },
    { key: 'description', visible: p.showDescription  ?? true },
  ];
}

export default function EventCard({ event, calColor, calEmoji, calAbbrev, iconRules, iconRulesOverride, cardStyle, compact, enrichment, sportsDisplay }) {
  const [open, setOpen] = useState(false);
  const color = calColor || event.cal_color || '#4285f4';

  const [placesPhotosCfg] = useConfig('places_photos');
  const refreshDays    = placesPhotosCfg?.refreshDays ?? 7;
  const today = new Date().toISOString().slice(0, 10);
  const isPast = event.end_at
    ? new Date(event.end_at) < new Date()
    : event.end_date
      ? event.end_date < today
      : event.start_at
        ? new Date(event.start_at) < new Date()
        : !!event.start_date && event.start_date < today;

  // Recipe image — OG image from description URL (free, already fetched for popout)
  const descUrl      = !enrichment && event.description?.trim() && (() => {
    try { new URL(event.description.trim()); return event.description.trim(); } catch { return null; }
  })();
  const previewImage = useLinkPreview(descUrl || null);

  // Location photo (Google Places)
  const locEnabled     = !!(placesPhotosCfg?.enabled && placesPhotosCfg?.api_key);
  const venueQuery     = event.location || getSportVenueQuery(enrichment);
  const locPhotoUrl    = usePlacePhoto(venueQuery, locEnabled, placesPhotosCfg?.api_key, isPast, refreshDays);

  // Title photo (Unsplash / Pexels) — only when no location or recipe image
  const titleCfg        = placesPhotosCfg?.titlePhotos;
  const titleCalIds     = titleCfg?.calendarIds;
  const titleEnabled    = !locPhotoUrl && !previewImage && !!(
    titleCfg?.enabled && titleCfg?.provider && titleCfg?.api_key &&
    titleCalIds?.length > 0 && titleCalIds.includes(event.calendar_id)
  );
  const titlePhotoUrl  = useTitlePhoto(event.summary, titleEnabled, titleCfg?.provider, titleCfg?.api_key, isPast, refreshDays);

  const photoUrl          = locPhotoUrl || previewImage || titlePhotoUrl;
  const isTitlePhoto      = !locPhotoUrl && !!(previewImage || titlePhotoUrl);
  const activeCfg         = locPhotoUrl ? placesPhotosCfg : titleCfg;
  // Guard: suppress photos until config has loaded — prevents flash when showOnCard is false
  const showPhotoOnCard   = !!(placesPhotosCfg && activeCfg?.showOnCard   !== false);
  const showPhotoOnPopout = !!(placesPhotosCfg && activeCfg?.showOnPopout !== false);

  const style = {
    popout: { ...DEFAULT_POPOUT },
    ...(cardStyle || {}),
    popout: { ...DEFAULT_POPOUT, ...(cardStyle?.popout || {}) },
  };

  const chipStyle    = style.chipStyle    || false;
  const emojiAsBadge = style.emojiAsBadge || false;
  const align        = style.align        || 'left';
  const valign       = style.valign       || 'top';
  const elements     = resolveElements(style);
  const visible      = elements.filter(e => e.visible !== false);

  const hJustify = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const vJustify = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
  const justifyContent = hJustify[align] || 'flex-start';

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

  function stripLeadingEmoji(str) {
    if (!str) return str;
    // Remove one leading emoji (including optional variation selector + skin tone)
    // and any whitespace that follows it
    return str.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})[\uFE0F\u{1F3FB}-\u{1F3FF}]?\s*/u, '').trim();
  }

  const cleanSummary = stripLeadingEmoji(event.summary || '');
  // For team sports use "NYK @ BOS" — saves card width vs full city+team names
  const cardSummary  = (enrichment?.data?.awayTeam?.abbrev && enrichment?.data?.homeTeam?.abbrev)
    ? `${enrichment.data.awayTeam.abbrev} @ ${enrichment.data.homeTeam.abbrev}`
    : cleanSummary;

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

  const emoji = (iconRulesOverride ?? true)
    ? getKeywordIcon(cleanSummary) || calEmoji
    : calEmoji || getKeywordIcon(cleanSummary);

  function renderTextElement(el) {
    if (el.key === 'time') {
      if (event.is_all_day || !event.start_at) return null;
      return <span key="time" className="event-time">{formatTime(event.start_at)}</span>;
    }
    if (el.key === 'title') {
      return (
        <span key="title" className="event-title">
          {!emojiAsBadge && emoji && <span className="event-emoji">{emoji}</span>}
          {isSportsTeamEvent
            ? <><span className="sports-name-full">{cleanSummary}</span><span className="sports-name-abbrev">{cardSummary}</span></>
            : cleanSummary}
        </span>
      );
    }
    if (el.key === 'calName') {
      return <span key="calName" className="event-cal">{event.cal_name}</span>;
    }
    if (el.key === 'desc' && event.description && !enrichment) {
      return (
        <span key="desc" className="event-desc-snippet">
          {event.description.slice(0, 60)}{event.description.length > 60 ? '…' : ''}
        </span>
      );
    }
    return null;
  }

  function renderCardContent() {
    const textCol = (
      <div className="event-card-text-col" style={{ textAlign: align }}>
        {visible.map(renderTextElement)}
      </div>
    );
    if (emojiAsBadge && (emoji || calAbbrev)) {
      const badge = emoji ? (
        <svg className="event-logo-circle" viewBox="0 0 32 32" width="28" height="28">
          <circle cx="16" cy="16" r="15" fill="var(--cal-color, #4285f4)" opacity="0.2" />
          <circle cx="16" cy="16" r="15" fill="none" stroke="var(--cal-color, #4285f4)" strokeWidth="1.5" opacity="0.5" />
          <text x="16" y="22" textAnchor="middle" fontSize="18" fill="var(--cal-color, #4285f4)">{emoji}</text>
        </svg>
      ) : (
        <svg className="event-logo-circle" viewBox="0 0 32 32" width="28" height="28">
          <circle cx="16" cy="16" r="15" fill="var(--cal-color, #4285f4)" opacity="0.2" />
          <circle cx="16" cy="16" r="15" fill="none" stroke="var(--cal-color, #4285f4)" strokeWidth="1.5" opacity="0.5" />
          <text x="16" y={calAbbrev.length > 2 ? 20 : 21} textAnchor="middle"
            fontSize={calAbbrev.length > 3 ? 7 : calAbbrev.length > 2 ? 8.5 : 10}
            fontFamily="system-ui, sans-serif" fontWeight="700"
            fill="var(--cal-color, #4285f4)">{calAbbrev}</text>
        </svg>
      );
      return (
        <div className="event-card-body event-card-body--badged" style={{ justifyContent }}>
          {badge}
          {textCol}
        </div>
      );
    }
    return <div className="event-card-body" style={{ textAlign: align }}>{visible.map(renderTextElement)}</div>;
  }

  // Card CSS class
  const isSportsTeamEvent = !!(enrichment?.data?.awayTeam?.abbrev && enrichment?.data?.homeTeam?.abbrev);

  const cardClass = [
    'event-card',
    event.is_all_day ? 'all-day' : '',
    chipStyle ? 'event-card--chip' : 'event-card--border',
    photoUrl && showPhotoOnCard ? `event-card--has-photo${isTitlePhoto ? ' event-card--has-photo--title' : ''}` : '',
    isSportsTeamEvent ? 'event-card--sports' : '',
    compact ? 'event-card--compact' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={cardClass}
        style={{
          '--cal-color': color,
          '--place-photo': photoUrl && showPhotoOnCard ? `url(${JSON.stringify(photoUrl)})` : undefined,
          cursor: 'pointer',
          justifyContent: vJustify[valign] || 'flex-start',
        }}
        onClick={() => setOpen(true)}
      >
        {renderCardContent()}
        {enrichment && sportsDisplay?.showChip !== false && (
          <>
            {enrichment.data?.homeScore != null && enrichment.sport !== 'golf' && enrichment.sport !== 'f1' && enrichment.sport !== 'nascar' && (
              <div className="event-card-score-chip">
                {enrichment.data.awayTeam?.abbrev} {enrichment.data.awayScore} · {enrichment.data.homeScore} {enrichment.data.homeTeam?.abbrev}
              </div>
            )}
            {enrichment.sport === 'golf' && enrichment.data?.leaderboard?.[0] && (
              <div className="event-card-score-chip">
                ⛳ {enrichment.data.leaderboard[0].name} {enrichment.data.leaderboard[0].score}
              </div>
            )}
            {enrichment.sport === 'f1' && enrichment.data?.topResults?.[0] && (
              <div className="event-card-score-chip">
                🏎️ {enrichment.data.topResults[0].acronym} P1
              </div>
            )}
            {enrichment.sport === 'nascar' && enrichment.data?.results?.[0] && (
              <div className="event-card-score-chip">
                🏁 {enrichment.data.results[0].name}
              </div>
            )}
          </>
        )}
      </div>

      {open && createPortal(
        <div className="event-popout-overlay" onClick={() => setOpen(false)}>
          <div
            className={`event-popout${photoUrl && showPhotoOnPopout ? ' event-popout--has-photo' : ''}`}
            style={{ '--cal-color': color }}
            onClick={(e) => e.stopPropagation()}
          >
            {photoUrl && showPhotoOnPopout && (
              <div
                className={`event-popout-photo${isTitlePhoto ? ' event-popout-photo--title' : ''}`}
                style={{ backgroundImage: `url(${JSON.stringify(photoUrl)})` }}
              />
            )}
            <div className="event-popout-bar" />

            <div className="event-popout-header">
              <div className="event-popout-title">
                {emoji && <span style={{ marginRight: 6 }}>{emoji}</span>}
                {cleanSummary}
              </div>
              <button className="btn-icon" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="event-popout-body" style={{ '--cal-color': color }}>
              {resolvePopoutElements(style).filter(e => e.visible !== false).map((el) => {
                if (el.key === 'calName' && event.cal_name) return (
                  <div key="calName" className="event-popout-row">
                    <span className="event-popout-label">Calendar</span>
                    <span className="event-popout-cal" style={{ color }}>● {event.cal_name}</span>
                  </div>
                );
                if (el.key === 'date') return (
                  <div key="date" className="event-popout-row">
                    <span className="event-popout-label">Date</span>
                    <span>{formatDate(event.start_at, event.start_date)}</span>
                  </div>
                );
                if (el.key === 'time' && !event.is_all_day && event.start_at) return (
                  <div key="time" className="event-popout-row">
                    <span className="event-popout-label">Time</span>
                    <span>{formatTime(event.start_at)}{event.end_at ? ` – ${formatTime(event.end_at)}` : ''}</span>
                  </div>
                );
                if (el.key === 'location' && event.location) return (
                  <div key="location" className="event-popout-row">
                    <span className="event-popout-label">Where</span>
                    <a href={mapsUrl(event.location)} target="_blank" rel="noreferrer" className="event-popout-location-link">
                      {event.location}
                    </a>
                  </div>
                );
                if (el.key === 'description' && event.description && !enrichment) {
                  const desc = event.description.trim();
                  const isLink = isUrl(desc);
                  const hostname = isLink ? (() => { try { return new URL(desc).hostname.replace(/^www\./, ''); } catch { return desc; } })() : null;
                  return (
                    <div key="description" className="event-popout-desc-block">
                      {isLink && previewImage ? (
                        <a href={desc} target="_blank" rel="noreferrer" className="event-popout-link-card">
                          <img src={previewImage} alt="" className="event-popout-link-thumb" />
                          <span className="event-popout-link-host">{hostname}</span>
                        </a>
                      ) : (
                        <div className="event-popout-row event-popout-desc">
                          <span className="event-popout-label">Details</span>
                          <span>
                            {isLink
                              ? <a href={desc} target="_blank" rel="noreferrer">{desc}</a>
                              : desc}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}
              {enrichment && <SportsPanel enrichment={enrichment} detailLevel={(sportsDisplay?.detail || {})[enrichment.sport] || 'all'} />}
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
