import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import LoginScreen from './components/LoginScreen';
import WeekView from './components/WeekView';
import ShoppingList from './components/ShoppingList';
import AdminSettings from './components/AdminSettings';
import WeatherWidget from './components/WeatherWidget';
import { getSession, getRole, saveRole, logout } from './auth';
import { supabase } from './supabaseClient';
import { useConfig } from './hooks/useConfig';
import { APP_VERSION, CHANGELOG } from './version';
import './styles/index.css';

function makeMonogramDataUrl(text, bg = '#1a73e8') {
  const letters = ((text || 'H').slice(0, 4)).toUpperCase();
  const fontSize = letters.length <= 1 ? 18 : letters.length === 2 ? 14 : letters.length === 3 ? 11 : 9;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="8" fill="${bg}"/><text x="16" y="22" text-anchor="middle" dominant-baseline="auto" font-family="system-ui,sans-serif" font-weight="700" font-size="${fontSize}" fill="white">${letters}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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
  const [fontSizeCfg]    = useConfig('font_size');
  const [faviconCfg]     = useConfig('favicon');
  const [headerIconCfg]  = useConfig('header_icon');
  const [monogramText]   = useConfig('monogram_text');
  const [customIcon]     = useConfig('custom_icon');
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
  const [showChangelog, setShowChangelog] = useState(false);

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
    let src;
    if (faviconCfg === 'mono') {
      const bg = (accentColorCfg?.enabled && accentColorCfg?.color) ? accentColorCfg.color : '#1a73e8';
      src = makeMonogramDataUrl(monogramText, bg);
    } else if (faviconCfg === 'custom' && customIcon) {
      src = customIcon;
    } else {
      const FAVICON_SRCS = {
        house:    '/favicon-house.svg',
        calendar: '/favicon-calendar.svg',
        hub:      '/favicon-hub.svg',
        bolt:     '/favicon.svg',
      };
      src = FAVICON_SRCS[faviconCfg] || FAVICON_SRCS.house;
    }
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = faviconCfg === 'custom' ? 'image/png' : 'image/svg+xml';
    link.href = src;
  }, [faviconCfg, monogramText, customIcon, accentColorCfg]);

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
      compact:  { app: '12px', card: '11px', meta: '10px' },
      default:  { app: '14px', card: '13px', meta: '11px' },
      large:    { app: '17px', card: '15px', meta: '13px' },
      xl:       { app: '20px', card: '18px', meta: '15px' },
    };
    const s = SIZES[fontSizeCfg || 'default'];
    document.documentElement.style.setProperty('--app-font-size',  s.app);
    document.documentElement.style.setProperty('--card-font',      s.card);
    document.documentElement.style.setProperty('--card-meta-font', s.meta);
  }, [fontSizeCfg]);


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
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {(() => {
            const hIcon = headerIconCfg ?? faviconCfg ?? 'house';
            const accentBg = (accentColorCfg?.enabled && accentColorCfg?.color) ? accentColorCfg.color : '#1a73e8';
            if (hIcon === 'mono') {
              const letters = ((monogramText || 'H').slice(0, 4)).toUpperCase();
              const n = letters.length;
              const fs = n <= 1 ? 22 : n === 2 ? 18 : n === 3 ? 15 : 13;
              const w  = n <= 1 ? 36 : n === 2 ? 44 : n === 3 ? 50 : 56;
              return (
                <div style={{
                  width: w, height: 36, borderRadius: 8, background: accentBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: fs, fontWeight: 800, color: 'white',
                  flexShrink: 0, letterSpacing: n >= 3 ? '-0.5px' : '0',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  userSelect: 'none', lineHeight: 1,
                }}>
                  {letters}
                </div>
              );
            }
            let src;
            if (hIcon === 'custom' && customIcon) src = customIcon;
            else if (hIcon === 'bolt') src = '/favicon.svg';
            else src = `/favicon-${hIcon}.svg`;
            return <img src={src} width="22" height="22" alt="" style={{ display: 'block', flexShrink: 0 }} />;
          })()}
          {appName || 'Family Hub'}
        </h1>
        <WeatherWidget position="in-header" />
        {/* Desktop: persistent sync chip + gear icon */}
        {!isMobile && (
          <div className="header-desktop-actions">
            <button
              className={`header-sync-chip${syncing ? ' header-sync-chip--syncing' : ''}`}
              onClick={requestSync}
              disabled={syncing}
              title="Sync calendar"
            >
              <span className={`sync-icon${syncing ? ' syncing' : ''}`}>↻</span>
              <span className="header-sync-label">
                {syncing ? 'Syncing…' : lastSync
                  ? `Synced ${lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : 'Sync now'}
              </span>
            </button>
          </div>
        )}

        {/* Hamburger — always on mobile, print/logout on desktop */}
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
              {/* Mobile-only: sync in menu */}
              {isMobile && (
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
              )}
              {/* Settings — always in hamburger (mobile and desktop) */}
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
              {/* Version number at bottom of menu */}
              <div className="header-menu-version">
                {role === 'admin' ? (
                  <button
                    className="header-menu-version-btn"
                    onClick={() => { setShowChangelog(true); setShowMenu(false); }}
                  >
                    v{APP_VERSION}
                  </button>
                ) : (
                  <span>v{APP_VERSION}</span>
                )}
              </div>
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

      {showChangelog && (
        <div className="changelog-overlay" onClick={() => setShowChangelog(false)}>
          <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
            <div className="changelog-modal-header">
              <h2>What's new</h2>
              <button className="btn-icon" onClick={() => setShowChangelog(false)}>✕</button>
            </div>
            <div className="changelog-modal-body">
              {CHANGELOG.map((entry) => (
                <div key={entry.version} className="changelog-version">
                  <div className="changelog-version-heading">
                    <span className="changelog-version-number">v{entry.version}</span>
                    <span className="changelog-version-date">{entry.date}</span>
                  </div>
                  <ul>
                    {entry.notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
