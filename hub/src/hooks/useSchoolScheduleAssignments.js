import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// The day-by-day content (course/teacher/room per period per day-letter)
// for one kid's schedule — see school_schedule_assignments in schema.sql.
export function useSchoolScheduleAssignments(scheduleId) {
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    if (!scheduleId) { setAssignments([]); return; }

    async function fetch() {
      const { data, error } = await supabase
        .from('school_schedule_assignments')
        .select('*')
        .eq('schedule_id', scheduleId);
      if (!error) setAssignments(data || []);
    }

    fetch();

    const channelName = `school_assignments_${scheduleId}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_schedule_assignments', filter: `schedule_id=eq.${scheduleId}` }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [scheduleId]);

  return assignments;
}
