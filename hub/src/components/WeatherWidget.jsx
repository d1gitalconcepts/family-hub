import { useState, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';

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

function formatSunTime(isoLocal) {
  if (!isoLocal) return '—';
  const [, timePart] = isoLocal.split('T');
  if (!timePart) return '—';
  const [hStr, mStr] = timePart.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function windCompass(deg) {
  if (deg == null) return '';
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

const FIELD_LABELS = {
  temp:      { label: 'Temp',       format: (v) => `${Math.round(v)}°F` },
  feelsLike: { label: 'Feels Like', format: (v) => `${Math.round(v)}°F` },
  humidity:  { label: 'Humidity',   format: (v) => `${Math.round(v)}%` },
  windspeed: { label: 'Wind',       format: (v, all) => `${Math.round(v)} mph ${windCompass(all?.winddir)}`.trim() },
  windgust:  { label: 'Gusts',      format: (v) => `${Math.round(v)} mph` },
  rain:      { label: 'Rain Today', format: (v) => `${v.toFixed(2)}"` },
  pressure:  { label: 'Pressure',   format: (v) => `${v.toFixed(2)} inHg` },
  uv:        { label: 'UV',         format: (v) => `${Math.round(v)}` },
  solar:     { label: 'Solar',      format: (v) => `${Math.round(v)} W/m²` },
  sunrise:   { label: 'Sunrise',    format: (v) => formatSunTime(v) },
  sunset:    { label: 'Sunset',     format: (v) => formatSunTime(v) },
};

// Single-colour SVG icons (Lucide-style, uses currentColor)
const ic = (d, extra) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...extra}>
    {d}
  </svg>
);

const FIELD_ICONS = {
  temp: ic(<>
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
  </>),
  feelsLike: ic(<>
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
    <line x1="16" y1="5"  x2="19" y2="5"/>
    <line x1="16" y1="9"  x2="18" y2="9"/>
    <line x1="16" y1="13" x2="19" y2="13"/>
  </>),
  humidity: ic(<>
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
  </>),
  windspeed: ic(<>
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2"/>
    <path d="M14.73 15.73A2.5 2.5 0 1 0 16.5 12H2"/>
    <path d="M10.59 19.41A2 2 0 1 0 12 16H2"/>
  </>),
  windgust: ic(<>
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2"/>
    <path d="M14.73 15.73A2.5 2.5 0 1 0 16.5 12H2"/>
    <path d="M10.59 19.41A2 2 0 1 0 12 16H2"/>
  </>, { strokeWidth: 2.5 }),
  rain: ic(<>
    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 15.25"/>
    <line x1="8"  y1="16" x2="8"  y2="20"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="16" y1="16" x2="16" y2="20"/>
  </>),
  pressure: ic(<>
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 6v6l4 2"/>
  </>),
  uv: ic(<>
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2"     x2="12" y2="4"/>
    <line x1="12" y1="20"    x2="12" y2="22"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="2" y1="12"    x2="4" y2="12"/>
    <line x1="20" y1="12"   x2="22" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </>),
  solar: ic(<>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </>),
  sunrise: ic(<>
    <path d="M17 18a5 5 0 0 0-10 0"/>
    <line x1="12" y1="2"  x2="12" y2="9"/>
    <line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/>
    <line x1="1"  y1="18" x2="3"  y2="18"/>
    <line x1="21" y1="18" x2="23" y2="18"/>
    <line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/>
    <line x1="23" y1="22" x2="1" y2="22"/>
    <polyline points="8 6 12 2 16 6"/>
  </>),
  sunset: ic(<>
    <path d="M17 18a5 5 0 0 0-10 0"/>
    <line x1="12" y1="9"  x2="12" y2="2"/>
    <line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/>
    <line x1="1"  y1="18" x2="3"  y2="18"/>
    <line x1="21" y1="18" x2="23" y2="18"/>
    <line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/>
    <line x1="23" y1="22" x2="1" y2="22"/>
    <polyline points="16 5 12 9 8 5"/>
  </>),
};

const DEFAULT_FIELDS = ['temp', 'feelsLike', 'humidity', 'windspeed', 'rain'];

export default function WeatherWidget({ position = 'below-header' }) {
  const isMobile = useIsMobile();
  const [weatherConfig] = useConfig('weather_config');
  const [current]       = useConfig('weather_current');

  const enabled        = weatherConfig?.enabled !== false;
  const fields         = weatherConfig?.fields  || DEFAULT_FIELDS;
  const hideRainIfZero = weatherConfig?.hideRainIfZero !== false;
  const labelMode      = weatherConfig?.labelMode || 'text';  // 'text' | 'icon'
  const configPosition = weatherConfig?.position || 'below-header';

  // On mobile always render below-header regardless of config
  const effectivePosition = isMobile ? 'below-header' : configPosition;
  if (!enabled || !current || effectivePosition !== position) return null;

  const age     = current.updatedAt ? Math.round((Date.now() - new Date(current.updatedAt)) / 60000) : null;
  const isStale = age !== null && age > 15;

  const isInline = position === 'in-header';

  return (
    <div className={[
      'weather-bar',
      isInline       ? 'weather-bar--inline'  : '',
      isMobile       ? 'weather-bar--mobile'  : '',
      isStale        ? 'weather-stale'         : '',
    ].filter(Boolean).join(' ')}>
      {fields.map((key) => {
        const def = FIELD_LABELS[key];
        const val = current[key];
        if (!def || val == null) return null;
        if (key === 'rain' && hideRainIfZero && val === 0) return null;

        const icon  = FIELD_ICONS[key];
        const showIcon = labelMode === 'icon' && icon;

        return (
          <div key={key} className="weather-item">
            {showIcon
              ? <span className="weather-icon" title={def.label}>{icon}</span>
              : <span className="weather-label">{def.label}</span>
            }
            <span className="weather-value">{def.format(val, current)}</span>
          </div>
        );
      })}
      {age !== null && (
        <div className="weather-age">
          {isStale ? `⚠ ${age}m ago` : `${age}m ago`}
        </div>
      )}
    </div>
  );
}
