import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useTaskLists() {
  const [taskLists, setTaskLists] = useState([]);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('task_lists')
        .select('*')
        .order('list_name');
      if (!error) setTaskLists(data || []);
    }

    fetch();

    const channelName = `task_lists_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_lists' }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return taskLists;
}
