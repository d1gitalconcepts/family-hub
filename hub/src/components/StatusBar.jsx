import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function StatusBar() {
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    async function fetchLastSync() {
      const { data } = await supabase
        .from('notes')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setLastSync(data.updated_at);
    }

    fetchLastSync();

    const channel = supabase
      .channel('status_notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, fetchLastSync)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  function formatSync(ts) {
    if (!ts) return 'Never synced';
    const d = new Date(ts);
    return `Last sync: ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  return (
    <div className="status-bar">
      <span className="status-dot" />
      <span>{formatSync(lastSync)}</span>
    </div>
  );
}
