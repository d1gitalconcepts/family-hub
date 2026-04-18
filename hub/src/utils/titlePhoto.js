import { getCachedPhoto, setCachedPhoto } from './photoCache';

const STOP_WORDS = new Set([
  'the','a','an','and','or','at','to','for','of','in','on','my','our','your',
  'with','from','by','its','this','that','have','has','had','will','are','was',
  'been','with','meeting','call','sync','appointment','event','day','time',
]);

export function extractKeyword(title) {
  if (!title) return null;
  const clean = title
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .toLowerCase()
    .trim();
  const words = clean.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return words.slice(0, 3).join(' ') || null;
}

async function fetchUnsplash(keyword, apiKey) {
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=1&orientation=landscape`,
    { headers: { Authorization: `Client-ID ${apiKey}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0]?.urls?.regular || null;
}

async function fetchPexels(keyword, apiKey) {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=1&orientation=landscape`,
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.photos?.[0]?.src?.large || null;
}

export async function getTitlePhoto(title, provider, apiKey, isPast = false, refreshDays = 7) {
  if (!title || !provider || !apiKey) return null;

  const keyword = extractKeyword(title);
  if (!keyword) return null;

  const cacheKey = `title:${keyword}`;
  const cached = await getCachedPhoto(cacheKey);
  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    const ttl = refreshDays * 24 * 60 * 60 * 1000;
    if (isPast || age < ttl) return cached.photo_url || null;
  }

  if (isPast) return null;

  try {
    let url = null;
    if (provider === 'unsplash') url = await fetchUnsplash(keyword, apiKey);
    if (provider === 'pexels')   url = await fetchPexels(keyword, apiKey);
    await setCachedPhoto(cacheKey, url, provider);
    return url;
  } catch {
    return null;
  }
}
