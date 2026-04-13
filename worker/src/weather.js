import { sbSelect, sbUpsert, getConfigValue } from './supabase.js';

const AW_BASE = 'https://rt.ambientweather.net/v1';

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
  const obs = devices[0].lastData;
  if (!obs) {
    console.warn('[Weather] No observation data in device response.');
    return;
  }

  const current = {
    temp:       obs.tempf       ?? null,
    feelsLike:  obs.feelsLike   ?? null,
    humidity:   obs.humidity    ?? null,
    windspeed:  obs.windspeedmph ?? null,
    windgust:   obs.windgustmph  ?? null,
    winddir:    obs.winddir      ?? null,
    rain:       obs.dailyrainin  ?? null,
    pressure:   obs.baromrelin   ?? null,
    uv:         obs.uv           ?? null,
    solar:      obs.solarradiation ?? null,
    updatedAt:  new Date().toISOString(),
  };

  await sbUpsert(env, 'config', [{
    key:        'weather_current',
    value:      current,
    updated_at: current.updatedAt,
  }]);

  console.log(`[Weather] Updated — ${current.temp}°F, ${current.humidity}% humidity.`);
}
