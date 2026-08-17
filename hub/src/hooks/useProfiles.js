import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// Full family member roster for the admin People tab. RLS scopes this to
// "everyone" for admins and "just your own row" for everyone else, so it's
// safe to call from anywhere.
//
// Returns [profiles, updateProfile]. updateProfile(id, patch) applies the
// patch to local state immediately (so checkboxes/inputs reflect the click
// right away, and a second rapid edit reads the already-updated value
// instead of a stale one) and persists to Supabase in the background,
// rolling back to server truth if the write fails. Mirrors useConfig's
// optimistic-update pattern.
export function useProfiles() {
  const [profiles, setProfiles] = useState([]);

  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at');
    if (!error) setProfiles(data || []);
    return { data, error };
  }, []);

  useEffect(() => {
    fetchProfiles();

    const channelName = `profiles_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchProfiles)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchProfiles]);

  const updateProfile = useCallback(async (id, patch) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('Failed to update profile', error);
      await fetchProfiles(); // roll back to server truth
    }
    return { error };
  }, [fetchProfiles]);

  return [profiles, updateProfile];
}
