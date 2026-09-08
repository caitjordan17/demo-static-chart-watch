import charts from '../data/charts.json';
import reviewTimes from '../data/reviewTimes.json';

// Demo accounts are just a way to switch views, not real authentication.
export const users = ['admin', 'jsmith', 'alopez', 'mchen', 'tpatel', 'sbrown', 'dwilliams', 'rnguyen']
  .map((username, index) => ({ id: index + 1, username, role: index === 0 ? 'admin' : 'coder', is_active: true }));

const storageKey = 'chartwatch-demo-v1';
const defaultAssignments = users.filter(user => user.role === 'coder')
  .flatMap(user => charts.filter(chart => user.id <= 5 || chart.id === 2)
    .map(chart => ({ user_id: user.id, chart_id: chart.id })));

function loadSavedDemo() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Array.isArray(saved.assignments) && saved.times && typeof saved.times === 'object') return saved;
  } catch { /* Start fresh if storage is unavailable or contains invalid JSON. */ }
  return { assignments: defaultAssignments, times: {} };
}

let saved = loadSavedDemo();
// Imported PDFs stay in this tab's memory, including when switching accounts.
let importedCharts = [];
let importedAssignments = [];
let importedTimes = {};

function saveDemo(next) {
  localStorage.setItem(storageKey, JSON.stringify(next));
  saved = next;
}

export function getCharts(user) {
  const all = [...importedCharts, ...charts];
  return user.role === 'admin' ? all : all.filter(chart =>
    [...saved.assignments, ...importedAssignments].some(a => a.user_id === user.id && a.chart_id === chart.id));
}

export function assignChart(chartId, userId) {
  if (!getCharts({ role: 'admin' }).some(c => c.id === chartId) || !users.some(u => u.id === userId && u.role === 'coder')) {
    throw new Error('Choose a chart and coder.');
  }
  const assignment = { chart_id: chartId, user_id: userId };
  const list = chartId > 3 ? importedAssignments : saved.assignments;
  if (list.some(a => a.chart_id === chartId && a.user_id === userId)) return;
  if (chartId > 3) importedAssignments = [...list, assignment];
  else saveDemo({ ...saved, assignments: [...list, assignment] });
}

export function getPdfUrl(chart) {
  return chart.url || `${import.meta.env.BASE_URL}charts/${chart.filename}`;
}

export async function importPdf(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file.');
  if (file.size > 50 * 1024 * 1024) throw new Error('Choose a PDF smaller than 50 MB.');
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const chart = {
      id: Date.now(), original_name: file.name, patient_name: file.name,
      mrn: 'LOCAL DEMO', total_pages: pdf.numPages, uploaded_by: 'admin',
      uploaded_at: new Date().toISOString(), url: URL.createObjectURL(file),
    };
    importedCharts = [chart, ...importedCharts];
    return chart;
  } finally { await task.destroy(); }
}

export function getPageTimes(userId, chartId) {
  const key = `${userId}:${chartId}`;
  return { ...reviewTimes[key], ...(saved.times[key] || importedTimes[key]) };
}

export function recordPageTime(userId, chart, page, seconds) {
  if (!Number.isInteger(page) || page < 1 || page > chart.total_pages || !Number.isFinite(seconds) || seconds <= 0) return;
  const key = `${userId}:${chart.id}`;
  const pages = getPageTimes(userId, chart.id);
  pages[page] = (pages[page] || 0) + seconds;
  if (chart.id > 3) importedTimes[key] = pages;
  else saveDemo({ ...saved, times: { ...saved.times, [key]: pages } });
}

export function resetDemo() {
  localStorage.removeItem(storageKey);
  for (const chart of importedCharts) URL.revokeObjectURL(chart.url);
  saved = { assignments: defaultAssignments, times: {} };
  importedCharts = [];
  importedAssignments = [];
  importedTimes = {};
}
