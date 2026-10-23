"use client";

import { LoaderCircle, Pencil, Plus, Radar, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clock } from "@/lib/format";
import type { PublicProxy } from "@/lib/types";
import type { Run } from "./SniperApp";

interface Props {
  proxies: PublicProxy[];
  ownIp: string | null;
  now: number;
  busy: ReadonlySet<string>;
  run: Run;
  editorOpen: boolean;
  setEditorOpen: (open: boolean) => void;
}

function proxyStatus(p: PublicProxy, now: number): { tone: "ok" | "warn" | "error" | "idle"; text: string } {
  if (p.leaks) return { tone: "error", text: "Laat je eigen IP-adres zien, wordt niet gebruikt" };
  if (p.cooldownUntil > now) return { tone: "warn", text: `Rust tot ${clock(p.cooldownUntil)}: ${p.lastError ?? "fout"}` };
  if (p.testError) return { tone: "error", text: `Test mislukt: ${p.testError}` };
  if (p.failStreak > 0) return { tone: "warn", text: p.lastError ?? "Laatste poging mislukt" };
  if (p.exitIp) return { tone: "ok", text: `Werkt. Marktplaats ziet ${p.exitIp}${p.latencyMs ? `, ${p.latencyMs} ms` : ""}` };
  if (p.lastOk) return { tone: "ok", text: `Werkt, laatst gebruikt om ${clock(p.lastOk)}` };
  return { tone: "idle", text: "Nog niet gebruikt" };
}

export default function ProxyPanel({ proxies, ownIp, now, busy, run, editorOpen, setEditorOpen }: Props) {
  const testing = busy.has("proxy-test");

  return (
    <div className="block">
      <div className="block-title-row">
        <h2 className="block-title">
          Proxy&apos;s <span className="count">{proxies.length}</span>
        </h2>
        <div className="row-actions">
          {proxies.length > 0 && (
            <button type="button" className="btn small" disabled={testing} onClick={() => void run("proxy-test", "/api/proxies/test", "POST")}>
              {testing ? <LoaderCircle className="spin" aria-hidden="true" /> : <Radar aria-hidden="true" />}
              {testing ? "Testen…" : "Test"}
            </button>
          )}
          <button type="button" className="btn small" onClick={() => setEditorOpen(true)}>
            {proxies.length ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {proxies.length ? "Bewerken" : "Toevoegen"}
          </button>
        </div>
      </div>

      {proxies.length === 0 ? (
        <div className="exposed">
          <ShieldAlert aria-hidden="true" />
          <div>
            <p>
              <b>Marktplaats ziet nu je eigen IP-adres.</b>
            </p>
            <p>Voeg een of meer proxy&apos;s toe. Dan gaat elke check via een proxy en nooit meer via je eigen verbinding.</p>
          </div>
        </div>
      ) : (
        <>
          <p className="hint">
            Elke check gaat via de volgende proxy in de lijst. Werkt er geen enkele, dan wordt de check overgeslagen in plaats van je
            eigen IP te gebruiken. Ook de foto&apos;s lopen via je proxy.
          </p>
          <ul className="proxy-list">
            {proxies.map((p) => {
              const status = proxyStatus(p, now);
              return (
                <li key={p.id} className="proxy">
                  <span className={`dot tone-${status.tone}`} aria-hidden="true" />
                  <span className="proxy-name">
                    <span className="proxy-num">{p.number}</span>
                    {p.label}
                    <span className="proxy-kind">
                      {p.protocol === "socks5h" ? "socks5" : p.protocol}
                      {p.hasAuth ? ", met login" : ""}
                    </span>
                  </span>
                  <span className={`proxy-state tone-${status.tone}`}>{status.text}</span>
                </li>
              );
            })}
          </ul>
          {ownIp && (
            <p className="hint ip-note">
              Je eigen IP-adres is {ownIp}. Dat ziet Marktplaats niet, behalve als je zelf een advertentie opent.
            </p>
          )}
        </>
      )}

      <ProxyEditor open={editorOpen} onClose={() => setEditorOpen(false)} run={run} busy={busy} />
    </div>
  );
}

function ProxyEditor({ open, onClose, run, busy }: { open: boolean; onClose: () => void; run: Run; busy: ReadonlySet<string> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const saving = busy.has("proxy-save");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      setErrors([]);
      setLoading(true);
      fetch("/api/proxies", { cache: "no-store" })
        .then((res) => res.json())
        .then((data: { text?: string }) => setText(data.text ?? ""))
        .catch(() => setErrors(["De huidige proxy's konden niet geladen worden."]))
        .finally(() => setLoading(false));
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await run("proxy-save", "/api/proxies", "PUT", { text });
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    onClose();
    if (result.state?.proxies.length) void run("proxy-test", "/api/proxies/test", "POST");
  };

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} aria-labelledby="proxy-dialog-title">
      <form className="dialog-inner" onSubmit={save}>
        <header>
          <h2 id="proxy-dialog-title">Proxy&apos;s instellen</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sluiten">
            <X />
          </button>
        </header>
        <p>
          Eén proxy per regel. Met meerdere proxy&apos;s gaat elke check via de volgende in de lijst. Na het opslaan test de app ze
          meteen.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={loading}
          aria-label="Proxy-adressen, één per regel"
          placeholder={"http://gebruiker:wachtwoord@185.10.20.30:8080\nsocks5://185.10.20.31:1080\n185.10.20.32:3128:gebruiker:wachtwoord"}
        />
        <details className="formats">
          <summary>Welke notaties werken?</summary>
          <ul>
            <li>
              <code>http://host:poort</code> of <code>https://host:poort</code> voor een HTTP-proxy
            </li>
            <li>
              <code>socks5://host:poort</code> voor een SOCKS5-proxy; ook de DNS gaat dan via de proxy
            </li>
            <li>
              Met inloggen: <code>http://gebruiker:wachtwoord@host:poort</code> of <code>host:poort:gebruiker:wachtwoord</code>
            </li>
            <li>Laat het veld leeg om weer zonder proxy te werken. Regels die met # beginnen worden overgeslagen.</li>
          </ul>
        </details>
        {errors.length > 0 && (
          <ul className="form-errors" role="alert">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <footer>
          <button type="button" className="btn" onClick={onClose}>
            Annuleren
          </button>
          <button type="submit" className="btn primary" disabled={saving || loading}>
            {saving && <LoaderCircle className="spin" aria-hidden="true" />}
            Opslaan
          </button>
        </footer>
      </form>
    </dialog>
  );
}
