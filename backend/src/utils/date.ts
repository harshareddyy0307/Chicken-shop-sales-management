/**
 * Date utilities for Asia/Kolkata timezone
 */
export function getTodayKolkata(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isFutureDateKolkata(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = getTodayKolkata();
  return dateStr > today;
}
