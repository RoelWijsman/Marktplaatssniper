import { createSearch, type SearchInput } from "@/lib/actions";
import { ensureMonitor } from "@/lib/monitor";
import { errorResponse, stateResponse } from "@/lib/state";

export async function POST(request: Request) {
  ensureMonitor();
  const input = (await request.json().catch(() => ({}))) as SearchInput;
  const result = await createSearch(input);
  if ("errors" in result) return errorResponse(result.errors);
  return stateResponse(result.notice);
}
