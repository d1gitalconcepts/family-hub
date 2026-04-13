import { useState } from 'react';
import { loginWithPassword, saveRole } from '../auth';

export default function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await loginWithPassword(password);
    setLoading(false);
    if (result) {
      saveRole(result.role);
      onLogin(result.role);
    } else {
      setError('Incorrect password.');
      setPassword('');
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h2>Family Hub</h2>
        <p>Enter your password to continue.</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <span className="login-error">{error}</span>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
