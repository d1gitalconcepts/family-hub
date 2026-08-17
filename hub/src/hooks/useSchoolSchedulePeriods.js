import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// The block/time template for one kid's schedule — entered once,
// independent of day-letter (see school_schedule_periods in schema.sql).
export function useSchoolSchedulePeriods(scheduleId) {
  const [periods, setPeriods] = useState([]);

  useEffect(() => {
    if (!scheduleId) { setPeriods([]); return; }

    async function fetch() {
      const { data, error } = await supabase
        .from('school_schedule_periods')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('block_number')
        .order('slot_index');
      if (!error) setPeriods(data || []);
    }

    fetch();

    const channelName = `school_periods_${scheduleId}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_schedule_periods', filter: `schedule_id=eq.${scheduleId}` }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [scheduleId]);

  return periods;
}
