import { useEffect, useState } from 'react';
import { users, assignChart } from '../lib/demoStore';

export default function AssignmentForm({ charts }) {
  const [coders, setCoders] = useState([]);
  const [chartId, setChartId] = useState('');
  const [coderId, setCoderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setError('');
    setCoders(users.filter(u => u.role === 'coder' && u.is_active));
    setLoading(false);
  }, [attempt]);

  const assign = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      assignChart(Number(chartId), Number(coderId));
      setMessage('Chart assigned. The coder can now open it from their Charts tab.');
    } catch (err) { setMessage(`Assignment not saved: ${err.message}`); }
    finally { setBusy(false); }
  };

  return (
    <form className="assignment-form" onSubmit={assign}>
      <h3>Assign a chart</h3>
      <p>Give an active coder access to a chart to start their review.</p>
      {loading && <p role="status">Loading coders…</p>}
      {error && <div role="alert">{error} <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button></div>}
      <div className="assignment-fields">
        <div className="field"><label htmlFor="assign-chart">Chart</label>
          <select id="assign-chart" required value={chartId} onChange={e => setChartId(e.target.value)}>
            <option value="">Select a chart</option>
            {charts.map(c => <option key={c.id} value={c.id}>{c.original_name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="assign-coder">Coder</label>
          <select id="assign-coder" required value={coderId} onChange={e => setCoderId(e.target.value)}>
            <option value="">Select a coder</option>
            {coders.map(c => <option key={c.id} value={c.id}>{c.username}</option>)}
          </select>
        </div>
        <button className="btn-primary" disabled={busy || loading || !!error || !chartId || !coderId}>{busy ? 'Assigning…' : 'Assign chart'}</button>
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
