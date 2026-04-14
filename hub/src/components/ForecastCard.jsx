import { useState } from 'react';
import { createPortal } from 'react-dom';

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

export default function ForecastCard({ day }) {
  const [open, setOpen] = useState(false);
  if (!day) return null;
  const { emoji, label } = wmo(day.code);

  // Show every 3 hours: 00, 03, 06, 09, 12, 15, 18, 21
  const hourlySlots = (day.hourly || []).filter((h) => {
    const hr = parseInt(h.hour.split(':')[0], 10);
    return hr % 3 === 0;
  });

  return (
    <>
      <div className="forecast-card" onClick={() => setOpen(true)} style={{ cursor: 'pointer' }}>
        <span className="forecast-emoji">{emoji}</span>
        <span className="forecast-label">{label}</span>
        <span className="forecast-temps">
          <span className="forecast-high">{day.high}°</span>
          <span className="forecast-sep">/</span>
          <span className="forecast-low">{day.low}°</span>
        </span>
        {day.precip > 0 && (
          <span className="forecast-precip">💧{day.precip}%</span>
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

            {/* Hourly strip */}
            {hourlySlots.length > 0 && (
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

            {hourlySlots.length === 0 && (
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
