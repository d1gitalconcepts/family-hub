import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useConfig(key) {
  const [value, setValue] = useState(undefined);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('config')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (data) setValue(data.value);
    }

    fetch();

    const channelName = `config_${key}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config', filter: `key=eq.${key}` }, (payload) => {
        setValue(payload.new?.value ?? null);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [key]);

  async function updateValue(newValue) {
    setValue(newValue);
    await supabase.from('config').upsert({ key, value: newValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  }

  return [value, updateValue];
}
