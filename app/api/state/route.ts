import { ensureMonitor } from "@/lib/monitor";
import { publicState } from "@/lib/state";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

// De pagina vraagt dit elke paar seconden op; met ?since=<versie> komt er 204 terug als er niets veranderd is.
export function GET(request: Request) {
  ensureMonitor();
  const since = new URL(request.url).searchParams.get("since");
  if (since !== null && since === String(store().version)) return new Response(null, { status: 204 });
  return Response.json(publicState(), { headers: { "Cache-Control": "no-store" } });
}
