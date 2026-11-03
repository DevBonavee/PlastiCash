// Age rules (NDPA 2023), same as api/app/services/guardian.py. Under 13: no account; 13 to 17: a parent or
// guardian must consent; 18 and over: no consent needed. Dates are "YYYY-MM-DD", counted in Lagos time.
export const MIN_AGE = 13;
export const ADULT_AGE = 18;

export function lagosToday(now = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10); // Nigeria is UTC+1
}

export function ageOn(born: string, today: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(born);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!b || !t) return null;
  const [by, bm, bd] = b.slice(1).map(Number);
  const [ty, tm, td] = t.slice(1).map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
