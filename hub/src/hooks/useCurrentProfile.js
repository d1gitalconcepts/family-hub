import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Live-subscribes to the logged-in user's own profiles row, so an admin's
// edits (permissions, calendar/checklist visibility) take effect for an
// already-logged-in family member without them having to log back in.
export function useCurrentProfile(userId) {
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }

    async function fetch() {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      setProfile(data ?? null);
    }
    fetch();

    const channelName = `profile_${userId}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => {
        setProfile(payload.new ?? null);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId]);

  return profile;
}
