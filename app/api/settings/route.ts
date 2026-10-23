import { reschedule } from "@/lib/monitor";
import { INTERVAL_OPTIONS, saveSettings, type Settings } from "@/lib/settings";
import { errorResponse, stateResponse } from "@/lib/state";
import { log } from "@/lib/store";

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { intervalMin?: unknown; quietNights?: unknown };
  const patch: Partial<Settings> = {};
  if (body.intervalMin !== undefined) {
    const minutes = Number(body.intervalMin);
    if (!INTERVAL_OPTIONS.includes(minutes)) return errorResponse(["Kies hoe vaak er gecheckt moet worden uit de lijst."]);
    patch.intervalMin = minutes;
  }
  if (body.quietNights !== undefined) patch.quietNights = Boolean(body.quietNights);

  const settings = saveSettings(patch);
  reschedule();
  const every = settings.intervalMin === 1 ? "elke minuut" : `elke ${settings.intervalMin} minuten`;
  const nights = settings.quietNights ? ", 's nachts hooguit elke 10 minuten" : "";
  log("info", `Checkfrequentie: ${every}${nights}`);
  return stateResponse({ level: "ok", message: `De app checkt nu ${every}${nights}.` });
}
