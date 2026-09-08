import { getPdfUrl, recordPageTime as savePageTime } from '../lib/demoStore';
import { PageTimer } from '../lib/pageTiming';
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';

const PdfViewer = lazy(() => import('./PdfViewer'));

export default function CoderWorkspace({ chart }) {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [timingError, setTimingError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(document.hidden);
  const [pageReady, setPageReady] = useState(false);
  const visiblePage = useRef(null);
  const timerRef = useRef(null);
  const viewerRef = useRef(null);
  const pageHidden = useRef(false);
  const canCode = user.role === 'coder';

  // Bundled PDFs and locally imported PDFs use the same viewer.
  useEffect(() => {
    if (!chart) return;
    setLoadError('');
    setPageReady(false);
    visiblePage.current = null;
    timerRef.current?.select(null);
    setCurrentPage(1);
    setPdfUrl(getPdfUrl(chart));
  }, [chart, attempt]);

  const recordPageTime = useCallback((page, seconds) => {
    if (!chart || !canCode || seconds <= 0) return;
    try { savePageTime(user.id, chart, page, seconds); }
    catch (err) {
      setTimingError(`Some timing data was not saved: ${err.message}. Pace may be incomplete.`);
    }
  }, [user.id, chart, canCode]);

  useEffect(() => {
    const timer = new PageTimer(recordPageTime);
    timerRef.current = timer;
    const sync = () => {
      const hidden = document.hidden || pageHidden.current;
      setPaused(hidden);
      timer.select(canCode && !hidden ? visiblePage.current : null);
    };
    const hide = () => { pageHidden.current = true; sync(); };
    const show = () => { pageHidden.current = false; sync(); };
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    const interval = setInterval(() => timer.flush(), 30000);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      timer.select(null);
      timerRef.current = null;
    };
  }, [canCode, recordPageTime]);

  const onVisiblePage = useCallback((page, ready) => {
    if (page) setCurrentPage(page);
    setPageReady(ready);
    visiblePage.current = ready ? page : null;
    timerRef.current?.select(canCode && !document.hidden && !pageHidden.current ? visiblePage.current : null);
  }, [canCode]);

  const onViewerError = useCallback(message => {
    setLoadError(message);
    setPageReady(false);
    visiblePage.current = null;
    timerRef.current?.select(null);
  }, []);

  const goToPage = (newPage) => {
    // Scrolling and button navigation share the viewer's visibility signal.
    viewerRef.current?.goToPage(newPage);
  };

  if (!chart) return <div className="empty-state">Select an assigned chart from the Charts tab to begin.</div>;

  const totalPages = chart?.total_pages || 1;
  return (
    <div className="workspace">
      {/* LEFT: PDF Viewer */}
      <div className="pdf-panel">
        <div className="pdf-toolbar">
          <span className="chart-name">{chart?.original_name}</span>
          <div className="page-controls">
            <button onClick={() => goToPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="Previous page" className="pg-btn">‹</button>
            <span className="page-indicator">
              <input
                type="number"
                min={1} max={totalPages}
                value={currentPage}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (v >= 1 && v <= totalPages) goToPage(v);
                }}
                aria-label="Current page" className="page-input"
              />
              <span> / {totalPages}</span>
            </span>
            <button onClick={() => goToPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label="Next page" className="pg-btn">›</button>
          </div>
          <div className="timing-indicator">
            <span className={canCode && pageReady && !paused ? "timing-dot" : ""}></span>
            {!canCode ? "Admin preview · timing off" : paused ? "Timing paused" : !pageReady ? "Waiting for a visible page" : "Recording visible-page time"}
          </div>
        </div>

        <p className="workspace-note">Scroll to read. The page number and timer follow the page most visible on screen. Visible idle time is included.</p>
        {loadError && <div className="login-error" role="alert">Unable to load chart: {loadError} <button onClick={() => setAttempt(n => n + 1)}>Retry</button></div>}
        {timingError && <div className="login-error" role="alert">{timingError}</div>}
        <div className="pdf-embed-wrapper">
          {pdfUrl ? (
            <Suspense fallback={<div className="pdf-placeholder" role="status">Loading PDF viewer…</div>}>
              <PdfViewer key={attempt} ref={viewerRef} url={pdfUrl} onPage={onVisiblePage} onError={onViewerError} />
            </Suspense>
          ) : (
            <div className="pdf-placeholder">
              <svg viewBox="0 0 80 100" fill="none" className="pdf-icon">
                <rect x="5" y="5" width="70" height="90" rx="4" fill="var(--surface)" stroke="var(--red)" strokeWidth="2"/>
                <rect x="15" y="20" width="50" height="4" rx="2" fill="var(--red)" opacity="0.4"/>
                <rect x="15" y="30" width="50" height="4" rx="2" fill="var(--red)" opacity="0.4"/>
                <rect x="15" y="40" width="35" height="4" rx="2" fill="var(--red)" opacity="0.4"/>
                <rect x="15" y="55" width="50" height="4" rx="2" fill="var(--red)" opacity="0.2"/>
                <rect x="15" y="65" width="50" height="4" rx="2" fill="var(--red)" opacity="0.2"/>
                <rect x="15" y="75" width="30" height="4" rx="2" fill="var(--red)" opacity="0.2"/>
              </svg>
              <p>{loadError ? "Chart unavailable" : "Loading chart…"}</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
