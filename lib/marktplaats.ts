import { formatEuro, formatKm } from "./format";
import { BROWSER_UA } from "./http";
import { fetchVia } from "./proxies";
import type { Find, Listing, Search } from "./types";

export const MP_BASE = "https://www.marktplaats.nl";
const SEARCH_URL = `${MP_BASE}/lrp/api/search`;

const HEADERS = {
  "User-Agent": BROWSER_UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: `${MP_BASE}/`,
};

export class RateLimited extends Error {}

function absoluteUrl(url: unknown): string {
  const text = typeof url === "string" ? url.trim() : "";
  if (text.startsWith("//")) return `https:${text}`;
  if (text.startsWith("/")) return MP_BASE + text;
  return text;
}

type Raw = Record<string, unknown>;

export function parseListing(raw: unknown): Listing | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const id = String(r.itemId ?? "").trim();
  if (!id || id.toLowerCase().startsWith("a")) return null; // a… = betaalde reclame, geen echte advertentie
  const price = (r.priceInfo ?? {}) as Raw;
  const location = (r.location ?? {}) as Raw;
  const pictures = Array.isArray(r.pictures) ? (r.pictures as Raw[]) : [];
  const picture = pictures[0] ?? {};
  const imageUrls = Array.isArray(r.imageUrls) ? (r.imageUrls as unknown[]) : [];
  const distance = location.distanceMeters;
  const cents = price.priceCents;
  const priority = String(r.priorityProduct ?? "NONE").toUpperCase();
  return {
    id,
    promoted: priority !== "NONE" && priority !== "",
    title: String(r.title ?? "").replace(/\s+/g, " ").trim() || "(zonder titel)",
    description: String(r.description ?? "").replace(/\s+/g, " ").trim(),
    priceCents: typeof cents === "number" ? Math.round(cents) : 0,
    priceType: String(price.priceType ?? "").toUpperCase(),
    city: String(location.cityName ?? ""),
    distanceM: typeof distance === "number" && distance >= 0 ? Math.round(distance) : null,
    image: absoluteUrl(picture.largeUrl ?? picture.mediumUrl ?? imageUrls[0]),
    url: absoluteUrl(r.vipUrl) || `https://link.marktplaats.nl/${id}`,
    reserved: Boolean(r.reserved),
  };
}

export async function fetchListings(s: Search): Promise<{ listings: Listing[]; via: string; wireBytes: number | null }> {
  const params = new URLSearchParams();
  params.append("query", s.query);
  params.append("postcode", s.postcode);
  if (s.distanceKm) params.append("distanceMeters", String(s.distanceKm * 1000));
  params.append("attributeRanges[]", `PriceCents:null:${s.maxPriceCents}`);
  params.append("limit", String(s.window));
  params.append("offset", "0");
  params.append("sortBy", "SORT_INDEX");
  params.append("sortOrder", "DECREASING");

  const res = await fetchVia(`${SEARCH_URL}?${params}`, HEADERS, { timeoutMs: 20_000, maxBytes: 8_000_000 });
  if (res.status === 429) throw new RateLimited();
  if (res.status !== 200) throw new Error(`Marktplaats antwoordde met HTTP ${res.status}`);
  let data: unknown;
  try {
    data = JSON.parse(res.body.toString("utf8"));
  } catch {
    throw new Error("onverwacht antwoord van Marktplaats (geen JSON)");
  }
  const raw = (data as { listings?: unknown } | null)?.listings;
  if (!Array.isArray(raw)) throw new Error("onverwacht antwoord van Marktplaats (geen 'listings')");
  return {
    listings: raw.map(parseListing).filter((l): l is Listing => l !== null),
    via: res.via,
    wireBytes: res.wireBytes,
  };
}

// Marktplaats zet betaalde advertenties (Dagtoppers) bóven de nieuwste. Daarom vragen we per check
// het aantal betaalde plekken op plus een marge voor nieuwe advertenties, in plaats van steeds 30.
export const FIRST_WINDOW = 30;
const MARGIN = 12;
const MAX_WINDOW = 100;

/**
 * Hoeveel resultaten de volgende check moet opvragen. Waren alle gewone advertenties in beeld nieuw,
 * dan kan er iets buiten beeld gevallen zijn: dan het venster verdubbelen.
 */
export function nextWindow(listings: Listing[], current: number, allNormalWereNew: boolean): number {
  if (allNormalWereNew && listings.length >= current) return Math.min(MAX_WINDOW, current * 2);
  const promoted = listings.filter((l) => l.promoted).length;
  return Math.min(MAX_WINDOW, Math.max(MARGIN, promoted + MARGIN));
}

const NO_PRICE_LABELS: Record<string, string> = {
  MIN_BID: "Bieden",
  FAST_BID: "Bieden",
  SEE_DESCRIPTION: "Zie omschrijving",
  NOTK: "N.o.t.k.",
  EXCHANGE: "Ruilen",
  ON_REQUEST: "Op aanvraag",
  RESERVED: "Gereserveerd",
};

export function hasPrice(l: Listing): boolean {
  return l.priceType === "FREE" || l.priceCents > 0;
}

export function priceParts(l: Listing): { label: string; note: string | null } {
  if (l.priceType === "FREE") return { label: "Gratis", note: null };
  if (l.priceCents > 0) {
    return { label: formatEuro(l.priceCents), note: l.priceType === "MIN_BID" ? "Bieden vanaf" : null };
  }
  return { label: NO_PRICE_LABELS[l.priceType] ?? "Prijs onbekend", note: null };
}

/** Controleert prijs en afstand nogmaals zelf, los van wat Marktplaats teruggeeft. */
export function matches(l: Listing, s: Search): boolean {
  if (l.reserved) return false;
  if (s.distanceKm && (l.distanceM === null || l.distanceM > s.distanceKm * 1000)) return false;
  if (hasPrice(l)) return l.priceCents <= s.maxPriceCents;
  return s.includeNoPrice;
}

export function itemNumber(l: Listing): number {
  const digits = l.id.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function shorten(text: string, limit: number): string {
  // Marktplaats levert de omschrijving al afgekapt op 200 tekens aan.
  return text.length >= limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

export function makeFind(l: Listing, s: Search, foundAt: number): Find {
  const { label, note } = priceParts(l);
  let notifyTitle = `🔔 Nieuw: ${l.title} – ${label}`;
  if (l.distanceM !== null) notifyTitle += ` (${formatKm(l.distanceM)} km)`;
  return {
    key: `${s.id}:${l.id}`,
    itemId: l.id,
    searchId: s.id,
    query: s.query,
    foundAt,
    title: l.title,
    url: l.url,
    image: l.image,
    priceLabel: label,
    priceNote: note,
    city: l.city,
    distanceM: l.distanceM,
    description: shorten(l.description, 200),
    notifyTitle,
  };
}
