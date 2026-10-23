export type Level = "info" | "ok" | "warn" | "error";

export interface Usage {
  since: number;
  proxyBytes: number; // alles wat via de proxy's ging: checks, foto's en tests
  checks: number; // checks waarvan het verbruik gemeten is
  checkBytes: number;
}

export interface Listing {
  id: string;
  promoted: boolean; // betaalde plek bovenaan (Dagtopper e.d.)
  title: string;
  description: string;
  priceCents: number;
  priceType: string;
  city: string;
  distanceM: number | null;
  image: string;
  url: string;
  reserved: boolean;
}

export interface Search {
  id: number;
  query: string;
  postcode: string;
  distanceKm: number; // 0 = heel Nederland
  maxPriceCents: number;
  includeNoPrice: boolean;
  active: boolean;
  initialized: boolean; // true = de advertenties van dat moment zijn als gezien gemarkeerd
  foundCount: number;
  createdAt: number;
  lastCheck: number | null;
  lastStatus: string | null;
  lastLevel: Level | null;
  nextCheck: number | null;
  window: number; // hoeveel resultaten er per check opgevraagd worden
  seen: Set<string>;
}

export type PublicSearch = Omit<Search, "seen" | "initialized" | "window">;

export interface Find {
  key: string;
  itemId: string;
  searchId: number;
  query: string;
  foundAt: number;
  title: string;
  url: string;
  image: string;
  priceLabel: string; // "€375", "Gratis", "Bieden"
  priceNote: string | null; // "Bieden vanaf"
  city: string;
  distanceM: number | null;
  description: string;
  notifyTitle: string;
}

export interface LogEntry {
  id: number;
  ts: number;
  level: Level;
  message: string;
}

export interface ProxyEntry {
  id: string;
  raw: string; // zoals ingevuld
  url: string; // genormaliseerd, inclusief inloggegevens (blijft op de server)
  label: string; // zonder wachtwoord
  protocol: string;
  hasAuth: boolean;
  lastUsed: number | null;
  lastOk: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  failStreak: number;
  cooldownUntil: number;
  exitIp: string | null;
  latencyMs: number | null;
  testedAt: number | null;
  testError: string | null;
  leaks: boolean; // toont bij de test je eigen IP: wordt nooit gebruikt
}

export type PublicProxy = Omit<ProxyEntry, "url" | "raw"> & { number: number }; // plek in de lijst, vanaf 1

export interface PublicState {
  version: number;
  serverNow: number;
  settings: { intervalMin: number; quietNights: boolean };
  usage: Usage;
  blockedUntil: number;
  searches: PublicSearch[];
  finds: Find[];
  logs: LogEntry[];
  proxies: PublicProxy[];
  ownIp: string | null;
  phoneUrl: string | null;
}

export interface Notice {
  level: Level;
  message: string;
}
