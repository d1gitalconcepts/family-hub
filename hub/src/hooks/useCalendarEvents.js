import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useCalendarEvents(weekStart, weekEnd) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!weekStart || !weekEnd) return;

    async function fetchEvents() {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .or(
          `and(is_all_day.eq.false,start_at.gte.${weekStart.toISOString()},start_at.lte.${weekEnd.toISOString()}),` +
          `and(is_all_day.eq.true,start_date.gte.${weekStart.toISOString().split('T')[0]},start_date.lte.${weekEnd.toISOString().split('T')[0]})`
        )
        .order('start_at', { ascending: true });

      if (!error) setEvents(data || []);
    }

    fetchEvents();

    // Real-time subscription
    const channel = supabase
      .channel('calendar_events_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, fetchEvents)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [weekStart?.toISOString(), weekEnd?.toISOString()]);

  return events;
}
