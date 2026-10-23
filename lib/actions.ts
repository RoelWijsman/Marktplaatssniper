import { formatEuro } from "./format";
import { FIRST_WINDOW } from "./marktplaats";
import { runCheckNow } from "./monitor";
import { changed, log, store } from "./store";
import type { Notice } from "./types";

export const DISTANCES_KM = [3, 5, 10, 15, 25, 50, 75, 100]; // 0 = heel Nederland

export function normalizePostcode(raw: unknown): string | null {
  const match = /^\s*([1-9]\d{3})\s*([A-Za-z]{2})?\s*$/.exec(String(raw ?? ""));
  return match ? match[1] + (match[2] ?? "").toUpperCase() : null;
}

export function parsePriceCents(raw: unknown): number | null {
  let text = String(raw ?? "").trim().replace(/€/g, "").replace(/\s/g, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", "."); // Nederlandse notatie: 1.250,50
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!(value > 0 && value <= 1_000_000)) return null;
  return Math.round(value * 100);
}

export interface SearchInput {
  query?: unknown;
  postcode?: unknown;
  distanceKm?: unknown;
  maxPrice?: unknown;
  includeNoPrice?: unknown;
}

export async function createSearch(input: SearchInput): Promise<{ errors: string[] } | { notice: Notice }> {
  const query = String(input.query ?? "").replace(/\s+/g, " ").trim();
  const postcode = normalizePostcode(input.postcode);
  const distanceKm = Number(input.distanceKm);
  const maxPriceCents = parsePriceCents(input.maxPrice);

  const errors: string[] = [];
  if (!query) errors.push("Vul een zoekterm in.");
  else if (query.length > 100) errors.push("De zoekterm is te lang, maximaal 100 tekens.");
  if (!postcode) errors.push("Vul een geldige Nederlandse postcode in, bijvoorbeeld 1234AB.");
  if (![0, ...DISTANCES_KM].includes(distanceKm)) errors.push("Kies een maximale afstand uit de lijst.");
  if (maxPriceCents === null) errors.push("Vul een geldige maximale prijs in, bijvoorbeeld 150 of 49,95.");
  if (errors.length || !postcode || maxPriceCents === null) return { errors };

  const s = store();
  const id = s.nextSearchId++;
  s.searches.set(id, {
    id,
    query,
    postcode,
    distanceKm,
    maxPriceCents,
    includeNoPrice: Boolean(input.includeNoPrice),
    active: true,
    initialized: false,
    foundCount: 0,
    createdAt: Date.now(),
    lastCheck: null,
    lastStatus: null,
    lastLevel: null,
    nextCheck: null,
    window: FIRST_WINDOW,
    seen: new Set(),
  });
  const where = distanceKm ? `binnen ${distanceKm} km van ${postcode}` : `in heel Nederland vanaf ${postcode}`;
  log("info", `Nieuwe zoekopdracht “${query}”, tot ${formatEuro(maxPriceCents)} ${where}`);
  const notice = await runCheckNow(id);
  return { notice: { ...notice, message: `“${query}” toegevoegd. ${notice.message}` } };
}

export async function setActive(id: number, active: boolean): Promise<Notice> {
  const search = store().searches.get(id);
  if (!search) return { level: "error", message: "Deze zoekopdracht bestaat niet meer." };
  if (!active) {
    search.active = false;
    search.lastStatus = "Gepauzeerd";
    search.lastLevel = "info";
    log("info", `“${search.query}”: gepauzeerd`);
    return { level: "info", message: `“${search.query}” is gepauzeerd.` };
  }
  // Bij hervatten opnieuw een startpunt zetten: niet alles van tijdens de pauze ineens op de lijst.
  search.active = true;
  search.initialized = false;
  search.window = FIRST_WINDOW;
  search.nextCheck = Date.now();
  log("info", `“${search.query}”: hervat`);
  const notice = await runCheckNow(id);
  return { ...notice, message: `“${search.query}” is hervat. ${notice.message}` };
}

export function deleteSearch(id: number): Notice {
  const s = store();
  const search = s.searches.get(id);
  if (!search) return { level: "error", message: "Deze zoekopdracht bestaat niet meer." };
  s.searches.delete(id);
  s.finds = s.finds.filter((find) => find.searchId !== id);
  log("info", `“${search.query}”: verwijderd`);
  return { level: "info", message: `“${search.query}” en de vondsten ervan zijn verwijderd.` };
}

export function clearFinds(): Notice {
  const s = store();
  const count = s.finds.length;
  s.finds = [];
  changed();
  log("info", `Lijst met vondsten leeggemaakt (${count})`);
  return { level: "info", message: "De lijst met vondsten is leeg." };
}
