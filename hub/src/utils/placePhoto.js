const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export async function getPlacePhoto(location, apiKey) {
  if (!location || !apiKey) return null;

  const cacheKey = `fh_place_photo_${location}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { url, expires } = JSON.parse(cached);
      if (Date.now() < expires) return url || null;
    }
  } catch {}

  try {
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.photos',
      },
      body: JSON.stringify({ textQuery: location }),
    });
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const photoName = searchData.places?.[0]?.photos?.[0]?.name;
    if (!photoName) {
      // Cache null so we don't keep hitting the API for locations with no photo
      localStorage.setItem(cacheKey, JSON.stringify({ url: null, expires: Date.now() + CACHE_TTL }));
      return null;
    }

    const photoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&skipHttpRedirect=true&key=${apiKey}`
    );
    if (!photoRes.ok) return null;

    const photoData = await photoRes.json();
    const url = photoData.photoUri || null;
    localStorage.setItem(cacheKey, JSON.stringify({ url, expires: Date.now() + CACHE_TTL }));
    return url;
  } catch {
    return null;
  }
}
