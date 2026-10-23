import { createHash } from "node:crypto";
import type { Agent } from "node:http";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { BROWSER_UA, httpGet, type HttpOptions, type HttpResult } from "./http";
import { getSettings, saveSettings } from "./settings";
import { changed, log, store } from "./store";
import type { ProxyEntry } from "./types";

// De proxylijst wordt bewaard in data/settings.json, zodat je hem niet na elke herstart opnieuw
// hoeft in te vullen en er nooit per ongeluk een check via je eigen IP gaat.
const PROTOCOLS = ["http", "https", "socks", "socks4", "socks4a", "socks5", "socks5h"];
const MAX_COOLDOWN_MIN = 10;

type Parsed = Pick<ProxyEntry, "url" | "label" | "protocol" | "hasAuth">;

/**
 * Accepteert o.a.:
 *   http://gebruiker:wachtwoord@1.2.3.4:8080
 *   socks5://1.2.3.4:1080
 *   1.2.3.4:8080
 *   1.2.3.4:8080:gebruiker:wachtwoord
 */
export function parseProxyLine(input: string): Parsed | { error: string } {
  let text = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    const parts = text.split(":");
    text =
      parts.length === 4 && /^\d+$/.test(parts[1])
        ? `http://${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[0]}:${parts[1]}`
        : `http://${text}`;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: "dit is geen geldig proxy-adres" };
  }
  let protocol = url.protocol.replace(":", "").toLowerCase();
  if (!PROTOCOLS.includes(protocol)) {
    return { error: `protocol "${protocol}" wordt niet ondersteund, gebruik http, https of socks5` };
  }
  if (!url.hostname) return { error: "het adres mist een host" };
  if (!url.port) return { error: "het adres mist een poort, bijvoorbeeld :8080" };
  if (protocol === "socks" || protocol === "socks5") {
    protocol = "socks5h"; // laat ook de DNS-opzoeking via de proxy lopen
    url.protocol = "socks5h:";
  }
  const host = url.hostname.includes(":") ? `[${url.hostname}]` : url.hostname;
  return {
    url: url.href,
    label: `${host}:${url.port}`,
    protocol,
    hasAuth: Boolean(url.username || url.password),
  };
}

function buildEntries(lines: string[], previous: ProxyEntry[]): { entries: ProxyEntry[]; errors: string[] } {
  const entries: ProxyEntry[] = [];
  const errors: string[] = [];
  lines.forEach((line, index) => {
    const raw = line.trim();
    if (!raw || raw.startsWith("#")) return;
    const parsed = parseProxyLine(raw);
    if ("error" in parsed) {
      errors.push(`Regel ${index + 1}: ${parsed.error}.`);
      return;
    }
    if (entries.some((entry) => entry.url === parsed.url)) return;
    const old = previous.find((entry) => entry.url === parsed.url);
    entries.push(
      old
        ? { ...old, raw }
        : {
            id: createHash("sha1").update(parsed.url).digest("hex").slice(0, 10),
            raw,
            ...parsed,
            lastUsed: null,
            lastOk: null,
            lastError: null,
            lastErrorAt: null,
            failStreak: 0,
            cooldownUntil: 0,
            exitIp: null,
            latencyMs: null,
            testedAt: null,
            testError: null,
            leaks: false,
          },
    );
  });
  return { entries, errors };
}

export function getProxies(): ProxyEntry[] {
  const s = store();
  s.proxies ??= buildEntries(getSettings().proxies, []).entries;
  return s.proxies;
}

export function proxyText(): string {
  return getProxies()
    .map((entry) => entry.raw)
    .join("\n");
}

export function saveProxyText(text: string): { errors: string[]; count: number } {
  const { entries, errors } = buildEntries(text.split(/\r?\n/), getProxies());
  if (errors.length) return { errors, count: 0 };
  saveSettings({ proxies: entries.map((entry) => entry.raw) });
  const s = store();
  s.proxies = entries;
  s.proxyCursor = 0;
  changed();
  return { errors: [], count: entries.length };
}

const agents = new Map<string, Agent>();

function agentFor(entry: ProxyEntry): Agent {
  let agent = agents.get(entry.url);
  if (!agent) {
    agent = entry.protocol.startsWith("socks") ? new SocksProxyAgent(entry.url) : new HttpsProxyAgent(entry.url);
    agents.set(entry.url, agent);
  }
  return agent;
}

export function friendlyError(error: unknown): string {
  const err = error as NodeJS.ErrnoException;
  const byCode: Record<string, string> = {
    ECONNREFUSED: "verbinding geweigerd",
    ECONNRESET: "verbinding verbroken",
    EPIPE: "verbinding verbroken",
    ETIMEDOUT: "geen antwoord (time-out)",
    ENOTFOUND: "adres niet gevonden",
    EAI_AGAIN: "adres niet gevonden",
    EHOSTUNREACH: "host onbereikbaar",
    ENETUNREACH: "netwerk onbereikbaar",
    EPROXY407: "proxy vraagt om een gebruikersnaam en wachtwoord (407)",
  };
  if (err?.code && byCode[err.code]) return byCode[err.code];
  const message = err?.message ?? String(error);
  if (/authentication/i.test(message)) return "inloggen bij de proxy mislukt";
  if (/timed? ?out/i.test(message)) return "geen antwoord (time-out)";
  return message;
}

export class NoRouteError extends Error {}

function recordUsage(result: HttpResult): void {
  if (result.wireBytes) store().usage.proxyBytes += result.wireBytes;
}

/** GET via één bepaalde proxy, met hergebruik van de TLS-sessie voor die proxy en die website. */
async function getViaProxy(entry: ProxyEntry, url: string, options: Omit<HttpOptions, "agent">): Promise<HttpResult> {
  const sessions = store().tlsSessions;
  const key = `${entry.url}|${new URL(url).hostname}`;
  const result = await httpGet(url, {
    ...options,
    agent: agentFor(entry),
    session: sessions.get(key),
    onSession: (session) => sessions.set(key, session),
  });
  recordUsage(result);
  return result;
}

/**
 * Haalt een adres op via de proxy's, om de beurt. Werkt een proxy niet, dan volgt de volgende.
 * Zijn er proxy's ingesteld, dan gaat er NOOIT een verzoek via je eigen IP.
 */
export async function fetchVia(
  url: string,
  headers: Record<string, string>,
  options: Omit<HttpOptions, "agent" | "headers"> & { maxAttempts?: number } = {},
): Promise<HttpResult & { via: string }> {
  const { maxAttempts = 3, ...httpOptions } = options;
  const proxies = getProxies();
  if (proxies.length === 0) {
    return { ...(await httpGet(url, { ...httpOptions, headers })), via: "je eigen IP" };
  }

  const usable = proxies.filter((entry) => !entry.leaks);
  if (usable.length === 0) {
    throw new NoRouteError("alle proxy's lieten bij de test je eigen IP-adres zien; overgeslagen om je IP te beschermen");
  }
  // Om de beurt over de werkende proxy's; proxy's die na een fout even rusten komen pas als laatste aan bod.
  const s = store();
  const now = Date.now();
  const ready = usable.filter((entry) => entry.cooldownUntil <= now);
  const resting = usable.filter((entry) => entry.cooldownUntil > now).sort((a, b) => a.cooldownUntil - b.cooldownUntil);
  const start = ready.length ? s.proxyCursor % ready.length : 0;
  s.proxyCursor = (s.proxyCursor + 1) % 1_000_000;
  const attempts = [...ready.slice(start), ...ready.slice(0, start), ...resting].slice(0, maxAttempts);

  const failures: string[] = [];
  for (const entry of attempts) {
    // Nummer in de lijst erbij: proxy's van één leverancier hebben vaak allemaal hetzelfde adres.
    const name = `proxy ${proxies.indexOf(entry) + 1}, ${entry.label}`;
    entry.lastUsed = Date.now();
    try {
      const result = await getViaProxy(entry, url, { ...httpOptions, headers });
      entry.lastOk = Date.now();
      if (entry.failStreak > 0) {
        entry.failStreak = 0;
        entry.cooldownUntil = 0;
        changed();
      }
      return { ...result, via: name };
    } catch (error) {
      const reason = friendlyError(error);
      entry.failStreak += 1;
      entry.lastError = reason;
      entry.lastErrorAt = Date.now();
      entry.cooldownUntil = Date.now() + Math.min(MAX_COOLDOWN_MIN, 2 ** (entry.failStreak - 1)) * 60_000;
      changed();
      failures.push(`${name}: ${reason}`);
    }
  }
  throw new NoRouteError(`geen proxy bereikbaar (${failures.join("; ")}); overgeslagen zodat je eigen IP niet gebruikt wordt`);
}

const IP_SERVICES = [
  { url: "https://api.ipify.org?format=json", read: (text: string) => String(JSON.parse(text).ip) },
  { url: "https://icanhazip.com/", read: (text: string) => text.trim() },
];

async function lookupIp(entry?: ProxyEntry): Promise<{ ip: string; ms: number }> {
  let lastError: unknown = new Error("geen IP-dienst bereikbaar");
  for (const service of IP_SERVICES) {
    const started = Date.now();
    try {
      const options = { headers: { "User-Agent": BROWSER_UA, Accept: "*/*" }, timeoutMs: 12_000, maxBytes: 10_000 };
      const res = entry ? await getViaProxy(entry, service.url, options) : await httpGet(service.url, options);
      if (res.status !== 200) throw new Error(`IP-dienst gaf HTTP ${res.status}`);
      const ip = service.read(res.body.toString("utf8"));
      if (!/^[0-9a-f.:]+$/i.test(ip)) throw new Error("onverwacht antwoord van de IP-dienst");
      return { ip, ms: Date.now() - started };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Test elke proxy: welk IP-adres ziet de buitenwereld, en hoe snel is hij? */
export async function testProxies(): Promise<{ working: number; total: number }> {
  const s = store();
  const proxies = getProxies();
  try {
    s.ownIp = (await lookupIp()).ip;
  } catch {
    s.ownIp = null;
  }
  await Promise.all(
    proxies.map(async (entry) => {
      try {
        const { ip, ms } = await lookupIp(entry);
        entry.exitIp = ip;
        entry.latencyMs = ms;
        entry.leaks = s.ownIp !== null && ip === s.ownIp;
        entry.testError = entry.leaks ? "laat je eigen IP-adres zien, wordt niet gebruikt" : null;
        if (!entry.leaks) {
          entry.failStreak = 0;
          entry.cooldownUntil = 0;
        }
      } catch (error) {
        entry.exitIp = null;
        entry.latencyMs = null;
        entry.testError = friendlyError(error);
      }
      entry.testedAt = Date.now();
    }),
  );
  changed();
  const working = proxies.filter((entry) => !entry.testError).length;
  log(working === proxies.length ? "ok" : "warn", `Proxy-test: ${working} van ${proxies.length} werken`);
  return { working, total: proxies.length };
}
