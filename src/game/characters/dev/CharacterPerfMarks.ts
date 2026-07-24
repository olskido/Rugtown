/**
 * Lightweight development-only User Timing helpers for character work.
 * Production builds intentionally leave no marks or measurements behind.
 */
export function charPerfMark(name: string): void {
  if (!import.meta.env.DEV || typeof performance === 'undefined') return;
  performance.mark(name);
}

export function charPerfMeasure(name: string, start: string, end: string): void {
  if (!import.meta.env.DEV || typeof performance === 'undefined') return;
  performance.measure(name, start, end);
}
