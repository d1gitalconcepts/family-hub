import { getCachedPhoto, setCachedPhoto } from './photoCache';

export function getSportVenueQuery(enrichment) {
  if (!enrichment?.data) return null;
  const { sport, data } = enrichment;
  if (data.venue)                                return data.venue;
  if (sport === 'golf'   && data.tournamentName) return `${data.tournamentName} golf`;
  if (sport === 'f1'     && data.circuitName)    return [data.circuitName, data.countryName].filter(Boolean).join(' ');
  if (sport === 'nascar' && data.raceName)       return data.raceName;
  return null;
}

export async function getPlacePhoto(location, apiKey, isPast = false, refreshDays = 7) {
  if (!location || !apiKey) return null;

  const cached = await getCachedPhoto(location);
  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    const ttl = refreshDays * 24 * 60 * 60 * 1000;
    if (isPast || age < ttl) return cached.photo_url || null;
  }

  if (isPast) return null;

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
      await setCachedPhoto(location, null, 'places');
      return null;
    }

    const photoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&skipHttpRedirect=true&key=${apiKey}`
    );
    if (!photoRes.ok) return null;

    const photoData = await photoRes.json();
    const url = photoData.photoUri || null;
    await setCachedPhoto(location, url, 'places');
    return url;
  } catch {
    return null;
  }
}
