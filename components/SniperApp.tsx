"use client";

import { Bell, BellRing, ScrollText, Search as SearchIcon, ShieldAlert, ShieldCheck, Smartphone, Tag, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiResult } from "@/lib/client";
import { clock, countdown, plural } from "@/lib/format";
import type { Notice, PublicState } from "@/lib/types";
import FindFeed from "./FindFeed";
import LogPanel from "./LogPanel";
import ProxyPanel from "./ProxyPanel";
import SearchPanel from "./SearchPanel";
import UsagePanel from "./UsagePanel";

export type Tab = "finds" | "searches" | "proxies" | "log";
export type Run = (key: string, path: string, method: string, body?: unknown) => Promise<ApiResult>;

const SEEN_KEY = "marktplaats-sniper:seen-until";
const POLL_MS = 3_000;

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <g transform="rotate(-8 16 16)" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3.5 13 9.5 7.5H27a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H9.5l-6-5.5z" fill="var(--tag)" />
        <circle cx="9.6" cy="16" r="1.3" fill="var(--fog)" />
        <circle cx="19.5" cy="16" r="4.2" fill="none" />
        <path d="M19.5 9.8v2.4M19.5 19.8v2.4M13.3 16h2.4M23.3 16h2.4" fill="none" />
      </g>
    </svg>
  );
}

export default function SniperApp({ initial }: { initial: PublicState }) {
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(initial.serverNow);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [tab, setTab] = useState<Tab>(initial.searches.length ? "finds" : "searches");
  const [seenUntil, setSeenUntil] = useState(Number.POSITIVE_INFINITY); // vóór het laden niets als nieuw markeren
  const [mountedAt, setMountedAt] = useState(Number.POSITIVE_INFINITY);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [isLocal, setIsLocal] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const versionRef = useRef(initial.version);
  const notifiedRef = useRef(Math.max(0, ...initial.finds.map((f) => f.foundAt)));

  const apply = useCallback((next: PublicState) => {
    versionRef.current = next.version;
    setData(next);
  }, []);

  // Klok (gelijkgezet met de server) en dingen die alleen in de browser bestaan.
  useEffect(() => {
    const offset = initial.serverNow - Date.now();
    setMountedAt(Date.now() + offset);
    setSeenUntil(readSeen());
    setIsLocal(["localhost", "127.0.0.1", "[::1]"].includes(location.hostname));
    if ("Notification" in window && window.isSecureContext) setPermission(Notification.permission);
    const timer = setInterval(() => setNow(Date.now() + offset), 1_000);
    return () => clearInterval(timer);
  }, [initial.serverNow]);

  // Elke paar seconden kijken of er iets veranderd is.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/state?since=${versionRef.current}`, { cache: "no-store" });
        if (res.status === 200 && !cancelled) apply((await res.json()) as PublicState);
        if (!cancelled) setOffline(!res.ok && res.status !== 204);
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => !document.hidden && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [apply]);

  // Nieuwe vondsten: browsermelding, en het aantal ongeziene in de tabtitel.
  useEffect(() => {
    const latest = Math.max(0, ...data.finds.map((f) => f.foundAt));
    const fresh = data.finds.filter((f) => f.foundAt > notifiedRef.current);
    notifiedRef.current = Math.max(notifiedRef.current, latest);
    if (fresh.length && permission === "granted") {
      for (const find of fresh.slice(0, 3)) {
        const n = new Notification(find.notifyTitle, { body: `Via “${find.query}”`, tag: find.key });
        n.onclick = () => {
          window.open(find.url, "_blank", "noopener");
          n.close();
        };
      }
    }
    const updateTitle = () => {
      const stored = readSeen();
      if (!document.hidden) {
        try {
          localStorage.setItem(SEEN_KEY, String(Math.max(stored, latest)));
        } catch {}
        document.title = "Marktplaats Sniper";
      } else {
        const unseen = data.finds.filter((f) => f.foundAt > stored).length;
        document.title = unseen ? `(${unseen}) Marktplaats Sniper` : "Marktplaats Sniper";
      }
    };
    updateTitle();
    document.addEventListener("visibilitychange", updateTitle);
    return () => document.removeEventListener("visibilitychange", updateTitle);
  }, [data.finds, permission]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.level === "error" ? 12_000 : 7_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const run: Run = useCallback(
    async (key, path, method, body) => {
      setBusy((current) => new Set(current).add(key));
      try {
        const result = await api(path, method, body);
        if (result.state) apply(result.state);
        if (result.notice) setNotice(result.notice);
        return result;
      } catch {
        setNotice({ level: "error", message: "De app reageert niet. Staat het venster van start-windows.bat nog open?" });
        return { errors: ["De app reageert niet."] };
      } finally {
        setBusy((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [apply],
  );

  const askPermission = async () => {
    if (permission === "unsupported") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") setNotice({ level: "ok", message: "Meldingen staan aan. Je krijgt er een bij elke nieuwe vondst." });
    if (result === "denied") setNotice({ level: "warn", message: "Meldingen zijn geblokkeerd. Je kunt ze aanzetten via het slotje naast het adres." });
  };

  const active = data.searches.filter((s) => s.active);
  const nextDue = active.reduce<number | null>(
    (min, s) => (s.nextCheck !== null && (min === null || s.nextCheck < min) ? s.nextCheck : min),
    null,
  );
  const blocked = data.blockedUntil > now;
  const usableProxies = data.proxies.filter((p) => !p.leaks).length;
  const unseenCount = data.finds.filter((f) => f.foundAt > seenUntil).length;

  let live: { tone: string; title: string; detail: string | null };
  if (offline) live = { tone: "error", title: "Geen verbinding met de app", detail: null };
  else if (blocked) live = { tone: "warn", title: `Pauze tot ${clock(data.blockedUntil)}`, detail: "Marktplaats gaf HTTP 429" };
  else if (!active.length) live = { tone: "idle", title: "Wacht op een zoekopdracht", detail: null };
  else live = { tone: "on", title: "Kijkt mee", detail: nextDue !== null ? `volgende check over ${countdown(nextDue - now)}` : null };

  const openProxies = () => {
    setTab("proxies");
    if (!data.proxies.length) setEditorOpen(true);
    else document.getElementById("proxies")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number; alert?: boolean }[] = [
    { id: "finds", label: "Gevonden", icon: <Tag />, badge: unseenCount },
    { id: "searches", label: "Zoeken", icon: <SearchIcon /> },
    { id: "proxies", label: "Proxy's", icon: usableProxies ? <ShieldCheck /> : <ShieldAlert />, alert: !usableProxies },
    { id: "log", label: "Logboek", icon: <ScrollText /> },
  ];

  return (
    <div className="shell" data-tab={tab}>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="brand-name">Marktplaats Sniper</span>
        </div>
        <div className="topbar-right">
          <div className={`live tone-${live.tone}`}>
            <span className="dot" aria-hidden="true" />
            <b>{live.title}</b>
            {live.detail && <span className="live-detail">{live.detail}</span>}
          </div>
          <button
            type="button"
            className={`route ${usableProxies ? "safe" : "exposed"}`}
            onClick={openProxies}
            aria-label={usableProxies ? `Via ${plural(usableProxies, "proxy", "proxy's")}` : "Je eigen IP is zichtbaar"}
          >
            {usableProxies ? <ShieldCheck /> : <ShieldAlert />}
            <span className="route-label">
              {usableProxies ? `Via ${plural(usableProxies, "proxy", "proxy's")}` : "Eigen IP zichtbaar"}
            </span>
          </button>
          {permission !== "unsupported" && (
            <button
              type="button"
              className={`icon-btn${permission === "granted" ? " on" : ""}`}
              onClick={askPermission}
              title={permission === "granted" ? "Meldingen staan aan" : "Meldingen aanzetten"}
              aria-label={permission === "granted" ? "Meldingen staan aan" : "Meldingen aanzetten"}
            >
              {permission === "granted" ? <BellRing /> : <Bell />}
            </button>
          )}
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <section className="panel" data-panel="searches" id="zoeken">
            <SearchPanel
              searches={data.searches}
              now={now}
              blockedUntil={data.blockedUntil}
              busy={busy}
              run={run}
            />
          </section>
          <section className="panel" data-panel="proxies" id="proxies">
            <ProxyPanel
              proxies={data.proxies}
              ownIp={data.ownIp}
              now={now}
              busy={busy}
              run={run}
              editorOpen={editorOpen}
              setEditorOpen={setEditorOpen}
            />
            <UsagePanel
              settings={data.settings}
              usage={data.usage}
              activeSearches={active.length}
              hasProxies={data.proxies.length > 0}
              busy={busy}
              run={run}
            />
          </section>
          <section className="panel" data-panel="log" id="logboek">
            <LogPanel logs={data.logs} now={now} />
          </section>
          {isLocal && data.phoneUrl && (
            <p className="rail-foot">
              <Smartphone aria-hidden="true" />
              <span>
                Op je telefoon, via hetzelfde wifi: <a href={data.phoneUrl}>{data.phoneUrl.replace("http://", "")}</a>
              </span>
            </p>
          )}
        </aside>

        <main className="panel feed" data-panel="finds">
          <FindFeed
            finds={data.finds}
            hasSearches={data.searches.length > 0}
            intervalMin={data.settings.intervalMin}
            now={now}
            seenUntil={seenUntil}
            mountedAt={mountedAt}
            busy={busy}
            run={run}
            onAddSearch={() => {
              setTab("searches");
              requestAnimationFrame(() => document.getElementById("query")?.focus());
            }}
          />
        </main>
      </div>

      <nav className="tabbar" aria-label="Onderdelen">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => {
              setTab(t.id);
              window.scrollTo({ top: 0 });
            }}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
            {t.alert ? <span className="tab-alert" aria-label="let op" /> : null}
          </button>
        ))}
      </nav>

      {notice && (
        <div className={`toast level-${notice.level}`} role="status">
          <span className="dot" aria-hidden="true" />
          <p>{notice.message}</p>
          <button type="button" className="toast-close" onClick={() => setNotice(null)} aria-label="Melding sluiten">
            <X />
          </button>
        </div>
      )}
    </div>
  );
}
