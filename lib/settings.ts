import fs from "node:fs";
import path from "node:path";
import { log, store } from "./store";

// Instellingen die een herstart overleven, in data/settings.json.
export interface Settings {
  proxies: string[];
  intervalMin: number;
  quietNights: boolean; // tussen 01:00 en 07:00 hooguit elke 10 minuten
}

export const INTERVAL_OPTIONS = [1, 2, 5, 10, 15];
const FILE = path.join(process.cwd(), "data", "settings.json");
const DEFAULTS: Settings = { proxies: [], intervalMin: 1, quietNights: true };

export function getSettings(): Settings {
  const s = store();
  if (!s.settings) {
    let data: Partial<Settings> = {};
    try {
      data = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<Settings>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log("error", `Instellingen konden niet gelezen worden: ${(error as Error).message}`);
      }
    }
    s.settings = {
      proxies: Array.isArray(data.proxies) ? data.proxies.map(String) : DEFAULTS.proxies,
      intervalMin: INTERVAL_OPTIONS.includes(Number(data.intervalMin)) ? Number(data.intervalMin) : DEFAULTS.intervalMin,
      quietNights: typeof data.quietNights === "boolean" ? data.quietNights : DEFAULTS.quietNights,
    };
  }
  return s.settings;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  store().settings = next;
  return next;
}
