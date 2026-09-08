import { users, getCharts, getPageTimes } from './demoStore';

const round = value => Math.round(value * 100) / 100;
export function speedStatus(ppm) {
  if (ppm <= 0) return 'no_data';
  if (ppm < 2) return 'green';
  if (ppm < 3) return 'yellow';
  if (ppm < 5) return 'red';
  return 'qa_required';
}

function hasAcceleration(trend) {
  if (trend.length < 4) return false;
  const middle = Math.floor(trend.length / 2);
  const first = trend.slice(0, middle);
  const second = trend.slice(middle);
  const mean = rows => rows.reduce((sum, row) => sum + row.avg_ppm, 0) / rows.length;
  const change = (mean(second) - mean(first)) / mean(first) * 100;
  const earlierGreen = first.some(row => row.avg_ppm < 2);
  let score = Number(change >= 15) + Number(change >= 30);
  if (earlierGreen && second.filter(row => row.avg_ppm >= 2).length >= 2) score++;
  if (earlierGreen && second.some(row => row.avg_ppm >= 3)) score++;
  return score >= 2;
}

export function chartStats(chart, times) {
  const pages = Object.entries(times).map(([page, seconds]) => ({ page: Number(page), seconds }));
  const seconds = pages.reduce((sum, page) => sum + page.seconds, 0);
  const ppm = seconds ? pages.length * 60 / seconds : 0;
  const trend = [];
  for (let start = 1; start <= chart.total_pages; start += 10) {
    const end = Math.min(start + 9, chart.total_pages);
    const bucket = pages.filter(page => page.page >= start && page.page <= end);
    if (!bucket.length) continue;
    const bucketPpm = round(bucket.length * 60 / bucket.reduce((sum, page) => sum + page.seconds, 0));
    trend.push({ page_range: `${start}-${end}`, avg_ppm: bucketPpm, status: speedStatus(bucketPpm) });
  }
  return {
    chart_id: chart.id, patient_name: chart.patient_name, mrn: chart.mrn, total_pages: chart.total_pages,
    pages_reviewed: pages.length, total_time_seconds: seconds, total_time_minutes: round(seconds / 60),
    avg_ppm: round(ppm), speed_status: speedStatus(ppm), trend, fatigue_flag: hasAcceleration(trend),
  };
}

export function getCoderAnalytics(coderId) {
  const coder = users.find(user => user.id === coderId);
  const stats = getCharts(coder).map(chart => chartStats(chart, getPageTimes(coderId, chart.id)));
  const seconds = stats.reduce((sum, stat) => sum + stat.total_time_seconds, 0);
  const pages = stats.reduce((sum, stat) => sum + stat.pages_reviewed, 0);
  const ppm = seconds ? pages * 60 / seconds : 0;
  return {
    coder, chart_stats: stats,
    flagged_count: stats.filter(stat => stat.fatigue_flag || ['red', 'qa_required'].includes(stat.speed_status)).length,
    overall_status: speedStatus(ppm),
    summary: { charts_assigned: stats.length, charts_with_data: stats.filter(stat => stat.pages_reviewed > 0).length, overall_avg_ppm: round(ppm) },
  };
}

export function getAllCoders() {
  return users.filter(user => user.role === 'coder').map(user => {
    const data = getCoderAnalytics(user.id);
    return { coder: user, ...data.summary, overall_status: data.overall_status,
      flagged_charts: data.flagged_count, qa_required: data.chart_stats.some(stat => stat.speed_status === 'qa_required') };
  });
}
