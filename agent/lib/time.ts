const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istParts(date: Date) {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    y: d.getUTCFullYear(),
    mo: pad(d.getUTCMonth() + 1),
    d: pad(d.getUTCDate()),
    h: pad(d.getUTCHours()),
    mi: pad(d.getUTCMinutes()),
    s: pad(d.getUTCSeconds()),
  };
}

/** YYYYMMDDHHMMSS in IST, the format bizfeed expects. */
export function istCompact(date: Date): string {
  const p = istParts(date);
  return `${p.y}${p.mo}${p.d}${p.h}${p.mi}${p.s}`;
}

/** YYYY-MM-DD in IST. */
export function istDate(date: Date): string {
  const p = istParts(date);
  return `${p.y}-${p.mo}-${p.d}`;
}

/** Parses bizfeed's YYYYMMDDHHMMSS (IST) into an ISO string. */
export function compactToIso(value: string | number | null | undefined): string | null {
  const s = String(value ?? "");
  if (!/^\d{14}$/.test(s)) return null;
  const utc = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14));
  return new Date(utc - IST_OFFSET_MS).toISOString();
}

export function daysAgo(days: number, from = new Date()): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}
