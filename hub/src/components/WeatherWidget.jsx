import { useConfig } from '../hooks/useConfig';

const FIELD_LABELS = {
  temp:      { label: 'Temp',      format: (v) => `${Math.round(v)}°F` },
  feelsLike: { label: 'Feels Like',format: (v) => `${Math.round(v)}°F` },
  humidity:  { label: 'Humidity',  format: (v) => `${Math.round(v)}%` },
  windspeed: { label: 'Wind',      format: (v, all) => `${Math.round(v)} mph ${windCompass(all?.winddir)}`.trim() },
  windgust:  { label: 'Gusts',     format: (v) => `${Math.round(v)} mph` },
  rain:      { label: 'Rain Today',format: (v) => `${v.toFixed(2)}"` },
  pressure:  { label: 'Pressure',  format: (v) => `${v.toFixed(2)} inHg` },
  uv:        { label: 'UV',        format: (v) => `${Math.round(v)}` },
  solar:     { label: 'Solar',     format: (v) => `${Math.round(v)} W/m²` },
};

const DEFAULT_FIELDS = ['temp', 'feelsLike', 'humidity', 'windspeed', 'rain'];

function windCompass(deg) {
  if (deg == null) return '';
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export default function WeatherWidget() {
  const [weatherConfig] = useConfig('weather_config');
  const [current]       = useConfig('weather_current');

  const enabled = weatherConfig?.enabled !== false;
  const fields  = weatherConfig?.fields || DEFAULT_FIELDS;

  if (!enabled || !current) return null;

  const age     = current.updatedAt ? Math.round((Date.now() - new Date(current.updatedAt)) / 60000) : null;
  const isStale = age !== null && age > 15;

  return (
    <div className={`weather-bar${isStale ? ' weather-stale' : ''}`}>
      {fields.map((key) => {
        const def = FIELD_LABELS[key];
        const val = current[key];
        if (!def || val == null) return null;
        return (
          <div key={key} className="weather-item">
            <span className="weather-label">{def.label}</span>
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
