import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// All configured school schedules, one per kid (profile), with the
// owning profile's display name joined in. Used by the kid-picker in
// view mode and by the admin "Schedules" editor.
export function useSchoolSchedules() {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('school_schedules')
        .select('*, profile:profiles(id, display_name)')
        .order('created_at');
      if (!error) setSchedules(data || []);
    }

    fetch();

    const channelName = `school_schedules_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_schedules' }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return schedules;
}
