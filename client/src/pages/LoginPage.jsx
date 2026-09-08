import BrandIcon from '../components/BrandIcon';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage({ onLogin }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const signIn = async (loginUsername, loginPassword) => {
    setError('');
    setLoading(true);
    try {
      const user = await login(loginUsername, loginPassword);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    signIn(username, password);
  };

  const loginDemo = (role) => {
    const demoUsername = role === 'admin' ? 'admin' : 'jsmith';
    const demoPassword = role === 'admin' ? 'Admin123!' : 'Coder123!';
    setUsername(demoUsername);
    setPassword(demoPassword);
    signIn(demoUsername, demoPassword);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-icon">
            <BrandIcon size={64} />
          </div>
          <h1>ChartWatch</h1>
          <p>Medical Coding Intelligence Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username" autoComplete="username" required
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password" autoComplete="current-password" required
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="demo-logins">
          <p>Demo accounts · no real sign-in required</p>
          <div className="demo-buttons">
            <button type="button" onClick={() => loginDemo('admin')} className="demo-btn" disabled={loading} aria-label="Sign in as demo Admin">
              <span className="role-badge admin">Admin</span>
              admin / Admin123!
            </button>
            <button type="button" onClick={() => loginDemo('coder')} className="demo-btn" disabled={loading} aria-label="Sign in as demo Coder">
              <span className="role-badge coder">Coder</span>
              jsmith / Coder123!
            </button>
          </div>
        </div>
      </div>

      <div className="login-bg">
        <div className="demo-story">
          <span className="role-badge admin">Synthetic data demo</span>
          <h2>Focus quality review where it may help most.</h2>
          <p>ChartWatch helps coding team leads investigate changes in review pace across long charts.</p>
          <ol>
            <li><strong>Explore as Admin:</strong> open Analytics and filter flagged coders.</li>
            <li><strong>Investigate:</strong> expand a coder and chart to inspect page-level pace changes.</li>
            <li><strong>Try as Coder:</strong> open an assigned chart and scroll to record review time.</li>
          </ol>
          <p>Timing is a signal for a conversation and targeted QA. This demo does not measure coding accuracy or prove fatigue.</p>
        </div>
      </div>
    </div>
  );
}
