"use client";

import { LoaderCircle, Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { clock, countdown, criteriaText } from "@/lib/format";
import type { PublicSearch } from "@/lib/types";
import type { Run } from "./SniperApp";

const DISTANCES = [3, 5, 10, 15, 25, 50, 75, 100];

interface Props {
  searches: PublicSearch[];
  now: number;
  blockedUntil: number;
  busy: ReadonlySet<string>;
  run: Run;
}

export default function SearchPanel({ searches, now, blockedUntil, busy, run }: Props) {
  const [query, setQuery] = useState("");
  const [postcode, setPostcode] = useState(searches[0]?.postcode ?? "");
  const [distanceKm, setDistanceKm] = useState(searches[0]?.distanceKm ?? 10);
  const [maxPrice, setMaxPrice] = useState("");
  const [includeNoPrice, setIncludeNoPrice] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const creating = busy.has("create");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await run("create", "/api/searches", "POST", { query, postcode, distanceKm, maxPrice, includeNoPrice });
    setErrors(result.errors ?? []);
    if (!result.errors) {
      setQuery("");
      setMaxPrice("");
    }
  };

  return (
    <>
      <div className="block">
        <h2 className="block-title">Nieuwe zoekopdracht</h2>
        <form className="search-form" onSubmit={submit} noValidate>
          <label className="field">
            <span>Zoekterm</span>
            <input
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="bijvoorbeeld gazelle damesfiets"
              maxLength={100}
              autoComplete="off"
              required
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Postcode</span>
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="1234AB"
                maxLength={7}
                autoComplete="postal-code"
                autoCapitalize="characters"
                required
              />
            </label>
            <label className="field">
              <span>Max afstand</span>
              <select value={distanceKm} onChange={(e) => setDistanceKm(Number(e.target.value))}>
                {DISTANCES.map((km) => (
                  <option key={km} value={km}>
                    {km} km
                  </option>
                ))}
                <option value={0}>Heel Nederland</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Max prijs</span>
            <span className="money">
              <span aria-hidden="true">€</span>
              <input
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                inputMode="decimal"
                placeholder="150"
                autoComplete="off"
                required
              />
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={includeNoPrice} onChange={(e) => setIncludeNoPrice(e.target.checked)} />
            <span>Ook advertenties zonder prijs, zoals “Bieden” en “Zie omschrijving”</span>
          </label>
          {errors.length > 0 && (
            <ul className="form-errors" role="alert">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <button type="submit" className="btn primary block" disabled={creating}>
            {creating ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {creating ? "Startpunt zetten…" : "Start zoekopdracht"}
          </button>
        </form>
      </div>

      <div className="block">
        <h2 className="block-title">
          Zoekopdrachten <span className="count">{searches.length}</span>
        </h2>
        {searches.length === 0 ? (
          <p className="hint">Nog geen zoekopdrachten. Je eerste staat binnen een paar seconden klaar.</p>
        ) : (
          <ul className="search-list">
            {searches.map((s) => (
              <SearchItem key={s.id} search={s} now={now} blockedUntil={blockedUntil} busy={busy} run={run} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function SearchItem({ search: s, now, blockedUntil, busy, run }: { search: PublicSearch } & Omit<Props, "searches">) {
  const toggling = busy.has(`toggle:${s.id}`);
  const checking = busy.has(`check:${s.id}`);

  let timing = s.lastCheck ? `laatste check ${clock(s.lastCheck)}` : "nog niet gecheckt";
  if (s.active) {
    if (blockedUntil > now) timing += `, volgende na ${clock(blockedUntil)}`;
    else if (s.nextCheck !== null) timing += `, volgende over ${countdown(s.nextCheck - now)}`;
  }

  const remove = () => {
    if (window.confirm(`Zoekopdracht “${s.query}” verwijderen? De vondsten ervan verdwijnen ook.`)) {
      void run(`delete:${s.id}`, `/api/searches/${s.id}`, "DELETE");
    }
  };

  return (
    <li className={`search${s.active ? "" : " paused"}`}>
      <div className="search-head">
        <strong className="search-query">{s.query}</strong>
        <span className={`state ${s.active ? "on" : "off"}`}>{s.active ? "Actief" : "Gepauzeerd"}</span>
      </div>
      <p className="search-criteria">{criteriaText(s)}</p>
      <p className={`search-status level-${s.lastLevel ?? "info"}`}>{s.lastStatus ?? "Wacht op de eerste check"}</p>
      <p className="search-meta">
        <b>{s.foundCount}</b> gevonden, {timing}
      </p>
      <div className="search-actions">
        <button
          type="button"
          className="btn small"
          disabled={toggling}
          onClick={() => void run(`toggle:${s.id}`, `/api/searches/${s.id}`, "PATCH", { active: !s.active })}
        >
          {s.active ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {s.active ? "Pauzeer" : "Hervat"}
        </button>
        <button
          type="button"
          className="btn small"
          disabled={checking}
          onClick={() => void run(`check:${s.id}`, `/api/searches/${s.id}/check`, "POST")}
        >
          <RefreshCw className={checking ? "spin" : undefined} aria-hidden="true" />
          Nu checken
        </button>
        <button type="button" className="btn small danger" disabled={busy.has(`delete:${s.id}`)} onClick={remove}>
          <Trash2 aria-hidden="true" />
          Verwijder
        </button>
      </div>
    </li>
  );
}
