import type { Settings } from "./settings";
import type { Find, Level, LogEntry, ProxyEntry, Search, Usage } from "./types";

// Alle gegevens staan in het geheugen van dit ene proces. Next.js kan modules vaker laden,
// daarom hangt de store aan globalThis: zo delen de monitor en alle API-routes dezelfde gegevens.

interface Store {
  searches: Map<number, Search>;
  finds: Find[];
  logs: LogEntry[];
  settings: Settings | null; // null = nog niet van schijf geladen
  proxies: ProxyEntry[] | null; // null = nog niet opgebouwd uit de instellingen
  proxyCursor: number;
  tlsSessions: Map<string, Buffer>; // per proxy en website: scheelt bij elke nieuwe verbinding ± 4 KB
  usage: Usage;
  ownIp: string | null;
  nextSearchId: number;
  nextLogId: number;
  version: number; // gaat omhoog bij elke wijziging, zodat de browser weet dat er iets nieuws is
  blockedUntil: number;
  chain: Promise<unknown>; // één check tegelijk
  started: boolean;
  ticking: boolean;
}

const holder = globalThis as unknown as { __marktplaatsSniper?: Store };

export function store(): Store {
  holder.__marktplaatsSniper ??= {
    searches: new Map(),
    finds: [],
    logs: [],
    settings: null,
    proxies: null,
    proxyCursor: 0,
    tlsSessions: new Map(),
    usage: { since: Date.now(), proxyBytes: 0, checks: 0, checkBytes: 0 },
    ownIp: null,
    nextSearchId: 1,
    nextLogId: 1,
    version: 1,
    blockedUntil: 0,
    chain: Promise.resolve(),
    started: false,
    ticking: false,
  };
  return holder.__marktplaatsSniper;
}

export function changed(): void {
  store().version++;
}

export function log(level: Level, message: string): void {
  const s = store();
  s.logs.unshift({ id: s.nextLogId++, ts: Date.now(), level, message });
  if (s.logs.length > 300) s.logs.length = 300;
  changed();
  const time = new Date().toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam" });
  (level === "error" ? console.error : console.log)(`${time} ${level.padEnd(5)} ${message}`);
}

/** Voert checks één voor één uit, ook als planner en "Nu checken" tegelijk komen. */
export function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const s = store();
  const run = s.chain.then(task, task);
  s.chain = run.catch(() => undefined);
  return run;
}
