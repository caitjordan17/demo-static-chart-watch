import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ChartsPage({ onSelectChart, selectedChart }) {
  const { token, user, API } = useAuth();
  const [charts, setCharts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  useEffect(() => {
    fetch(`${API}/charts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setCharts).catch(console.error);
  }, [token, API]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg('Uploading…');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API}/charts/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (!res.ok) throw new Error();
      const chart = await res.json();
      setCharts(prev => [chart, ...prev]);
      setUploadMsg(`✓ Uploaded: ${chart.original_name} (${chart.total_pages} pages)`);
    } catch {
      setUploadMsg('Upload failed. Only PDF files are accepted.');
    }
    setUploading(false);
    setTimeout(() => setUploadMsg(''), 4000);
  };

  return (
    <div className="charts-page">
      <div className="charts-header">
        <div>
          <h2>Patient Charts</h2>
          <p>Select a chart to begin coding, or upload a new PDF</p>
        </div>
        {(user?.role === 'admin') && (
          <label className="btn-primary upload-btn">
            {uploading ? 'Uploading…' : '+ Upload PDF'}
            <input type="file" accept=".pdf" onChange={handleUpload} style={{ display: 'none' }} />
          </label>
        )}
      </div>

      {uploadMsg && <div className="upload-msg">{uploadMsg}</div>}

      <div className="charts-grid">
        {charts.map(chart => (
          <div
            key={chart.id}
            className={`chart-card ${selectedChart?.id === chart.id ? 'selected' : ''}`}
            onClick={() => onSelectChart(chart)}
          >
            <div className="chart-card-icon">
              <svg viewBox="0 0 40 50" fill="none" width="36">
                <rect x="3" y="3" width="34" height="44" rx="3" fill="#1e2235" stroke="#4f8ef7" strokeWidth="1.5"/>
                <path d="M26 3v10h10" fill="none" stroke="#4f8ef7" strokeWidth="1.5"/>
                <rect x="9" y="18" width="22" height="2" rx="1" fill="#4f8ef7" opacity="0.5"/>
                <rect x="9" y="24" width="22" height="2" rx="1" fill="#4f8ef7" opacity="0.5"/>
                <rect x="9" y="30" width="14" height="2" rx="1" fill="#4f8ef7" opacity="0.3"/>
              </svg>
            </div>
            <div className="chart-card-info">
              <div className="chart-card-name">{chart.original_name}</div>
              <div className="chart-card-meta">
                <span className={`pages-badge ${chart.total_pages > 200 ? 'large' : chart.total_pages > 100 ? 'medium' : ''}`}>
                  {chart.total_pages} pages
                  {chart.total_pages > 200 && ' ⚠'}
                </span>
                <span>Uploaded by {chart.uploaded_by}</span>
              </div>
              <div className="chart-card-date">{new Date(chart.uploaded_at).toLocaleDateString()}</div>
            </div>
            {selectedChart?.id === chart.id && <div className="selected-indicator">✓ Selected</div>}
          </div>
        ))}
        {charts.length === 0 && (
          <div className="empty-charts">
            <p>No charts uploaded yet.</p>
            {user?.role === 'admin' && <p>Use the Upload button to add a patient chart PDF.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
