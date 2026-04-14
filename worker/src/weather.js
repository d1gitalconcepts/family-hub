import { sbUpsert, getConfigValue } from './supabase.js';

const AW_BASE       = 'https://rt.ambientweather.net/v1';
const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';

export async function pollWeather(env) {
  // Read API keys from Supabase config (set via Settings panel)
  const keys = await getConfigValue(env, 'weather_keys');
  if (!keys?.api_key || !keys?.app_key) {
    // Keys not configured yet — skip silently
    return;
  }

  const url = `${AW_BASE}/devices?applicationKey=${encodeURIComponent(keys.app_key)}&apiKey=${encodeURIComponent(keys.api_key)}`;

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.warn('[Weather] Fetch error:', err.message);
    return;
  }

  if (!res.ok) {
    console.warn('[Weather] API error:', res.status, await res.text());
    return;
  }

  const devices = await res.json();
  if (!devices?.length) {
    console.warn('[Weather] No devices returned from Ambient Weather.');
    return;
  }

  // Use the first device (most users only have one station)
  const device = devices[0];
  const obs    = device.lastData;
  if (!obs) {
    console.warn('[Weather] No observation data in device response.');
    return;
  }

  // Extract lat/lon from device info — AW returns coords in info.coords.coords or GeoJSON
  const coordsObj = device.info?.coords?.coords;
  const geoCoords = device.info?.coords?.geo?.coordinates; // GeoJSON: [lon, lat]
  const lat = coordsObj?.lat ?? (geoCoords ? geoCoords[1] : null);
  const lon = coordsObj?.lon ?? (geoCoords ? geoCoords[0] : null);

  // Fetch forecast first so we can include today's sunrise/sunset in weather_current
  let todaySunrise = null;
  let todaySunset  = null;
  if (lat != null && lon != null) {
    const sunTimes = await pollForecast(env, lat, lon);
    todaySunrise   = sunTimes?.todaySunrise ?? null;
    todaySunset    = sunTimes?.todaySunset  ?? null;
  } else {
    console.warn('[Weather] Could not extract lat/lon from device — skipping forecast.');
  }

  const current = {
    temp:       obs.tempf            ?? null,
    feelsLike:  obs.feelsLike        ?? null,
    humidity:   obs.humidity         ?? null,
    windspeed:  obs.windspeedmph     ?? null,
    windgust:   obs.windgustmph      ?? null,
    winddir:    obs.winddir          ?? null,
    rain:       obs.dailyrainin      ?? null,
    pressure:   obs.baromrelin       ?? null,
    uv:         obs.uv               ?? null,
    solar:      obs.solarradiation   ?? null,
    sunrise:    todaySunrise,
    sunset:     todaySunset,
    updatedAt:  new Date().toISOString(),
  };

  await sbUpsert(env, 'config', [{
    key:        'weather_current',
    value:      current,
    updated_at: current.updatedAt,
  }]);

  console.log(`[Weather] Updated — ${current.temp}°F, ${current.humidity}% humidity.`);
}

async function pollForecast(env, lat, lon) {
  const params = new URLSearchParams({
    latitude:   lat,
    longitude:  lon,
    daily:      'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max,sunrise,sunset',
    hourly:     'precipitation_probability,temperature_2m,weathercode,windspeed_10m',
    temperature_unit: 'fahrenheit',
    windspeed_unit:   'mph',
    timezone:   'auto',
    forecast_days: 7,
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
  const d    = data.daily;
  if (!d?.time?.length) {
    console.warn('[Weather] Forecast: empty daily data.');
    return;
  }

  // Group hourly data by date so we can attach it to each day
  const h = data.hourly;
  const hourlyByDate = {};
  if (h?.time?.length) {
    h.time.forEach((isoTime, i) => {
      const date = isoTime.split('T')[0];
      if (!hourlyByDate[date]) hourlyByDate[date] = [];
      hourlyByDate[date].push({
        hour:   isoTime.split('T')[1].slice(0, 5),          // "HH:MM"
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

  // Expose today's sunrise/sunset in weather_current so the widget can show them
  const todayStr    = new Date().toISOString().split('T')[0];
  const todayIdx    = d.time.findIndex((date) => date === todayStr);
  const todaySunrise = todayIdx >= 0 ? (d.sunrise?.[todayIdx]  ?? null) : null;
  const todaySunset  = todayIdx >= 0 ? (d.sunset?.[todayIdx]   ?? null) : null;

  const now = new Date().toISOString();
  await sbUpsert(env, 'config', [{ key: 'weather_forecast', value: forecast, updated_at: now }]);

  return { todaySunrise, todaySunset };
  console.log(`[Weather] Forecast updated — ${forecast.length} days from Open-Meteo.`);
}
