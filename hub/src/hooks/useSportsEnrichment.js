import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useSportsEnrichment() {
  const [enrichments, setEnrichments] = useState({});

  useEffect(() => {
    let channel;

    async function load() {
      const { data, error } = await supabase
        .from('sports_enrichment')
        .select('google_event_id, sport, data, fetched_at');
      if (!error && data) {
        const map = {};
        for (const row of data) map[row.google_event_id] = row;
        setEnrichments(map);
      }
    }

    load();

    channel = supabase
      .channel('sports_enrichment_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sports_enrichment' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setEnrichments((prev) => {
            const next = { ...prev };
            delete next[payload.old.google_event_id];
            return next;
          });
        } else {
          const row = payload.new;
          setEnrichments((prev) => ({ ...prev, [row.google_event_id]: row }));
        }
      })
      .subscribe();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  return enrichments;
}
