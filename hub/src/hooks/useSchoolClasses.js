import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// The reusable class catalog (course + teacher + room) for one kid's
// schedule — defined once, then dragged onto blocks/days in the Days tab
// instead of retyping the same class everywhere it repeats.
//
// Returns [classes, fetchError]. classes is `undefined` until data has
// actually been fetched *for the scheduleId currently being asked about*,
// then always an array (even an empty one is a valid loaded state — "no
// schedule selected" or "loaded, zero classes"). fetchError is a string
// message when the query itself failed.
//
// State and scheduleId are bundled into one object (not separate useState
// calls) specifically to close a render-order race: when scheduleId
// changes (e.g. from null to a real id, once the parent schedule finishes
// loading), React re-renders with the *old* state before this hook's own
// effect has run to reset it — so a naive "classes !== undefined" check
// would treat last id's stale (possibly empty) result as valid data for
// the new id. Comparing state.scheduleId against the live scheduleId
// argument at render time (not just in the effect) catches that case
// immediately and returns undefined until a fetch for THIS id lands.
export function useSchoolClasses(scheduleId) {
  const [state, setState] = useState({ forId: null, classes: undefined, error: null });

  useEffect(() => {
    if (!scheduleId) { setState({ forId: scheduleId, classes: [], error: null }); return; }
    setState({ forId: scheduleId, classes: undefined, error: null });

    async function fetch() {
      // created_at, not name — sorting by name would reshuffle the whole
      // list mid-edit every time a class's name changes.
      const { data, error } = await supabase
        .from('school_classes')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('created_at');
      if (error) {
        console.error('[useSchoolClasses] fetch failed', error);
        setState({ forId: scheduleId, classes: undefined, error: error.message || 'Failed to load classes' });
        return;
      }
      setState({ forId: scheduleId, classes: data || [], error: null });
    }

    fetch();

    const channelName = `school_classes_${scheduleId}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_classes', filter: `schedule_id=eq.${scheduleId}` }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [scheduleId]);

  if (state.forId !== scheduleId) return [undefined, null];
  return [state.classes, state.error];
}
