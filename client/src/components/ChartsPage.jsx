import AssignmentForm from './AssignmentForm';
import { getCharts, importPdf } from '../lib/demoStore';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ChartsPage({ onSelectChart, selectedChart }) {
  const { user } = useAuth();
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    try { setCharts(getCharts(user)); }
    catch (err) { setError(err.message); }
    setLoading(false);
  }, [user, attempt]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || uploading) return;
    setUploading(true);
    setUploadMsg('Importing…');
    try {
      const chart = await importPdf(file);
      setCharts(prev => [chart, ...prev]);
      setUploadMsg(`✓ Imported until reload: ${chart.original_name} (${chart.total_pages} pages)`);
    } catch (err) {
      setUploadMsg(`Import failed: ${err.message}`);
    }
    setUploading(false);

  };

  return (
    <div className="charts-page">
      <div className="charts-header">
        <div>
          <h2>Patient Charts</h2>
          <p>{user.role === 'admin' ? 'Preview charts or import a synthetic PDF (up to 50 MB). Imports stay in this tab until reload; nothing is uploaded. Assign a chart below.' : 'Select an assigned chart to begin coding.'}</p>
        </div>
        {(user?.role === 'admin') && (
          <label className="btn-primary upload-btn">
            {uploading ? 'Importing…' : '+ Import PDF'}
            <input type="file" aria-label="Import PDF" disabled={uploading} accept=".pdf" onChange={handleUpload} className="visually-hidden" />
          </label>
        )}
      </div>

      {uploadMsg && <div className="upload-msg" role="status">{uploadMsg}</div>}

      {loading && <p role="status">Loading charts…</p>}
      {error && <div className="login-error" role="alert">{error} <button onClick={() => setAttempt(n => n + 1)}>Retry</button></div>}
      {user.role === 'admin' && !loading && !error && <AssignmentForm charts={charts} />}
      <div className="charts-grid">
        {charts.map(chart => (
          <div
            role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectChart(chart); } }}
            key={chart.id}
            className={`chart-card ${selectedChart?.id === chart.id ? 'selected' : ''}`}
            onClick={() => onSelectChart(chart)}
          >
            <div className="chart-card-icon">
              <svg viewBox="0 0 40 50" fill="none" width="36">
                <rect x="3" y="3" width="34" height="44" rx="3" fill="var(--surface)" stroke="var(--red)" strokeWidth="1.5"/>
                <path d="M26 3v10h10" fill="none" stroke="var(--red)" strokeWidth="1.5"/>
                <rect x="9" y="18" width="22" height="2" rx="1" fill="var(--red)" opacity="0.5"/>
                <rect x="9" y="24" width="22" height="2" rx="1" fill="var(--red)" opacity="0.5"/>
                <rect x="9" y="30" width="14" height="2" rx="1" fill="var(--red)" opacity="0.3"/>
              </svg>
            </div>
            <div className="chart-card-info">
              <div className="chart-card-name">{chart.original_name}</div>
              <div className="chart-card-meta">
                <span className={`pages-badge ${chart.total_pages > 200 ? 'large' : chart.total_pages > 100 ? 'medium' : ''}`}>
                  {chart.total_pages} pages
                </span>
                <span>Uploaded by {chart.uploaded_by}</span>
              </div>
              <div className="chart-card-date">{new Date(chart.uploaded_at).toLocaleDateString()}</div>
            </div>
            {selectedChart?.id === chart.id && <div className="selected-indicator">✓ Selected</div>}
          </div>
        ))}
        {!loading && !error && charts.length === 0 && (
          <div className="empty-charts">
            <p>{user.role === 'admin' ? 'No charts uploaded yet.' : 'No charts assigned yet. Ask your administrator to assign a chart.'}</p>
            {user?.role === 'admin' && <p>Use the Import button to add a patient chart PDF.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
