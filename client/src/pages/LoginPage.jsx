import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage({ onLogin }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      onLogin(user);
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role) => {
    if (role === 'admin') { setUsername('admin'); setPassword('Admin123!'); }
    else { setUsername('jsmith'); setPassword('Coder123!'); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-icon">
            <svg viewBox="0 0 40 40" fill="none">
              <rect x="4" y="4" width="32" height="36" rx="3" fill="#1a1a2e" stroke="#4f8ef7" strokeWidth="2"/>
              <rect x="9" y="12" width="22" height="2" rx="1" fill="#4f8ef7" opacity="0.6"/>
              <rect x="9" y="17" width="22" height="2" rx="1" fill="#4f8ef7" opacity="0.6"/>
              <rect x="9" y="22" width="14" height="2" rx="1" fill="#4f8ef7" opacity="0.6"/>
              <circle cx="30" cy="30" r="8" fill="#1a1a2e" stroke="#f7c04f" strokeWidth="2"/>
              <path d="M27 30l2 2 4-4" stroke="#f7c04f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1>ChartWatch</h1>
          <p>Medical Coding Intelligence Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="demo-logins">
          <p>Demo accounts</p>
          <div className="demo-buttons">
            <button onClick={() => fillDemo('admin')} className="demo-btn">
              <span className="role-badge admin">Admin</span>
              admin / Admin123!
            </button>
            <button onClick={() => fillDemo('coder')} className="demo-btn">
              <span className="role-badge coder">Coder</span>
              jsmith / Coder123!
            </button>
          </div>
        </div>
      </div>

      <div className="login-bg">
        <div className="bg-stat">
          <span className="stat-num">280</span>
          <span className="stat-label">pages tracked</span>
        </div>
        <div className="bg-stat">
          <span className="stat-num">↓38%</span>
          <span className="stat-label">speed drop detected</span>
        </div>
        <div className="bg-stat">
          <span className="stat-num">3</span>
          <span className="stat-label">active coders</span>
        </div>
      </div>
    </div>
  );
}
