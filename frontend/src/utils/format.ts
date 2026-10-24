export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '₹0.00';
  }
  const num = Number(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatKg(weight: number | string | null | undefined): string {
  if (weight === null || weight === undefined || isNaN(Number(weight))) {
    return '0.00 kg';
  }
  const num = Number(weight);
  return `${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`;
}

// Format date to Indian format: DD-MM-YYYY
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return String(dateStr);
  }
}

// Get today's date string (YYYY-MM-DD) in Asia/Kolkata timezone
export function getTodayDateString(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export function isFutureDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = getTodayDateString();
  return dateStr > today;
}

// Check if a date string or Date object falls on a Sunday
export function isSundayDate(dateStr: string | Date | null | undefined): boolean {
  if (!dateStr) return false;
  if (dateStr instanceof Date) {
    return dateStr.getDay() === 0;
  }
  const clean = String(dateStr).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    return dateObj.getDay() === 0;
  }
  const d = new Date(dateStr);
  return d.getDay() === 0;
}

// Get the day of the week name (e.g., 'Sun', 'Mon' or full 'Sunday')
export function getDayOfWeekName(dateStr: string | Date | null | undefined, short = true): string {
  if (!dateStr) return '';
  try {
    const clean = String(dateStr).split('T')[0];
    const parts = clean.split('-');
    let d: Date;
    if (parts.length === 3) {
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      d = new Date(dateStr);
    }
    return d.toLocaleDateString('en-IN', { weekday: short ? 'short' : 'long' });
  } catch {
    return '';
  }
}
