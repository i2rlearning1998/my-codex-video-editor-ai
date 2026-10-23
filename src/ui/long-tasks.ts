// FIX4 A8: counts the page's long tasks (over 50 ms) while a feature runs, so
// Copy diagnostics can say whether the page itself stalled (a frozen page
// shows up here) or only the worker was slow.
export interface LongTaskReport {
  count: number;
  maxMs: number;
  totalMs: number;
}
export function watchLongTasks(): () => LongTaskReport {
  const report: LongTaskReport = { count: 0, maxMs: 0, totalMs: 0 };
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        report.count += 1;
        report.totalMs += entry.duration;
        report.maxMs = Math.max(report.maxMs, entry.duration);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    observer = null; // Not supported here: the report stays at zero.
  }
  return () => {
    observer?.takeRecords().forEach((entry) => {
      report.count += 1;
      report.totalMs += entry.duration;
      report.maxMs = Math.max(report.maxMs, entry.duration);
    });
    observer?.disconnect();
    return {
      count: report.count,
      maxMs: Math.round(report.maxMs),
      totalMs: Math.round(report.totalMs),
    };
  };
}
/** The report as plain facts for Copy diagnostics. */
export const longTaskFacts = (report: LongTaskReport | undefined) =>
  report
    ? {
        pageLongTasks: report.count,
        pageLongestTaskMs: report.maxMs,
        pageBlockedMs: report.totalMs,
      }
    : {};
