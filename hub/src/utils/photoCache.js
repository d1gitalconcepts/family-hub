import { supabase } from '../supabaseClient';

export async function getCachedPhoto(query) {
  try {
    const { data } = await supabase
      .from('place_photos')
      .select('photo_url, source, fetched_at')
      .eq('query', query)
      .single();
    return data || null;
  } catch {
    return null;
  }
}

export async function setCachedPhoto(query, photoUrl, source) {
  try {
    await supabase
      .from('place_photos')
      .upsert(
        { query, photo_url: photoUrl, source, fetched_at: new Date().toISOString() },
        { onConflict: 'query' }
      );
  } catch {}
}
