import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Block/period rows for one kid's schedule.
export function useSchoolScheduleBlocks(scheduleId) {
  const [blocks, setBlocks] = useState([]);

  useEffect(() => {
    if (!scheduleId) { setBlocks([]); return; }

    async function fetch() {
      const { data, error } = await supabase
        .from('school_schedule_blocks')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('start_time');
      if (!error) setBlocks(data || []);
    }

    fetch();

    const channelName = `school_blocks_${scheduleId}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_schedule_blocks', filter: `schedule_id=eq.${scheduleId}` }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [scheduleId]);

  return blocks;
}
