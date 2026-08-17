import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// One shared snow-day/holiday calendar that every kid's schedule reads
// from — matches one district calendar applying to the whole household.
export function useSchoolCalendarExceptions() {
  const [exceptions, setExceptions] = useState([]);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('school_calendar_exceptions')
        .select('*')
        .order('date');
      if (!error) setExceptions(data || []);
    }

    fetch();

    const channelName = `school_exceptions_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_calendar_exceptions' }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return exceptions;
}
