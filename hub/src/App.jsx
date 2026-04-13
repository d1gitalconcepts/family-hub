import { useState, useEffect, useCallback, useRef } from 'react';
import LoginScreen from './components/LoginScreen';
import WeekView from './components/WeekView';
import ShoppingList from './components/ShoppingList';
import AdminSettings from './components/AdminSettings';
import { getSession, getRole, saveRole, logout } from './auth';
import { supabase } from './supabaseClient';
import './styles/index.css';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

export default function App() {
  const [role, setRole]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileList, setShowMobileList] = useState(false);
  const [viewKey, setViewKey]         = useState(0);
  const [theme, setTheme]             = useState(() => localStorage.getItem('fh_theme') || 'auto');
  const isMobile                      = useIsMobile();
  const [lastSync, setLastSync]       = useState(null);
  const [syncing, setSyncing]         = useState(false);
  const [lastScrape, setLastScrape]   = useState(null);
  const manualSyncPending             = useRef(false);

  useEffect(() => {
    async function checkSession() {
      const session = await getSession();
      if (session) setRole(getRole() || 'family');
      setLoading(false);
    }
    checkSession();
  }, []);

  // Load + live-update last sync timestamp written by the extension
  useEffect(() => {
    async function fetchLastSync() {
      const { data } = await supabase.from('config').select('value').eq('key', 'last_calendar_sync').maybeSingle();
      if (data?.value) setLastSync(new Date(data.value));
    }
    fetchLastSync();

    const ch = supabase.channel(`last_sync_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config', filter: 'key=eq.last_calendar_sync' }, (payload) => {
        if (payload.new?.value) {
          setLastSync(new Date(payload.new.value));
          setSyncing(false);
          if (manualSyncPending.current) {
            manualSyncPending.current = false;
            setViewKey((k) => k + 1);
          }
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // Monitor Keep scraper freshness (admin only)
  useEffect(() => {
    if (role !== 'admin') return;
    async function fetchLastScrape() {
      const { data } = await supabase.from('notes').select('scraped_at').eq('key', 'shopping-list').maybeSingle();
      if (data?.scraped_at) setLastScrape(new Date(data.scraped_at));
    }
    fetchLastScrape();
    const ch = supabase.channel(`scrape_monitor_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: 'key=eq.shopping-list' }, (payload) => {
        if (payload.new?.scraped_at) setLastScrape(new Date(payload.new.scraped_at));
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [role]);

  const scrapeIsStale = role === 'admin' && lastScrape && (Date.now() - lastScrape.getTime()) > 15 * 60 * 1000;

  const requestSync = useCallback(async () => {
    setSyncing(true);
    manualSyncPending.current = true;
    try {
      await fetch(`${import.meta.env.VITE_WORKER_URL}/sync`, { method: 'POST' });
    } catch (err) {
      console.warn('[Sync] Worker request failed:', err.message);
      setSyncing(false);
      manualSyncPending.current = false;
    }
    // Safety fallback — clear spinner and flag if realtime doesn't respond in 30s
    setTimeout(() => {
      setSyncing(false);
      manualSyncPending.current = false;
    }, 30000);
  }, []);

  useEffect(() => {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('fh_theme', theme);
  }, [theme]);

  // Close mobile list when switching to desktop
  useEffect(() => {
    if (!isMobile) setShowMobileList(false);
  }, [isMobile]);

  function cycleTheme() {
    setTheme((t) => t === 'auto' ? 'dark' : t === 'dark' ? 'light' : 'auto');
  }

  function themeIcon() {
    return theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🌓';
  }

  async function handleLogout() {
    await logout();
    setRole(null);
  }

  if (loading) return null;
  if (!role) return <LoginScreen onLogin={(r) => { saveRole(r); setRole(r); }} />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Family Hub</h1>
        <button
          className={`btn-sync${syncing ? ' syncing' : ''}`}
          onClick={requestSync}
          disabled={syncing}
          title={lastSync ? `Last synced ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Sync now'}
        >
          <span className="sync-icon">↻</span>
          {lastSync && !syncing && (
            <span className="sync-label">{lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          )}
          {syncing && <span className="sync-label">Syncing…</span>}
        </button>
        <button className="btn-icon" onClick={cycleTheme} title="Toggle theme">{themeIcon()}</button>
        {role === 'admin' && (
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
        )}
        <button className="btn" onClick={handleLogout} style={{ fontSize: 12, padding: '4px 8px' }}>
          Sign out
        </button>
      </header>

      {scrapeIsStale && (
        <div className="scrape-alert">
          ⚠ Keep sync is overdue — last scraped {lastScrape.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Check the scraper on the Linux server (<code>cat ~/family-hub/scraper/scraper.log</code>).
        </div>
      )}

      <div className="app-body">
        <WeekView key={viewKey} />
        {!isMobile && <ShoppingList />}
      </div>

      {/* Mobile: floating list button */}
      {isMobile && (
        <button
          className="mobile-list-fab"
          onClick={() => setShowMobileList(true)}
          title="Shopping list"
        >
          🛒
        </button>
      )}

      {/* Mobile: bottom drawer */}
      {isMobile && showMobileList && (
        <div className="mobile-drawer-overlay" onClick={() => setShowMobileList(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-handle" onClick={() => setShowMobileList(false)} />
            <ShoppingList />
          </div>
        </div>
      )}

      {showSettings && (
        <AdminSettings onClose={() => { setShowSettings(false); setViewKey((k) => k + 1); }} />
      )}
    </div>
  );
}
