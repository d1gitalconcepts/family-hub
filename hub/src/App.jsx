import { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import WeekView from './components/WeekView';
import ShoppingList from './components/ShoppingList';
import AdminSettings from './components/AdminSettings';
import { getSession, getRole, saveRole, logout } from './auth';
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

  useEffect(() => {
    async function checkSession() {
      const session = await getSession();
      if (session) setRole(getRole() || 'family');
      setLoading(false);
    }
    checkSession();
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
        <button className="btn-icon" onClick={cycleTheme} title="Toggle theme">{themeIcon()}</button>
        {role === 'admin' && (
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
        )}
        <button className="btn" onClick={handleLogout} style={{ fontSize: 12, padding: '4px 8px' }}>
          Sign out
        </button>
      </header>

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
