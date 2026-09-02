import { useState } from 'react';
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
          <svg viewBox="0 0 32 32" fill="none" width="28">
            <rect x="3" y="3" width="26" height="29" rx="2.5" fill="#0d0f1e" stroke="#4f8ef7" strokeWidth="1.5" />
            <rect x="7" y="10" width="18" height="1.5" rx="0.75" fill="#4f8ef7" opacity="0.6" />
            <rect x="7" y="14" width="18" height="1.5" rx="0.75" fill="#4f8ef7" opacity="0.6" />
            <rect x="7" y="18" width="11" height="1.5" rx="0.75" fill="#4f8ef7" opacity="0.6" />
            <circle cx="24" cy="24" r="6" fill="#0d0f1e" stroke="#f7c04f" strokeWidth="1.5" />
            <path d="M21.5 24l2 2 3.5-3.5" stroke="#f7c04f" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
          <button onClick={logout} className="logout-btn">Sign out</button>
        </div>
      </nav>

      <main className="main-content">
        {tab === 'charts' && (
          <ChartsPage
            selectedChart={selectedChart}
            onSelectChart={(c) => { setSelectedChart(c); setTab('code'); }}
          />
        )}
        {tab === 'code' && <CoderWorkspace chart={selectedChart} />}
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
