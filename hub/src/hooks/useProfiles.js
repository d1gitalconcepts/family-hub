import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Full family member roster for the admin People tab. RLS scopes this to
// "everyone" for admins and "just your own row" for everyone else, so it's
// safe to call from anywhere.
export function useProfiles() {
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at');
      if (!error) setProfiles(data || []);
    }

    fetch();

    const channelName = `profiles_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetch)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return profiles;
}
