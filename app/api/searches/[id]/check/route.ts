import { runCheckNow } from "@/lib/monitor";
import { stateResponse } from "@/lib/state";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return stateResponse(await runCheckNow(Number(id)));
}
