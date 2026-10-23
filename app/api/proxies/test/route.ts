import { getProxies, testProxies } from "@/lib/proxies";
import { stateResponse } from "@/lib/state";

export async function POST() {
  if (getProxies().length === 0) {
    return stateResponse({ level: "warn", message: "Er zijn nog geen proxy's om te testen." });
  }
  const { working, total } = await testProxies();
  const level = working === total ? "ok" : working === 0 ? "error" : "warn";
  const message =
    working === total
      ? `Alle ${total === 1 ? "proxy werkt" : `${total} proxy's werken`}.`
      : `${working} van ${total} proxy's werken. Bekijk de details hieronder.`;
  return stateResponse({ level, message });
}
