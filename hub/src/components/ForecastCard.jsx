import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfig } from '../hooks/useConfig';

// WMO weather interpretation codes → emoji + label
const WMO = {
  0:  { emoji: '☀️',  label: 'Clear'           },
  1:  { emoji: '🌤️', label: 'Mostly Clear'     },
  2:  { emoji: '⛅',  label: 'Partly Cloudy'   },
  3:  { emoji: '☁️',  label: 'Overcast'        },
  45: { emoji: '🌫️', label: 'Fog'             },
  48: { emoji: '🌫️', label: 'Freezing Fog'    },
  51: { emoji: '🌦️', label: 'Light Drizzle'   },
  53: { emoji: '🌦️', label: 'Drizzle'         },
  55: { emoji: '🌦️', label: 'Heavy Drizzle'   },
  61: { emoji: '🌧️', label: 'Light Rain'      },
  63: { emoji: '🌧️', label: 'Rain'            },
  65: { emoji: '🌧️', label: 'Heavy Rain'      },
  71: { emoji: '🌨️', label: 'Light Snow'      },
  73: { emoji: '🌨️', label: 'Snow'            },
  75: { emoji: '🌨️', label: 'Heavy Snow'      },
  77: { emoji: '❄️',  label: 'Snow Grains'     },
  80: { emoji: '🌦️', label: 'Showers'         },
  81: { emoji: '🌦️', label: 'Showers'         },
  82: { emoji: '🌦️', label: 'Heavy Showers'   },
  85: { emoji: '🌨️', label: 'Snow Showers'    },
  86: { emoji: '🌨️', label: 'Heavy Snow Shwrs'},
  95: { emoji: '⛈️',  label: 'Thunderstorm'   },
  96: { emoji: '⛈️',  label: 'Thunderstorm'   },
  99: { emoji: '⛈️',  label: 'Thunderstorm'   },
};

function wmo(code) {
  if (WMO[code]) return WMO[code];
  if (code <= 2)  return { emoji: '🌤️', label: 'Partly Cloudy' };
  if (code <= 3)  return { emoji: '☁️',  label: 'Overcast'      };
  if (code <= 48) return { emoji: '🌫️', label: 'Fog'           };
  if (code <= 55) return { emoji: '🌦️', label: 'Drizzle'       };
  if (code <= 65) return { emoji: '🌧️', label: 'Rain'          };
  if (code <= 77) return { emoji: '🌨️', label: 'Snow'          };
  if (code <= 82) return { emoji: '🌦️', label: 'Showers'       };
  if (code <= 86) return { emoji: '🌨️', label: 'Snow Showers'  };
  return { emoji: '⛈️', label: 'Thunderstorm' };
}

function formatSunTime(iso) {
  if (!iso) return null;
  const parts = iso.split('T');
  if (!parts[1]) return null;
  const [h, m] = parts[1].split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function hourLabel(hhmm) {
  const h = parseInt(hhmm.split(':')[0], 10);
  if (h === 0)  return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

// ── SVG bar + temperature chart ───────────────────────────────
function HourlyChart({ hourly, dayDate }) {
  if (!hourly?.length) return null;

  // Highlight the current hour column only if this card is for today
  const now          = new Date();
  const todayStr     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday      = dayDate === todayStr;
  const currentHour  = now.getHours();
  const currentIdx   = isToday
    ? hourly.findIndex((h) => parseInt(h.hour.split(':')[0], 10) === currentHour)
    : -1;

  const W = 340, H = 110;
  const PT = 22, PB = 20, PL = 6, PR = 6;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const n    = hourly.length;            // typically 24
  const slotW = cW / n;
  const barW  = Math.max(slotW * 0.72, 3);

  // Temperature range for normalising the line
  const temps   = hourly.map((h) => h.temp);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tRange  = maxTemp - minTemp || 1;

  // Map a temperature value → Y coordinate
  // Constrain the line to the upper 75% of the chart so it stays readable
  // even when precip bars are tall.
  const tempY = (t) => PT + cH * 0.05 + (1 - (t - minTemp) / tRange) * cH * 0.70;

  // Precip bar: height proportional to probability, growing up from bottom
  const barH   = (p) => (p / 100) * cH;
  const barX   = (i) => PL + i * slotW + (slotW - barW) / 2;
  const barTop = (p) => PT + cH - barH(p);

  // Temperature polyline
  const tempPts = hourly
    .map((h, i) => `${PL + i * slotW + slotW / 2},${tempY(h.temp)}`)
    .join(' ');

  // Indices to label: every 6 hours (0, 6, 12, 18)
  const labelIdxs = hourly.reduce((acc, h, i) => {
    if (parseInt(h.hour) % 6 === 0) acc.push(i);
    return acc;
  }, []);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* Current hour highlight — subtle vertical band behind everything */}
      {currentIdx >= 0 && (
        <rect
          x={PL + currentIdx * slotW}
          y={PT}
          width={slotW}
          height={cH}
          fill="var(--text)"
          opacity="0.08"
          rx={2}
        />
      )}

      {/* Subtle grid lines at 25 / 50 / 75 % precip */}
      {[25, 50, 75].map((pct) => (
        <line
          key={pct}
          x1={PL} y1={PT + cH - barH(pct)}
          x2={W - PR} y2={PT + cH - barH(pct)}
          stroke="var(--border)"
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />
      ))}

      {/* Precip bars */}
      {hourly.map((h, i) => (
        <rect
          key={i}
          x={barX(i)}
          y={barTop(h.precip)}
          width={barW}
          height={barH(h.precip)}
          fill="#4fc3f7"
          opacity={h.precip > 0 ? 0.25 + (h.precip / 100) * 0.65 : 0.08}
          rx={1.5}
        />
      ))}

      {/* Temperature polyline area fill */}
      <polyline
        points={tempPts}
        fill="none"
        stroke="#ff8c42"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Temperature dots + labels at every 6 hours */}
      {labelIdxs.map((i) => {
        const h = hourly[i];
        const cx = PL + i * slotW + slotW / 2;
        const cy = tempY(h.temp);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={2.8} fill="#ff8c42" />
            <text
              x={cx} y={cy - 5}
              textAnchor="middle"
              fontSize="8"
              fontFamily="system-ui, sans-serif"
              fill="#ff8c42"
              fontWeight="600"
            >{h.temp}°</text>
          </g>
        );
      })}

      {/* Hour axis labels */}
      {labelIdxs.map((i) => {
        const h = hourly[i];
        const x = PL + i * slotW + slotW / 2;
        return (
          <text
            key={`lbl-${i}`}
            x={x} y={H - 4}
            textAnchor="middle"
            fontSize="8"
            fontFamily="system-ui, sans-serif"
            fill="var(--text-muted)"
          >{hourLabel(h.hour)}</text>
        );
      })}

      {/* Y-axis precip % label (right side) */}
      <text x={W - PR} y={PT + cH - barH(100) - 3} textAnchor="end" fontSize="7" fontFamily="system-ui, sans-serif" fill="#4fc3f7" opacity="0.8">100%</text>
      <text x={W - PR} y={PT + cH - barH(50)  - 3} textAnchor="end" fontSize="7" fontFamily="system-ui, sans-serif" fill="#4fc3f7" opacity="0.8">50%</text>
    </svg>
  );
}

export default function ForecastCard({ day, cardStyle }) {
  const [open, setOpen] = useState(false);
  const [weatherConfig] = useConfig('weather_config');
  const layout = weatherConfig?.forecastLayout || 'list';

  if (!day) return null;
  const { emoji, label } = wmo(day.code);

  // Show every 3 hours: 00, 03, 06, 09, 12, 15, 18, 21
  const hourlySlots = (day.hourly || []).filter((h) => {
    const hr = parseInt(h.hour.split(':')[0], 10);
    return hr % 3 === 0;
  });

  const emojiAsBadge = cardStyle?.emojiAsBadge || false;

  return (
    <>
      <div className={`forecast-card${cardStyle?.chipStyle ? ' forecast-card--chip' : ''}`} onClick={() => setOpen(true)} style={{ cursor: 'pointer' }}>
        {emojiAsBadge ? (
          <div className="event-card-body event-card-body--badged" style={{ width: '100%' }}>
            <svg className="event-logo-circle" viewBox="0 0 32 32" width="28" height="28">
              <circle cx="16" cy="16" r="15" fill="#4fc3f7" opacity="0.18" />
              <circle cx="16" cy="16" r="15" fill="none" stroke="#4fc3f7" strokeWidth="1.5" opacity="0.55" />
              <text x="16" y="22" textAnchor="middle" fontSize="18" fill="#4fc3f7">{emoji}</text>
            </svg>
            <div className="event-card-text-col">
              <span className="forecast-label">{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="forecast-temps">
                  <span className="forecast-high">{day.high}°</span>
                  <span className="forecast-sep">/</span>
                  <span className="forecast-low">{day.low}°</span>
                </span>
                {day.precip > 0 && <span className="forecast-precip">💧{day.precip}%</span>}
              </div>
            </div>
          </div>
        ) : (
          <>
            <span className="forecast-emoji">{emoji}</span>
            <span className="forecast-label">{label}</span>
            <span className="forecast-temps">
              <span className="forecast-high">{day.high}°</span>
              <span className="forecast-sep">/</span>
              <span className="forecast-low">{day.low}°</span>
            </span>
            {day.precip > 0 && <span className="forecast-precip">💧{day.precip}%</span>}
          </>
        )}
      </div>

      {open && createPortal(
        <div className="event-popout-overlay" onClick={() => setOpen(false)}>
          <div className="event-popout forecast-popout" onClick={(e) => e.stopPropagation()}>
            <div className="event-popout-bar" />

            <div className="event-popout-header">
              <div className="event-popout-title">
                <span style={{ marginRight: 8 }}>{emoji}</span>
                {label}
              </div>
              <button className="btn-icon" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="event-popout-meta" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {formatDate(day.date)}
            </div>

            {/* Summary row */}
            <div className="forecast-popout-summary">
              <div className="forecast-popout-stat">
                <span className="forecast-popout-stat-label">High</span>
                <span className="forecast-popout-stat-val">{day.high}°</span>
              </div>
              <div className="forecast-popout-stat">
                <span className="forecast-popout-stat-label">Low</span>
                <span className="forecast-popout-stat-val">{day.low}°</span>
              </div>
              <div className="forecast-popout-stat">
                <span className="forecast-popout-stat-label">Wind</span>
                <span className="forecast-popout-stat-val">{day.wind} mph</span>
              </div>
              <div className="forecast-popout-stat">
                <span className="forecast-popout-stat-label">Precip</span>
                <span className="forecast-popout-stat-val">{day.precip}%</span>
              </div>
            </div>

            {/* Sunrise / Sunset */}
            {(day.sunrise || day.sunset) && (
              <div className="forecast-popout-sun">
                {day.sunrise && <span>🌅 {formatSunTime(day.sunrise)}</span>}
                {day.sunset  && <span>🌇 {formatSunTime(day.sunset)}</span>}
              </div>
            )}

            {/* Hourly: chart or list */}
            {day.hourly?.length > 0 && layout === 'chart' && (
              <div className="forecast-popout-chart-wrap">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span style={{ color: '#4fc3f7' }}>■ Precip chance</span>
                  <span style={{ color: '#ff8c42' }}>— Temperature</span>
                </div>
                <HourlyChart hourly={day.hourly} dayDate={day.date} />
              </div>
            )}

            {hourlySlots.length > 0 && layout === 'list' && (
              <div className="forecast-popout-hourly">
                {hourlySlots.map((h) => {
                  const { emoji: hEmoji } = wmo(h.code);
                  return (
                    <div key={h.hour} className="forecast-hourly-slot">
                      <span className="forecast-hourly-time">{formatHour(h.hour)}</span>
                      <span className="forecast-hourly-emoji">{hEmoji}</span>
                      <span className="forecast-hourly-temp">{h.temp}°</span>
                      {h.precip > 0
                        ? <span className="forecast-hourly-precip">💧{h.precip}%</span>
                        : <span className="forecast-hourly-precip" style={{ visibility: 'hidden' }}>💧0%</span>
                      }
                    </div>
                  );
                })}
              </div>
            )}

            {!day.hourly?.length && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                Hourly data not yet available — sync the worker to load it.
              </p>
            )}
          </div>
        </div>
      , document.body)}
    </>
  );
}
