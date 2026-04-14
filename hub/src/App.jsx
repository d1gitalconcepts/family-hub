import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import LoginScreen from './components/LoginScreen';
import WeekView from './components/WeekView';
import ShoppingList from './components/ShoppingList';
import AdminSettings from './components/AdminSettings';
import WeatherWidget from './components/WeatherWidget';
import { getSession, getRole, saveRole, logout } from './auth';
import { supabase } from './supabaseClient';
import { useConfig } from './hooks/useConfig';
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
  const [appName]                      = useConfig('app_name');
  const [accentColorCfg] = useConfig('accent_color');
  const [headerStyleCfg] = useConfig('header_style');
  const [fontSizeCfg]    = useConfig('font_size');
  const [faviconCfg]     = useConfig('favicon');
  const [role, setRole]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileList, setShowMobileList] = useState(false);
  const [showMenu, setShowMenu]       = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(() => localStorage.getItem('fh_sidebar_pinned') !== 'false');
  const [sidebarOpen,   setSidebarOpen]   = useState(() => localStorage.getItem('fh_sidebar_pinned') !== 'false');
  const sidebarRef = useRef(null);
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

  // Close unpinned sidebar on outside click
  useEffect(() => {
    if (!sidebarOpen || sidebarPinned) return;
    function handleClick(e) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) setSidebarOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sidebarOpen, sidebarPinned]);

  function handleSidebarToggle() {
    setSidebarOpen((o) => !o);
  }

  function handleSidebarPin() {
    const next = !sidebarPinned;
    setSidebarPinned(next);
    localStorage.setItem('fh_sidebar_pinned', next);
    if (next) setSidebarOpen(true);
  }

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
    const FAVICON_SRCS = {
      house:    '/favicon-house.svg',
      calendar: '/favicon-calendar.svg',
      hub:      '/favicon-hub.svg',
      mono:     '/favicon-mono.svg',
      bolt:     '/favicon.svg',
    };
    const src = FAVICON_SRCS[faviconCfg] || FAVICON_SRCS.house;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      document.head.appendChild(link);
    }
    link.href = src;
  }, [faviconCfg]);

  useEffect(() => {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('fh_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (accentColorCfg?.enabled && accentColorCfg?.color) {
      document.documentElement.style.setProperty('--accent', accentColorCfg.color);
    } else {
      document.documentElement.style.removeProperty('--accent');
    }
  }, [accentColorCfg]);

  useEffect(() => {
    const SIZES = {
      compact:  { app: '13px', card: '11px', meta: '10px' },
      default:  { app: '14px', card: '13px', meta: '11px' },
      large:    { app: '15px', card: '14px', meta: '12px' },
      xl:       { app: '16px', card: '15px', meta: '13px' },
    };
    const s = SIZES[fontSizeCfg || 'default'];
    document.documentElement.style.setProperty('--app-font-size',  s.app);
    document.documentElement.style.setProperty('--card-font',      s.card);
    document.documentElement.style.setProperty('--card-meta-font', s.meta);
  }, [fontSizeCfg]);

  const headerBg = useMemo(() => {
    if (!headerStyleCfg?.enabled) return {};
    const PRESETS = {
      sunrise:  'linear-gradient(135deg,#ffecd2,#fcb69f)',
      ocean:    'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
      forest:   'linear-gradient(135deg,#d4fc79,#96e6a1)',
      twilight: 'linear-gradient(135deg,#a18cd1,#fbc2eb)',
      slate:    'linear-gradient(135deg,#e0eafc,#cfdef3)',
      custom:   `linear-gradient(135deg,${headerStyleCfg.color1 || '#a1c4fd'},${headerStyleCfg.color2 || '#c2e9fb'})`,
    };
    const bg = PRESETS[headerStyleCfg.preset || 'sunrise'];
    return bg ? { background: bg } : {};
  }, [headerStyleCfg]);

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
      <header className="app-header" style={headerBg}>
        <h1>{appName || 'Family Hub'}</h1>
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
              <button className="header-menu-item" onClick={() => { setShowMenu(false); window.print(); }}>
                <span>🖨</span>
                <span className="header-menu-item-label">Print calendar</span>
              </button>
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
        {!isMobile && (
          <div
            ref={sidebarRef}
            className={`sidebar-wrap${sidebarOpen ? ' sidebar-wrap--open' : ''}`}
          >
            <div className="sidebar-rail">
              <button
                className="sidebar-rail-btn"
                onClick={handleSidebarToggle}
                title={sidebarOpen ? 'Hide list' : 'Show list'}
              >
                <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {sidebarOpen
                    ? <polyline points="2,1 9,8 2,15" />
                    : <polyline points="8,1 1,8 8,15" />
                  }
                </svg>
                {!sidebarOpen && <span className="sidebar-rail-label">List</span>}
              </button>
            </div>
            <ShoppingList pinned={sidebarPinned} onTogglePin={handleSidebarPin} />
          </div>
        )}
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
          onClose={() => window.location.reload()}
          theme={theme}
          onThemeChange={setTheme}
        />
      )}
    </div>
  );
}
