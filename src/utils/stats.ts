export interface HistoryPoint {
  timestamp: number;
  value: number;
}

export interface Stats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export function computeStats(history: HistoryPoint[]): Stats {
  if (history.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
  // Filter out NaN/non-finite values that would corrupt the result
  const valid = history.filter((h) => Number.isFinite(h.value));
  if (valid.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
  let min = valid[0].value;
  let max = valid[0].value;
  let sum = 0;
  for (const h of valid) {
    if (h.value < min) min = h.value;
    if (h.value > max) max = h.value;
    sum += h.value;
  }
  return { min, max, avg: sum / valid.length, count: valid.length };
}

/** Format a number smartly: 0 decimals for integers, 2 for small values, 1 for large. */
export function smartFormat(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(1);
  return value.toFixed(2);
}
