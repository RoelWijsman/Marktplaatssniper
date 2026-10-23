import { clearFinds } from "@/lib/actions";
import { stateResponse } from "@/lib/state";

export function DELETE() {
  return stateResponse(clearFinds());
}
