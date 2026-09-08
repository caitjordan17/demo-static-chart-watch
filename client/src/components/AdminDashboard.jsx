import { getCoderAnalytics, getAllCoders } from '../lib/demoAnalytics';
import { useState, useEffect } from 'react';

const STATUS_COLOR = {
  green: { bg: 'var(--green-soft)', border: 'var(--green)', text: 'var(--green-text)', dot: 'var(--green)' },
  yellow: { bg: 'var(--gold-soft)', border: 'var(--gold)', text: 'var(--gold-text)', dot: 'var(--gold)' },
  red: { bg: 'var(--red-soft)', border: 'var(--red)', text: 'var(--red-text)', dot: 'var(--red)' },
  qa_required: { bg: '#eee1eb', border: '#844878', text: '#733767', dot: '#844878' },
  no_data:     { bg: '#eee7df', border: '#76665e', text: '#594a42', dot: '#76665e' },
};

// Brighter chart fills with deeper companion colors for readable text on cream.
const TREND_COLOR = {
  green: { fill: 'var(--green)', text: 'var(--green-text)' },
  yellow: { fill: 'var(--gold)', text: 'var(--gold-text)' },
  red: { fill: 'var(--red)', text: 'var(--red-text)' },
  qa_required: { fill: '#bb7aeb', text: '#8844b4' },
  no_data:     { fill: '#b6aaa0', text: '#65564c' },
};

const STATUS_ICON = {
  green: '✓', yellow: '⚡', red: '⚠', qa_required: '🚨', no_data: '—',
};

function PpmBadge({ ppm, status }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.no_data;
  return (
    <span className="ppm-badge" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {STATUS_ICON[status]} {ppm > 0 ? `${ppm.toFixed(2)} ppm` : 'No data'}
    </span>
  );
}

function TrendMini({ trend }) {
  if (!trend || trend.length < 2) return <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>;
  const W = 120, H = 36, pad = 4;
  const maxP = Math.max(...trend.map(t => t.avg_ppm));
  const minP = Math.min(...trend.map(t => t.avg_ppm));
  const range = maxP - minP || 1;
  const pts = trend.map((t, i) => {
    const x = pad + (i / (trend.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (t.avg_ppm - minP) / range) * (H - pad * 2);
    return { x, y, ...t };
  });
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const lastStatus = pts[pts.length - 1]?.status || 'green';
  const lineColor = TREND_COLOR[lastStatus]?.fill || TREND_COLOR.no_data.fill;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      <line x1={pad} y1={H/2} x2={W-pad} y2={H/2} stroke="var(--border)" strokeWidth="1" strokeDasharray="2,2"/>
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5"
          fill={TREND_COLOR[p.status]?.fill || TREND_COLOR.no_data.fill} stroke="var(--surface)" strokeWidth="1"/>
      ))}
    </svg>
  );
}

function CoderRow({ coderData, onSelect, selected }) {
  const { coder, overall_avg_ppm, overall_status, overall_label, charts_assigned,
          charts_with_data, flagged_charts, qa_required } = coderData;
  const c = STATUS_COLOR[overall_status] || STATUS_COLOR.no_data;
  return (
    <div className={`coder-row ${selected ? 'selected' : ''} ${qa_required ? 'qa-flag' : ''}`}
         role="button" tabIndex={0} aria-expanded={selected}
         onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
         onClick={onSelect}>
      <div className="coder-row-avatar" style={{ background: c.bg, color: c.text, border: `1.5px solid ${c.border}` }}>
        {coder.username[0].toUpperCase()}
      </div>
      <div className="coder-row-name">
        <strong>{coder.username}</strong>
        <span>{charts_with_data}/{charts_assigned} charts reviewed</span>
      </div>
      <PpmBadge ppm={overall_avg_ppm} status={overall_status} />
      <div className="coder-row-flags">
        {flagged_charts > 0 && (
          <span className="flag-chip" style={{ background: STATUS_COLOR.red.bg, color: STATUS_COLOR.red.text }}>
            {flagged_charts} flagged
          </span>
        )}
        {qa_required && (
          <span className="flag-chip qa" style={{ background: STATUS_COLOR.qa_required.bg, color: STATUS_COLOR.qa_required.text }}>
            Priority review
          </span>
        )}
      </div>
      <span className="coder-row-arrow">{selected ? '▼' : '▶'}</span>
    </div>
  );
}

function CoderDetail({ coderId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [expandedChart, setExpandedChart] = useState(null);

  useEffect(() => {
    setLoading(true); setError('');
    try { setData(getCoderAnalytics(coderId)); }
    catch (err) { setError(err.message); }
    setLoading(false);
  }, [coderId, attempt]);

  if (loading) return <div className="detail-loading"><div className="spinner-sm"></div> Loading...</div>;
  if (error) return <div className="login-error" role="alert">{error} <button onClick={() => setAttempt(n => n + 1)}>Retry</button></div>;
  if (!data) return null;

  return (
    <div className="coder-detail">
      <div className="detail-summary-row">
        <div className="detail-pill">
          <span className="dp-val">{data.summary.charts_assigned}</span>
          <span className="dp-label">assigned</span>
        </div>
        <div className="detail-pill">
          <span className="dp-val">{data.summary.charts_with_data}</span>
          <span className="dp-label">reviewed</span>
        </div>
        <div className="detail-pill">
          <span className="dp-val" style={{ color: STATUS_COLOR[data.chart_stats[0]?.speed_status]?.text || 'var(--red-text)' }}>
            {data.summary.overall_avg_ppm}
          </span>
          <span className="dp-label">avg ppm</span>
        </div>
        <div className="detail-pill">
          <span className="dp-val" style={{ color: data.flagged_count > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
            {data.flagged_count}
          </span>
          <span className="dp-label">charts flagged</span>
        </div>
      </div>

      <div className="detail-charts-list">
        {data.chart_stats.map(stat => {
          const c = STATUS_COLOR[stat.speed_status] || STATUS_COLOR.no_data;
          const isExpanded = expandedChart === stat.chart_id;
          return (
            <div key={stat.chart_id} className="detail-chart-card"
                 style={{ borderColor: c.border }}>
              <div className="detail-chart-header" role="button" tabIndex={0} aria-expanded={isExpanded}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedChart(isExpanded ? null : stat.chart_id); } }} onClick={() => setExpandedChart(isExpanded ? null : stat.chart_id)}>
                <div className="detail-chart-info">
                  <span className="detail-chart-name">{stat.patient_name}</span>
                  <span className="detail-chart-mrn">{stat.mrn}</span>
                  <span className="detail-chart-pages">{stat.total_pages} pages</span>
                  {stat.fatigue_flag && <span className="flag-chip">Pace acceleration</span>}
                </div>
                <div className="detail-chart-metrics">
                  <TrendMini trend={stat.trend} />
                  <PpmBadge ppm={stat.avg_ppm} status={stat.speed_status} />
                  <span className="detail-chart-meta">
                    {stat.pages_reviewed} pgs · {stat.total_time_minutes} min
                  </span>
                </div>
                <span style={{ color: 'var(--text3)', marginLeft: 8 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && stat.trend.length > 0 && (
                <div className="detail-trend-expanded">
                  <div className="trend-label">Speed by page bucket (ppm) — review pace</div>
                  <div className="trend-bars">
                    {stat.trend.map((t, i) => {
                      const bc = TREND_COLOR[t.status] || TREND_COLOR.no_data;
                      const maxPpm = Math.max(...stat.trend.map(x => x.avg_ppm), 1);
                      const pct = Math.min(100, (t.avg_ppm / maxPpm) * 100);
                      return (
                        <div key={i} className="trend-bar-row" title={`${t.page_range}: ${t.avg_ppm} ppm`}>
                          <span className="trend-bar-label">{t.page_range}</span>
                          <div className="trend-bar-track">
                            <div className="trend-bar-fill"
                                 style={{ width: `${pct}%`, background: bc.fill }}/>
                          </div>
                          <span className="trend-bar-val" style={{ color: bc.text }}>{t.avg_ppm}</span>
                          <span className="trend-bar-status" style={{ color: bc.text }}>
                            {STATUS_ICON[t.status]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="trend-legend">
                    <span style={{ color: TREND_COLOR.green.text, '--legend-color': TREND_COLOR.green.fill }}>✓ &lt;2.0 ppm Lower pace</span>
                    <span style={{ color: TREND_COLOR.yellow.text, '--legend-color': TREND_COLOR.yellow.fill }}>⚡ 2.0–3.0 Monitor</span>
                    <span style={{ color: TREND_COLOR.red.text, '--legend-color': TREND_COLOR.red.fill }}>⚠ 3.0–5.0 Review suggested</span>
                    <span style={{ color: TREND_COLOR.qa_required.text, '--legend-color': TREND_COLOR.qa_required.fill }}>🚨 ≥5.0 Priority review</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [coders, setCoders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selectedCoder, setSelectedCoder] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setLoading(true); setError('');
    try { setCoders(getAllCoders()); }
    catch (err) { setError(err.message); }
    setLoading(false);
  }, [attempt]);

  const filtered = coders.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'flagged') return c.flagged_charts > 0;
    if (filter === 'qa') return c.qa_required;
    return c.overall_status === filter;
  });

  const qaCount     = coders.filter(c => c.qa_required).length;
  const flaggedCount = coders.filter(c => c.flagged_charts > 0).length;
  const greenCount  = coders.filter(c => c.overall_status === 'green').length;

  if (loading) return (
    <div className="analytics-loading"><div className="spinner"></div><p>Loading coder analytics...</p></div>
  );

  return (
    <div className="analytics-dashboard">
      <div className="analytics-header">
        <div>
          <h2>Quality Review Dashboard</h2>
          <p className="analytics-subtitle">Pace = distinct pages ÷ total recorded minutes · Illustrative demo thresholds</p>
        </div>
        <div className="analytics-summary-pills">
          <div className="pill ok"><span className="pill-val">{greenCount}</span><span className="pill-label">Lower pace</span></div>
          <div className="pill warn"><span className="pill-val">{flaggedCount}</span><span className="pill-label">Flagged</span></div>
          <div className="pill qa"><span className="pill-val">{qaCount}</span><span className="pill-label">Priority review</span></div>
        </div>
      </div>

      {error && <div className="login-error" role="alert">{error} <button onClick={() => setAttempt(n => n + 1)}>Retry</button></div>}
      <div className="review-guidance">
        <strong>Turn a signal into a review plan</strong>
        <p>Filter flagged coders, expand a chart, and sample pages from the faster buckets. Discuss chart complexity and documentation density with the coder before deciding whether coaching or additional QA is needed.</p>
        <details><summary>How to interpret these signals</summary>
          <p>Repeat visits add to a page’s recorded time. Overall pace uses total pages and time across charts. Buckets group pages by document order, not session chronology. Flags combine overall pace and a heuristic for acceleration across later buckets.</p>
          <p>These thresholds are demo assumptions, not validated quality standards. Lower pace does not prove thoroughness; higher pace does not prove errors or fatigue. Validate against independently reviewed coding outcomes before using this for operational decisions.</p>
        </details>
      </div>
      <div className="threshold-legend">
        <div className="tl-item" style={{ borderColor: STATUS_COLOR.green.border }}>
          <span className="tl-dot" style={{ background: STATUS_COLOR.green.dot }}></span>
          <span className="tl-label" style={{ color: STATUS_COLOR.green.text }}>Lower pace</span>
          <span className="tl-range">&lt; 2.0 ppm</span>
        </div>
        <div className="tl-item" style={{ borderColor: STATUS_COLOR.yellow.border }}>
          <span className="tl-dot" style={{ background: STATUS_COLOR.yellow.dot }}></span>
          <span className="tl-label" style={{ color: STATUS_COLOR.yellow.text }}>Monitor</span>
          <span className="tl-range">2.0 – &lt;3.0 ppm</span>
        </div>
        <div className="tl-item" style={{ borderColor: STATUS_COLOR.red.border }}>
          <span className="tl-dot" style={{ background: STATUS_COLOR.red.dot }}></span>
          <span className="tl-label" style={{ color: STATUS_COLOR.red.text }}>Review suggested</span>
          <span className="tl-range">3.0 – &lt;5.0 ppm</span>
        </div>
        <div className="tl-item" style={{ borderColor: STATUS_COLOR.qa_required.border }}>
          <span className="tl-dot" style={{ background: STATUS_COLOR.qa_required.dot }}></span>
          <span className="tl-label" style={{ color: STATUS_COLOR.qa_required.text }}>Priority review</span>
          <span className="tl-range">≥ 5.0 ppm</span>
        </div>
        <div className="tl-note">Note: High ppm may still reflect good quality if pages lack M.E.A.T criteria or dx documentation.</div>
      </div>

      <div className="filter-bar">
        {[['all','All Coders'],['flagged','Flagged'],['qa','Priority review'],['green','Lower pace'],['yellow','Monitor'],['red','Review suggested']].map(([val, label]) => (
          <button key={val} className={`filter-btn ${filter === val ? 'active' : ''}`}
                  onClick={() => setFilter(val)}>{label}</button>
        ))}
      </div>

      <div className="coders-list">
        {!error && filtered.length === 0 && (
          <div className="empty-state">No coders match this filter.</div>
        )}
        {filtered.map(coderData => (
          <div key={coderData.coder.id}>
            <CoderRow
              coderData={coderData}
              selected={selectedCoder === coderData.coder.id}
              onSelect={() => setSelectedCoder(
                selectedCoder === coderData.coder.id ? null : coderData.coder.id
              )}
            />
            {selectedCoder === coderData.coder.id && (
              <CoderDetail coderId={coderData.coder.id} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
