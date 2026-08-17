import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// The reusable class catalog (course + teacher + room) for one kid's
// schedule — defined once, then dragged onto blocks/days in the Days tab
// instead of retyping the same class everywhere it repeats.
//
// Returns [classes, fetchError]. classes is `undefined` until the first
// fetch for the current scheduleId resolves (same convention as
// useCurrentProfile), then always an array. This lets a consumer that
// keeps its own optimistic local copy tell "haven't loaded yet" apart
// from "loaded, zero classes" — so it can sync once on load without a
// later background refetch silently clobbering an in-progress local
// edit/delete. fetchError is a string message when the query itself
// failed — a real Postgrest/RLS error used to be swallowed here (`if
// (!error) setClasses(...)` and nothing else), which left the UI showing
// a plain "No classes yet" with zero indication anything had gone wrong.
export function useSchoolClasses(scheduleId) {
  const [classes, setClasses] = useState(undefined);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    if (!scheduleId) { setClasses([]); setFetchError(null); return; }
    setClasses(undefined);
    setFetchError(null);

    async function fetch() {
      // created_at, not name — sorting by name would reshuffle the whole
      // list mid-edit every time a class's name changes.
      const { data, error } = await supabase
        .from('school_classes')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('created_at');
      console.log('[useSchoolClasses] fetch result', { scheduleId, count: data?.length, error });
      if (error) {
        console.error('[useSchoolClasses] fetch failed', error);
        setFetchError(error.message || 'Failed to load classes');
        return;
      }
      setFetchError(null);
      setClasses(data || []);
    }

    fetch();

    const channelName = `school_classes_${scheduleId}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_classes', filter: `schedule_id=eq.${scheduleId}` }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [scheduleId]);

  return [classes, fetchError];
}
