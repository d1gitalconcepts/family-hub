import { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import WeekView from './components/WeekView';
import ShoppingList from './components/ShoppingList';
import AdminSettings from './components/AdminSettings';
import { getSession, getRole, saveRole, logout } from './auth';
import './styles/index.css';

export default function App() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('fh_theme') || 'auto');

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
        <ShoppingList />
      </div>

      {showSettings && (
        <AdminSettings onClose={() => { setShowSettings(false); setViewKey((k) => k + 1); }} />
      )}
    </div>
  );
}
