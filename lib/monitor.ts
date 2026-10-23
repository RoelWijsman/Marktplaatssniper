import { spawn } from "node:child_process";
import { clock, plural } from "./format";
import { RateLimited, fetchListings, itemNumber, makeFind, matches, nextWindow } from "./marktplaats";
import { getSettings } from "./settings";
import { changed, exclusive, log, store } from "./store";
import type { Level, Notice, Search } from "./types";

const QUIET_FROM_HOUR = 1;
const QUIET_UNTIL_HOUR = 7;
const QUIET_INTERVAL_MIN = 10;
const RATE_LIMIT_PAUSE_MS = 15 * 60_000;
const MAX_FINDS = 500;
const TICK_MS = 5_000;

export function ensureMonitor(): void {
  const s = store();
  if (s.started) return;
  s.started = true;
  setInterval(() => void tick(), TICK_MS);
  log("info", "Marktplaats Sniper gestart");
  if (process.env.OPEN_BROWSER === "1") setTimeout(openBrowser, 2_000);
}

function openBrowser(): void {
  const url = `http://localhost:${process.env.PORT || 3000}`;
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(/*turbopackIgnore: true*/ command as string, args as string[], { detached: true, stdio: "ignore" })
    .on("error", () => undefined)
    .unref();
}

const hourFormat = new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" });

/** Volgens de ingestelde frequentie, 's nachts desgewenst rustiger, met willekeurige variatie. */
export function nextDelay(at = Date.now()): number {
  const { intervalMin, quietNights } = getSettings();
  const hour = Number(hourFormat.format(at));
  const quiet = quietNights && hour >= QUIET_FROM_HOUR && hour < QUIET_UNTIL_HOUR;
  const minutes = quiet ? Math.max(intervalMin, QUIET_INTERVAL_MIN) : intervalMin;
  return minutes * 60_000 * (0.85 + Math.random() * 0.4);
}

/** Na het wijzigen van de frequentie: de volgende checks opnieuw inplannen. */
export function reschedule(): void {
  const now = Date.now();
  for (const search of store().searches.values()) {
    if (search.active && search.initialized) search.nextCheck = Math.max(now, (search.lastCheck ?? now) + nextDelay(now));
  }
  changed();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick(): Promise<void> {
  const s = store();
  if (s.ticking || s.blockedUntil > Date.now()) return;
  s.ticking = true;
  try {
    const now = Date.now();
    const due = [...s.searches.values()]
      .filter((search) => search.active && (search.nextCheck ?? 0) <= now)
      .sort((a, b) => (a.nextCheck ?? 0) - (b.nextCheck ?? 0))
      .map((search) => search.id);
    for (const [index, id] of due.entries()) {
      if (index) await sleep(3_000 + Math.random() * 5_000); // niet alle zoekopdrachten tegelijk
      if (s.blockedUntil > Date.now()) break;
      await exclusive(() => checkSearch(id, false)).catch((error: Error) =>
        log("error", `Onverwachte fout bij check: ${error.message}`),
      );
    }
  } finally {
    s.ticking = false;
  }
}

function setStatus(search: Search, level: Level, text: string, at: number): void {
  search.lastCheck = at;
  search.lastStatus = text;
  search.lastLevel = level;
  changed();
}

/** Eén check van één zoekopdracht. Alleen via exclusive() aanroepen. */
export async function checkSearch(id: number, manual: boolean): Promise<Notice> {
  const s = store();
  const search = s.searches.get(id);
  if (!search) return { level: "error", message: "Deze zoekopdracht bestaat niet meer." };
  if (!search.active && !manual) return { level: "info", message: "Deze zoekopdracht staat op pauze." };
  const label = `“${search.query}”`;
  const now = Date.now();

  if (s.blockedUntil > now) {
    return {
      level: "warn",
      message: `Marktplaats gaf eerder HTTP 429 (te veel verzoeken). Alle checks staan op pauze tot ${clock(s.blockedUntil)}.`,
    };
  }

  // Volgende check meteen inplannen, zodat ook een onverwachte fout nooit tot een stortvloed aan verzoeken leidt.
  search.nextCheck = now + nextDelay();
  changed();

  let result: Awaited<ReturnType<typeof fetchListings>>;
  try {
    result = await fetchListings(search);
  } catch (error) {
    if (error instanceof RateLimited) {
      s.blockedUntil = now + RATE_LIMIT_PAUSE_MS;
      search.nextCheck = s.blockedUntil + 10_000 + Math.random() * 50_000;
      setStatus(search, "error", `HTTP 429, pauze tot ${clock(s.blockedUntil)}`, now);
      const message = `Marktplaats gaf HTTP 429 (te veel verzoeken). Alle checks staan 15 minuten op pauze, tot ${clock(s.blockedUntil)}.`;
      log("error", `${label}: ${message}`);
      return { level: "error", message };
    }
    const reason = (error as Error).message;
    setStatus(search, "error", `Mislukt: ${reason}`, now);
    log("error", `${label}: ophalen mislukt, ${reason}`);
    return { level: "error", message: `Ophalen mislukt: ${reason}` };
  }
  if (!s.searches.has(id)) return { level: "info", message: "Deze zoekopdracht is intussen verwijderd." };
  const { listings, wireBytes } = result;
  if (wireBytes) {
    s.usage.checks += 1;
    s.usage.checkBytes += wireBytes;
  }
  const via = `via ${result.via}${wireBytes ? `, ${Math.round(wireBytes / 1024)} KB` : ""}`;

  if (!search.initialized) {
    // Nieuwe of hervatte zoekopdracht: alles wat er nu staat, telt als gezien.
    for (const listing of listings) search.seen.add(listing.id);
    search.initialized = true;
    search.window = nextWindow(listings, search.window, false);
    const skipped = plural(listings.length, "bestaande advertentie", "bestaande advertenties");
    setStatus(search, "info", `Startpunt gezet, ${skipped} overgeslagen`, now);
    log("info", `${label}: startpunt gezet, ${skipped} overgeslagen (${via})`);
    return { level: "ok", message: `Startpunt gezet: ${skipped} overgeslagen. Nieuwe advertenties verschijnen vanaf nu bij Gevonden.` };
  }

  const normal = listings.filter((listing) => !listing.promoted);
  const allNormalWereNew = normal.length > 0 && normal.every((listing) => !search.seen.has(listing.id));
  search.window = nextWindow(listings, search.window, allNormalWereNew);
  const fresh = listings.filter((listing) => !search.seen.has(listing.id));
  const hits = fresh.filter((listing) => matches(listing, search)).sort((a, b) => itemNumber(b) - itemNumber(a));
  // Gereserveerde advertenties niet als gezien markeren: wordt de reservering opgeheven, dan komen ze alsnog.
  for (const listing of fresh) if (!listing.reserved) search.seen.add(listing.id);

  if (hits.length === 0) {
    const status = fresh.length ? `Niets nieuws dat past (${fresh.length} nieuw buiten je filters)` : "Niets nieuws";
    setStatus(search, "info", status, now);
    log("info", `${label}: ${status.toLowerCase()} (${via})`);
    return { level: "info", message: `${status}.` };
  }

  s.finds.unshift(...hits.map((listing) => makeFind(listing, search, now)));
  if (s.finds.length > MAX_FINDS) s.finds.length = MAX_FINDS;
  search.foundCount += hits.length;
  const found = plural(hits.length, "nieuwe advertentie", "nieuwe advertenties");
  setStatus(search, "ok", `${found} gevonden`, now);
  log("ok", `${label}: ${found} gevonden (${via})`);
  return { level: "ok", message: `${found} gevonden.` };
}

/** Check vanuit de webpagina. */
export async function runCheckNow(id: number): Promise<Notice> {
  try {
    return await exclusive(() => checkSearch(id, true));
  } catch (error) {
    log("error", `Onverwachte fout bij check: ${(error as Error).message}`);
    return { level: "error", message: `Onverwachte fout: ${(error as Error).message}` };
  }
}
