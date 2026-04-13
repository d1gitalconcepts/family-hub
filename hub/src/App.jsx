import { useState, useEffect, useCallback, useRef } from 'react';
import LoginScreen from './components/LoginScreen';
import WeekView from './components/WeekView';
import ShoppingList from './components/ShoppingList';
import AdminSettings from './components/AdminSettings';
import WeatherWidget from './components/WeatherWidget';
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
  const [showMenu, setShowMenu]       = useState(false);
  const [viewKey, setViewKey]         = useState(0);
  const [theme, setTheme]             = useState(() => localStorage.getItem('fh_theme') || 'auto');
  const isMobile                      = useIsMobile();
  const [lastSync, setLastSync]       = useState(null);
  const [syncing, setSyncing]         = useState(false);
  const [lastScrape, setLastScrape]   = useState(null);
  const manualSyncPending             = useRef(false);
  const menuRef                       = useRef(null);

  useEffect(() => {
    async function checkSession() {
      const session = await getSession();
      if (session) setRole(getRole() || 'family');
      setLoading(false);
    }
    checkSession();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

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
    setShowMenu(false);
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
        <WeatherWidget position="in-header" />
        <div className="header-actions" ref={menuRef}>
          <button
            className="btn-icon header-menu-trigger"
            onClick={() => setShowMenu((s) => !s)}
            title="Menu"
          >
            ☰
          </button>
          {showMenu && (
            <div className="header-menu">
              <button
                className={`header-menu-item${syncing ? ' header-menu-item--syncing' : ''}`}
                onClick={requestSync}
                disabled={syncing}
              >
                <span className={`sync-icon${syncing ? ' syncing' : ''}`}>↻</span>
                <span>
                  <span className="header-menu-item-label">{syncing ? 'Syncing…' : 'Sync now'}</span>
                  {lastSync && !syncing && (
                    <span className="header-menu-item-sub">
                      Last synced {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </span>
              </button>
              {role === 'admin' && (
                <button
                  className="header-menu-item"
                  onClick={() => { setShowSettings(true); setShowMenu(false); }}
                >
                  <span>⚙</span>
                  <span className="header-menu-item-label">Settings</span>
                </button>
              )}
              <button className="header-menu-item header-menu-item--danger" onClick={handleLogout}>
                <span>⎋</span>
                <span className="header-menu-item-label">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <WeatherWidget position="below-header" />

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
        <AdminSettings
          onClose={() => { setShowSettings(false); setViewKey((k) => k + 1); }}
          theme={theme}
          onThemeChange={setTheme}
        />
      )}
    </div>
  );
}
