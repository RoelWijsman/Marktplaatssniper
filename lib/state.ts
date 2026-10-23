import os from "node:os";
import { getProxies } from "./proxies";
import { getSettings } from "./settings";
import { store } from "./store";
import type { Notice, PublicState } from "./types";

/** Adres waarop je de pagina op je telefoon opent (zelfde wifi). */
function phoneUrl(): string | null {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a!.address);
  const rank = (ip: string) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 9);
  const best = addresses.filter((ip) => rank(ip) < 9).sort((a, b) => rank(a) - rank(b))[0];
  return best ? `http://${best}:${process.env.PORT || 3000}` : null;
}

export function publicState(): PublicState {
  const s = store();
  const proxies = getProxies();
  const { intervalMin, quietNights } = getSettings();
  return {
    version: s.version,
    serverNow: Date.now(),
    settings: { intervalMin, quietNights },
    usage: { ...s.usage },
    blockedUntil: s.blockedUntil,
    searches: [...s.searches.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ seen: _seen, initialized: _initialized, window: _window, ...rest }) => rest),
    finds: s.finds,
    logs: s.logs.slice(0, 150),
    proxies: proxies.map(({ url: _url, raw: _raw, ...rest }, index) => ({ ...rest, number: index + 1 })),
    ownIp: s.ownIp,
    phoneUrl: phoneUrl(),
  };
}

const noStore = { "Cache-Control": "no-store" };

export function stateResponse(notice?: Notice): Response {
  return Response.json({ state: publicState(), notice }, { headers: noStore });
}

export function errorResponse(errors: string[], status = 400): Response {
  return Response.json({ errors }, { status, headers: noStore });
}
