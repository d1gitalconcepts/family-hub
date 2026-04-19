import { sbUpsert, getConfigValue } from './supabase.js';

const AW_BASE       = 'https://rt.ambientweather.net/v1';
const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';

export async function pollWeather(env) {
  const source = await getConfigValue(env, 'weather_source') ?? 'ambient';

  if (source === 'openmeteo') {
    await pollWeatherOpenMeteo(env);
  } else {
    await pollWeatherAmbient(env);
  }
}

// ── Ambient Weather source ────────────────────────────────────────────────────

async function pollWeatherAmbient(env) {
  const keys = await getConfigValue(env, 'weather_keys');
  if (!keys?.api_key || !keys?.app_key) {
    console.warn('[Weather] Ambient: no API keys configured.');
    return;
  }

  const url = `${AW_BASE}/devices?applicationKey=${encodeURIComponent(keys.app_key)}&apiKey=${encodeURIComponent(keys.api_key)}`;

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.warn('[Weather] Ambient fetch error:', err.message);
    return;
  }

  if (!res.ok) {
    console.warn('[Weather] Ambient API error:', res.status, await res.text());
    return;
  }

  const devices = await res.json();
  if (!devices?.length) {
    console.warn('[Weather] Ambient: no devices returned.');
    return;
  }

  const device = devices[0];
  const obs    = device.lastData;
  if (!obs) {
    console.warn('[Weather] Ambient: no observation data.');
    return;
  }

  // Extract lat/lon from device info
  const coordsObj = device.info?.coords?.coords;
  const geoCoords = device.info?.coords?.geo?.coordinates; // GeoJSON: [lon, lat]
  const lat = coordsObj?.lat ?? (geoCoords ? geoCoords[1] : null);
  const lon = coordsObj?.lon ?? (geoCoords ? geoCoords[0] : null);

  let todaySunrise = null;
  let todaySunset  = null;
  if (lat != null && lon != null) {
    const sunTimes = await pollForecast(env, lat, lon);
    todaySunrise   = sunTimes?.todaySunrise ?? null;
    todaySunset    = sunTimes?.todaySunset  ?? null;
  } else {
    console.warn('[Weather] Ambient: could not extract lat/lon — skipping forecast.');
  }

  const current = {
    temp:      obs.tempf          ?? null,
    feelsLike: obs.feelsLike      ?? null,
    humidity:  obs.humidity       ?? null,
    windspeed: obs.windspeedmph   ?? null,
    windgust:  obs.windgustmph    ?? null,
    winddir:   obs.winddir        ?? null,
    rain:      obs.eventrainin    ?? null,
    rainDaily: obs.dailyrainin   ?? null,
    pressure:  obs.baromrelin     ?? null,
    uv:        obs.uv             ?? null,
    solar:     obs.solarradiation ?? null,
    sunrise:   todaySunrise,
    sunset:    todaySunset,
    source:    'ambient',
    updatedAt: new Date().toISOString(),
  };

  await sbUpsert(env, 'config', [{ key: 'weather_current', value: current, updated_at: current.updatedAt }]);
  console.log(`[Weather] Ambient updated — ${current.temp}°F, ${current.humidity}% humidity.`);
}

// ── Open-Meteo source (no weather station required) ───────────────────────────

async function pollWeatherOpenMeteo(env) {
  const location = await getConfigValue(env, 'weather_location');
  if (!location?.lat || !location?.lon) {
    console.warn('[Weather] Open-Meteo: no location configured. Set a zip code or device location in Settings.');
    return;
  }

  const { lat, lon } = location;

  // Fetch current conditions + forecast in one call
  const params = new URLSearchParams({
    latitude:  lat,
    longitude: lon,
    current:   [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'wind_speed_10m',
      'wind_gusts_10m',
      'wind_direction_10m',
      'precipitation',
      'surface_pressure',
      'uv_index',
      'weather_code',
    ].join(','),
    daily:            'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max,sunrise,sunset,precipitation_sum',
    hourly:           'precipitation_probability,temperature_2m,weathercode,windspeed_10m',
    temperature_unit: 'fahrenheit',
    windspeed_unit:   'mph',
    precipitation_unit: 'inch',
    timezone:         'auto',
    forecast_days:    14,
  });

  let res;
  try {
    res = await fetch(`${FORECAST_BASE}?${params}`);
  } catch (err) {
    console.warn('[Weather] Open-Meteo fetch error:', err.message);
    return;
  }

  if (!res.ok) {
    console.warn('[Weather] Open-Meteo API error:', res.status, await res.text());
    return;
  }

  const data = await res.json();
  const c    = data.current;

  // Convert hPa → inHg for pressure
  const pressureInHg = c.surface_pressure != null ? +(c.surface_pressure * 0.02953).toFixed(2) : null;

  // Get today's daily rain total (more useful than current-hour precip)
  const todayStr = new Date().toISOString().split('T')[0];
  const todayDailyIdx = data.daily?.time?.findIndex((d) => d === todayStr) ?? -1;
  const rainToday = todayDailyIdx >= 0 ? (data.daily.precipitation_sum?.[todayDailyIdx] ?? null) : null;

  // Sunrise/sunset from today's daily row
  const todaySunrise = todayDailyIdx >= 0 ? (data.daily.sunrise?.[todayDailyIdx] ?? null) : null;
  const todaySunset  = todayDailyIdx >= 0 ? (data.daily.sunset?.[todayDailyIdx]  ?? null) : null;

  const current = {
    temp:      c.temperature_2m        != null ? Math.round(c.temperature_2m)        : null,
    feelsLike: c.apparent_temperature  != null ? Math.round(c.apparent_temperature)  : null,
    humidity:  c.relative_humidity_2m  ?? null,
    windspeed: c.wind_speed_10m        != null ? Math.round(c.wind_speed_10m)        : null,
    windgust:  c.wind_gusts_10m        != null ? Math.round(c.wind_gusts_10m)        : null,
    winddir:   c.wind_direction_10m    ?? null,
    rain:      rainToday,
    pressure:  pressureInHg,
    uv:        c.uv_index              ?? null,
    solar:     null,                         // not available in Open-Meteo current
    sunrise:   todaySunrise,
    sunset:    todaySunset,
    source:    'openmeteo',
    updatedAt: new Date().toISOString(),
  };

  await sbUpsert(env, 'config', [{ key: 'weather_current', value: current, updated_at: current.updatedAt }]);
  console.log(`[Weather] Open-Meteo updated — ${current.temp}°F at ${location.label || `${lat},${lon}`}`);

  // Store forecast (reuse same function)
  await pollForecastFromData(env, data);
}

// ── Forecast (shared) ─────────────────────────────────────────────────────────

async function pollForecast(env, lat, lon) {
  const params = new URLSearchParams({
    latitude:   lat,
    longitude:  lon,
    daily:      'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max,sunrise,sunset',
    hourly:     'precipitation_probability,temperature_2m,weathercode,windspeed_10m',
    temperature_unit: 'fahrenheit',
    windspeed_unit:   'mph',
    timezone:   'auto',
    forecast_days: 14,
  });

  let res;
  try {
    res = await fetch(`${FORECAST_BASE}?${params}`);
  } catch (err) {
    console.warn('[Weather] Forecast fetch error:', err.message);
    return;
  }

  if (!res.ok) {
    console.warn('[Weather] Forecast API error:', res.status, await res.text());
    return;
  }

  const data = await res.json();
  return pollForecastFromData(env, data);
}

async function pollForecastFromData(env, data) {
  const d = data.daily;
  if (!d?.time?.length) {
    console.warn('[Weather] Forecast: empty daily data.');
    return;
  }

  const h = data.hourly;
  const hourlyByDate = {};
  if (h?.time?.length) {
    h.time.forEach((isoTime, i) => {
      const date = isoTime.split('T')[0];
      if (!hourlyByDate[date]) hourlyByDate[date] = [];
      hourlyByDate[date].push({
        hour:   isoTime.split('T')[1].slice(0, 5),
        temp:   Math.round(h.temperature_2m[i]            ?? 0),
        precip: h.precipitation_probability[i]             ?? 0,
        wind:   Math.round(h.windspeed_10m[i]             ?? 0),
        code:   h.weathercode[i]                           ?? 0,
      });
    });
  }

  const forecast = d.time.map((date, i) => ({
    date,
    high:    Math.round(d.temperature_2m_max[i]              ?? 0),
    low:     Math.round(d.temperature_2m_min[i]              ?? 0),
    precip:  d.precipitation_probability_max[i]              ?? 0,
    wind:    Math.round(d.windspeed_10m_max[i]               ?? 0),
    code:    d.weathercode[i]                                ?? 0,
    sunrise: d.sunrise?.[i]                                  ?? null,
    sunset:  d.sunset?.[i]                                   ?? null,
    hourly:  hourlyByDate[date]                              ?? [],
  }));

  const todayStr     = new Date().toISOString().split('T')[0];
  const todayIdx     = d.time.findIndex((date) => date === todayStr);
  const todaySunrise = todayIdx >= 0 ? (d.sunrise?.[todayIdx] ?? null) : null;
  const todaySunset  = todayIdx >= 0 ? (d.sunset?.[todayIdx]  ?? null) : null;

  const now = new Date().toISOString();
  await sbUpsert(env, 'config', [{ key: 'weather_forecast', value: forecast, updated_at: now }]);
  console.log(`[Weather] Forecast updated — ${forecast.length} days.`);

  return { todaySunrise, todaySunset };
}
