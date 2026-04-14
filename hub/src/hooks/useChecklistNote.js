import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Generic hook — reads any checklist note by key from the notes table.
// Real-time subscription updates items when the scraper writes new data.
export function useChecklistNote(key) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!key) return;

    async function fetch() {
      const { data } = await supabase
        .from('notes')
        .select('data')
        .eq('key', key)
        .maybeSingle();
      if (data?.data?.items) setItems(data.data.items);
    }

    fetch();

    const channel = supabase
      .channel(`note_${key}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `key=eq.${key}` }, (payload) => {
        if (payload.new?.data?.items) setItems(payload.new.data.items);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [key]);

  return items;
}
