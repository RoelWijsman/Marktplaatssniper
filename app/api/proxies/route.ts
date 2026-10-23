import { plural } from "@/lib/format";
import { proxyText, saveProxyText } from "@/lib/proxies";
import { errorResponse, stateResponse } from "@/lib/state";
import { log } from "@/lib/store";

export const dynamic = "force-dynamic";

/** De proxy's zoals ingevuld (met wachtwoord), alleen voor het bewerkvenster. */
export function GET() {
  return Response.json({ text: proxyText() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const { errors, count } = saveProxyText(String(body.text ?? ""));
  if (errors.length) return errorResponse(errors);
  const message = count
    ? `${plural(count, "proxy", "proxy's")} opgeslagen. Marktplaats ziet vanaf nu niet meer je eigen IP-adres.`
    : "Geen proxy's meer ingesteld. De app gebruikt nu je eigen IP-adres.";
  log(count ? "ok" : "warn", count ? `Proxylijst opgeslagen (${plural(count, "proxy", "proxy's")})` : "Proxylijst leeggemaakt");
  return stateResponse({ level: count ? "ok" : "warn", message });
}
