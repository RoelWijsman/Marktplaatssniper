// Opmaak die zowel op de server als in de browser gebruikt wordt.

const TIME_ZONE = "Europe/Amsterdam";
const clockFormat = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
const clockSecondsFormat = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: TIME_ZONE,
});
const dayFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: TIME_ZONE });
const dateKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

export function formatEuro(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  const whole = euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rest === 0 ? `€${whole}` : `€${whole},${rest.toString().padStart(2, "0")}`;
}

export function formatKm(meters: number): string {
  const km = meters / 1000;
  if (km < 10) return km.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  return String(Math.round(km));
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function clock(ts: number, seconds = false): string {
  return (seconds ? clockSecondsFormat : clockFormat).format(ts);
}

/** "20:30" voor vandaag, anders "21 okt. 20:30". */
export function moment(ts: number, now: number, seconds = false): string {
  const sameDay = dateKeyFormat.format(ts) === dateKeyFormat.format(now);
  return sameDay ? clock(ts, seconds) : `${dayFormat.format(ts)} ${clock(ts)}`;
}

export function countdown(ms: number): string {
  if (ms <= 0) return "nu";
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ago(ts: number, now: number): string {
  const diff = Math.max(0, now - ts) / 1000;
  if (diff < 60) return "zojuist";
  if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} uur geleden`;
  const days = Math.floor(diff / 86400);
  return `${days} ${days === 1 ? "dag" : "dagen"} geleden`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
}

/** Aantal checks per dag per zoekopdracht (de variatie in het interval is gemiddeld 5% langer). */
export function checksPerDay(intervalMin: number, quietNights: boolean): number {
  const minutes = quietNights ? (18 * 60) / intervalMin + (6 * 60) / Math.max(intervalMin, 10) : (24 * 60) / intervalMin;
  return minutes / 1.05;
}

export function everyText(intervalMin: number): string {
  return intervalMin === 1 ? "elke minuut" : `elke ${intervalMin} minuten`;
}

export function criteriaText(s: { maxPriceCents: number; distanceKm: number; postcode: string; includeNoPrice: boolean }): string {
  const where = s.distanceKm ? `binnen ${s.distanceKm} km van ${s.postcode}` : `in heel Nederland, gemeten vanaf ${s.postcode}`;
  return `Tot ${formatEuro(s.maxPriceCents)} ${where}${s.includeNoPrice ? ", ook zonder prijs" : ""}`;
}
