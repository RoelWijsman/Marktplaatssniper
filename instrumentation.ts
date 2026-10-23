// Next.js roept register() één keer aan bij het opstarten van de server: daar starten we de monitor.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { ensureMonitor } = await import("./lib/monitor");
    ensureMonitor();
  }
}
