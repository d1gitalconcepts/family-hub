import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// The reusable class catalog (course + teacher + room) for one kid's
// schedule — defined once, then dragged onto blocks/days in the Days tab
// instead of retyping the same class everywhere it repeats.
export function useSchoolClasses(scheduleId) {
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    if (!scheduleId) { setClasses([]); return; }

    async function fetch() {
      // created_at, not name — sorting by name would reshuffle the whole
      // list mid-edit every time a class's name changes.
      const { data, error } = await supabase
        .from('school_classes')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('created_at');
      if (!error) setClasses(data || []);
    }

    fetch();

    const channelName = `school_classes_${scheduleId}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_classes', filter: `schedule_id=eq.${scheduleId}` }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [scheduleId]);

  return classes;
}
