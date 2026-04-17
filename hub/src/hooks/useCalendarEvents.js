import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useCalendarEvents(weekStart, weekEnd) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!weekStart || !weekEnd) return;

    async function fetchEvents() {
      const weekStartDate = weekStart.toISOString().split('T')[0];
      const weekEndDate   = weekEnd.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .or(
          // Timed events within the week
          `and(is_all_day.eq.false,start_at.gte.${weekStart.toISOString()},start_at.lte.${weekEnd.toISOString()}),` +
          // All-day events starting within the week
          `and(is_all_day.eq.true,start_date.gte.${weekStartDate},start_date.lte.${weekEndDate}),` +
          // Multi-day all-day events that started before this week but extend into it
          `and(is_all_day.eq.true,start_date.lt.${weekStartDate},end_date.gt.${weekStartDate})`
        )
        .order('start_at', { ascending: true });

      if (error) console.error('[useCalendarEvents]', error);
      else setEvents(data || []);
    }

    fetchEvents();

    // Real-time subscription
    const channelName = `calendar_events_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, fetchEvents)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [weekStart?.toISOString(), weekEnd?.toISOString()]);

  return events;
}
