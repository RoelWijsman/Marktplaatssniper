import { deleteSearch, setActive } from "@/lib/actions";
import { errorResponse, stateResponse } from "@/lib/state";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { active?: unknown };
  if (typeof body.active !== "boolean") return errorResponse(["Geef aan of de zoekopdracht actief moet zijn."]);
  return stateResponse(await setActive(Number(id), body.active));
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  return stateResponse(deleteSearch(Number(id)));
}
