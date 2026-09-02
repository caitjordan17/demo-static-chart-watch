import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function CoderWorkspace({ chart }) {
  const { token, API } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [codes, setCodes] = useState([]);
  const [form, setForm] = useState({ code: '', description: '', page_number: 1, provider: '', date_of_service: '', comment: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [signedPdfUrl, setSignedPdfUrl] = useState(null);
  const pageEnteredAt = useRef(Date.now());
  const lastPage = useRef(1);

  // Fetch a fresh signed URL for the PDF (tokens expire in 60s)
  useEffect(() => {
    if (!chart) return;
    const fetchSignedUrl = async () => {
      try {
        const res = await fetch(`${API}/charts/${chart.id}/sign`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const { url } = await res.json();
        setSignedPdfUrl(url);
      } catch (e) { console.error('Failed to get signed URL', e); }
    };
    fetchSignedUrl();
    // Refresh every 50s so the URL never expires while the user is on the page
    const interval = setInterval(fetchSignedUrl, 50000);
    return () => clearInterval(interval);
  }, [chart, token, API]);

  // Load existing codes
  useEffect(() => {
    if (!chart) return;
    fetch(`${API}/codes/${chart.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setCodes).catch(console.error);
  }, [chart, token, API]);

  // Track page timing
  const recordPageTime = useCallback(async (page, timeMs) => {
    if (timeMs < 500) return; // ignore flickers
    try {
      await fetch(`${API}/events/page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chart_id: chart.id,
          page_number: page,
          time_spent_seconds: timeMs / 1000
        })
      });
    } catch (e) { console.error('Timing event failed', e); }
  }, [API, token, chart]);

  const goToPage = (newPage) => {
    const elapsed = Date.now() - pageEnteredAt.current;
    recordPageTime(lastPage.current, elapsed);
    lastPage.current = newPage;
    pageEnteredAt.current = Date.now();
    setCurrentPage(newPage);
    setForm(f => ({ ...f, page_number: newPage }));
  };

  // Record time when component unmounts
  useEffect(() => {
    return () => {
      const elapsed = Date.now() - pageEnteredAt.current;
      recordPageTime(lastPage.current, elapsed);
    };
  }, [recordPageTime]);

  const handleSubmit = async () => {
    if (!form.code.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, chart_id: chart.id })
      });
      const newCode = await res.json();
      setCodes(prev => [newCode, ...prev]);
      setForm(f => ({ code: '', description: '', page_number: currentPage, provider: '', date_of_service: '', comment: '' }));
      setSaveMsg('Code saved!');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Error saving.'); }
    setSaving(false);
  };

  const deleteCode = async (id) => {
    await fetch(`${API}/codes/entry/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  const totalPages = chart?.total_pages || 1;
  return (
    <div className="workspace">
      {/* LEFT: PDF Viewer */}
      <div className="pdf-panel">
        <div className="pdf-toolbar">
          <span className="chart-name">{chart?.original_name}</span>
          <div className="page-controls">
            <button onClick={() => goToPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="pg-btn">‹</button>
            <span className="page-indicator">
              <input
                type="number"
                min={1} max={totalPages}
                value={currentPage}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (v >= 1 && v <= totalPages) goToPage(v);
                }}
                className="page-input"
              />
              <span> / {totalPages}</span>
            </span>
            <button onClick={() => goToPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="pg-btn">›</button>
          </div>
          <div className="timing-indicator">
            <span className="timing-dot"></span>
            Tracking time on page
          </div>
        </div>

        <div className="pdf-embed-wrapper">
          {signedPdfUrl ? (
            <iframe
              key={signedPdfUrl}
              src={`${signedPdfUrl}#page=${currentPage}`}
              title="Medical Chart"
              className="pdf-iframe"
            />
          ) : (
            <div className="pdf-placeholder">
              <svg viewBox="0 0 80 100" fill="none" className="pdf-icon">
                <rect x="5" y="5" width="70" height="90" rx="4" fill="#1e2235" stroke="#4f8ef7" strokeWidth="2"/>
                <rect x="15" y="20" width="50" height="4" rx="2" fill="#4f8ef7" opacity="0.4"/>
                <rect x="15" y="30" width="50" height="4" rx="2" fill="#4f8ef7" opacity="0.4"/>
                <rect x="15" y="40" width="35" height="4" rx="2" fill="#4f8ef7" opacity="0.4"/>
                <rect x="15" y="55" width="50" height="4" rx="2" fill="#4f8ef7" opacity="0.2"/>
                <rect x="15" y="65" width="50" height="4" rx="2" fill="#4f8ef7" opacity="0.2"/>
                <rect x="15" y="75" width="30" height="4" rx="2" fill="#4f8ef7" opacity="0.2"/>
              </svg>
              <p>No chart selected</p>
              <small>Select a chart from the Charts tab to begin coding</small>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: ICD-10 Panel */}
      <div className="coding-panel">
        <div className="coding-panel-header">
          <h2>ICD-10 Coding</h2>
          <span className="code-count">{codes.length} codes entered</span>
        </div>

        <div className="code-form">
          <div className="form-row two-col">
            <div className="field">
              <label>ICD-10 Code <span className="req">*</span></label>
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. E11.9"
                className="code-input"
              />
            </div>
            <div className="field">
              <label>Page</label>
              <input
                type="number"
                value={form.page_number}
                onChange={e => setForm(f => ({ ...f, page_number: parseInt(e.target.value) || currentPage }))}
                min={1} max={totalPages}
              />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Type 2 diabetes mellitus without complications"
            />
          </div>
          <div className="form-row two-col">
            <div className="field">
              <label>Provider</label>
              <input
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                placeholder="Dr. Smith"
              />
            </div>
            <div className="field">
              <label>Date of Service</label>
              <input
                type="date"
                value={form.date_of_service}
                onChange={e => setForm(f => ({ ...f, date_of_service: e.target.value }))}
              />
            </div>
          </div>
          <div className="field">
            <label>Comment</label>
            <textarea
              value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              placeholder="Additional notes…"
              rows={3}
            />
          </div>
          <button onClick={handleSubmit} disabled={saving || !form.code} className="btn-primary save-btn">
            {saving ? 'Saving…' : '+ Add Code'}
          </button>
          {saveMsg && <span className="save-msg">{saveMsg}</span>}
        </div>

        <div className="codes-list">
          <h3>Entered Codes</h3>
          {codes.length === 0 && (
            <div className="empty-codes">No codes entered yet for this chart</div>
          )}
          {codes.map(c => (
            <div key={c.id} className="code-entry">
              <div className="code-entry-top">
                <span className="code-badge">{c.code}</span>
                <span className="code-page">pg. {c.page_number}</span>
                <button onClick={() => deleteCode(c.id)} className="delete-btn" title="Remove">×</button>
              </div>
              <div className="code-desc">{c.description}</div>
              <div className="code-meta">
                {c.provider && <span>👤 {c.provider}</span>}
                {c.date_of_service && <span>📅 {c.date_of_service}</span>}
              </div>
              {c.comment && <div className="code-comment">"{c.comment}"</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
