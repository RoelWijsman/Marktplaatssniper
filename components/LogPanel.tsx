"use client";

import { useState } from "react";
import { moment } from "@/lib/format";
import type { LogEntry } from "@/lib/types";

const COLLAPSED = 8;

export default function LogPanel({ logs, now }: { logs: LogEntry[]; now: number }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? logs : logs.slice(0, COLLAPSED);

  return (
    <div className="block">
      <h2 className="block-title">Logboek</h2>
      {logs.length === 0 ? (
        <p className="hint">Nog niets gebeurd.</p>
      ) : (
        <ol className="log">
          {visible.map((entry) => (
            <li key={entry.id} className={`log-${entry.level}`}>
              <time>{moment(entry.ts, now, true)}</time>
              <span>{entry.message}</span>
            </li>
          ))}
        </ol>
      )}
      {logs.length > COLLAPSED && (
        <button type="button" className="btn quiet small" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Minder tonen" : `Alles tonen (${logs.length})`}
        </button>
      )}
    </div>
  );
}
