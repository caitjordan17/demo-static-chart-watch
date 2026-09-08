import { resetDemo } from './lib/demoStore';
import { flushSync } from 'react-dom';
import BrandIcon from './components/BrandIcon';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import ChartsPage from './components/ChartsPage';
import CoderWorkspace from './components/CoderWorkspace';
import AdminDashboard from './components/AdminDashboard';
import './App.css';

function AppInner() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('charts');
  const [selectedChart, setSelectedChart] = useState(null);

  useEffect(() => { setTab('charts'); setSelectedChart(null); }, [user?.id]);

  if (!user) return <LoginPage onLogin={() => { }} />;

  const tabs = [
    { id: 'charts', label: 'Charts' },
    { id: 'code', label: 'Coding Workspace' },
    ...(user.role === 'admin' ? [{ id: 'analytics', label: 'Analytics' }] : [])
  ];

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">
          <BrandIcon />
          <span>ChartWatch</span>
        </div>

        <div className="nav-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`nav-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="nav-user">
          {selectedChart && (
            <div className="nav-chart-pill">
              <span>📄</span>
              <span className="chart-pill-name">{selectedChart.original_name.replace('.pdf', '')}</span>
            </div>
          )}
          <div className="user-info">
            <div className="user-avatar">{user.username[0].toUpperCase()}</div>
            <div className="user-meta">
              <span className="user-name">{user.username}</span>
              <span className={`user-role ${user.role}`}>{user.role}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={() => {
            // Stop the workspace timer before clearing its last saved interval.
            flushSync(() => logout());
            resetDemo();
          }}>Reset demo</button>
          <button onClick={logout} className="logout-btn">Sign out</button>
        </div>
      </nav>

      <div className="demo-notice">Static demo · Changes stay in this browser · Pace signals help prioritize review; they do not establish coding accuracy.</div>
      <main className="main-content">
        {tab === 'charts' && (
          <ChartsPage
            selectedChart={selectedChart}
            onSelectChart={(c) => { setSelectedChart(c); setTab('code'); }}
          />
        )}
        {tab === 'code' && <CoderWorkspace key={`${user.id}-${selectedChart?.id}`} chart={selectedChart} />}
        {tab === 'analytics' && user.role === 'admin' && <AdminDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
