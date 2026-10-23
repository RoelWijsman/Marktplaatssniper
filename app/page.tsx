import SniperApp from "@/components/SniperApp";
import { ensureMonitor } from "@/lib/monitor";
import { publicState } from "@/lib/state";

export const dynamic = "force-dynamic";

export default function Page() {
  ensureMonitor();
  return <SniperApp initial={publicState()} />;
}
