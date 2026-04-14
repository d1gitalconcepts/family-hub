import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Reads shopping list items directly from the Keep-scraped notes table.
// Keep is now the single source of truth — no Google Tasks involved.
export function useShoppingList() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('notes')
        .select('data')
        .eq('key', 'shopping-list')
        .maybeSingle();
      if (data?.data?.items) setItems(data.data.items);
    }

    fetch();

    const channel = supabase
      .channel(`shopping_list_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: 'key=eq.shopping-list' }, (payload) => {
        if (payload.new?.data?.items) setItems(payload.new.data.items);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return items;
}
