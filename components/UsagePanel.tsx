"use client";

import { checksPerDay, formatBytes, plural } from "@/lib/format";
import type { PublicState } from "@/lib/types";
import type { Run } from "./SniperApp";

const INTERVALS = [1, 2, 5, 10, 15];
const ESTIMATE_PER_CHECK = 23 * 1024; // gemeten via een proxy; geldt tot er eigen metingen zijn

interface Props {
  settings: PublicState["settings"];
  usage: PublicState["usage"];
  activeSearches: number;
  hasProxies: boolean;
  busy: ReadonlySet<string>;
  run: Run;
}

export default function UsagePanel({ settings, usage, activeSearches, hasProxies, busy, run }: Props) {
  const saving = busy.has("settings");
  const measured = usage.checks >= 3;
  const perCheck = measured ? usage.checkBytes / usage.checks : ESTIMATE_PER_CHECK;
  const perDay = perCheck * checksPerDay(settings.intervalMin, settings.quietNights) * activeSearches;
  const save = (patch: Partial<PublicState["settings"]>) => void run("settings", "/api/settings", "PUT", patch);

  return (
    <div className="block">
      <h2 className="block-title">Dataverbruik</h2>
      <div className="usage-controls">
        <label className="field">
          <span>Hoe vaak checken</span>
          <select value={settings.intervalMin} disabled={saving} onChange={(e) => save({ intervalMin: Number(e.target.value) })}>
            {INTERVALS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 1 ? "Elke minuut" : `Elke ${minutes} minuten`}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.quietNights}
            disabled={saving}
            onChange={(e) => save({ quietNights: e.target.checked })}
          />
          <span>’s Nachts rustiger: tussen 01:00 en 07:00 hooguit elke 10 minuten</span>
        </label>
      </div>

      <div className="usage-estimate">
        {activeSearches === 0 ? (
          <p className="hint">Er zijn geen actieve zoekopdrachten, dus er wordt nu niets verbruikt.</p>
        ) : (
          <>
            <p className="usage-figure">
              <strong>± {formatBytes(perDay)}</strong> per dag
            </p>
            <p className="hint">
              Ongeveer {formatBytes(perDay * 30)} per maand voor{" "}
              {plural(activeSearches, "actieve zoekopdracht", "actieve zoekopdrachten")}, {formatBytes(perCheck)} per check
              {measured ? " (gemeten)" : " (schatting)"}.{!hasProxies && " Dit gaat nu via je eigen verbinding."}
            </p>
          </>
        )}
        {usage.proxyBytes > 0 && (
          <p className="hint">Sinds de start via je proxy&apos;s: {formatBytes(usage.proxyBytes)}, inclusief foto&apos;s en tests.</p>
        )}
      </div>
    </div>
  );
}
