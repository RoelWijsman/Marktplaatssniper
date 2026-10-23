import { BROWSER_UA } from "@/lib/http";
import { fetchVia } from "@/lib/proxies";

// Foto's lopen via de server (en dus via je proxy), zodat Marktplaats ook bij het bekijken
// van de lijst niet jouw IP-adres ziet.
const ALLOWED_HOSTS = new Set(["images.marktplaats.com", "i.ebayimg.com"]);
const MAX_CACHED = 200;
const cache = new Map<string, { type: string; body: Buffer }>();

function imageResponse(entry: { type: string; body: Buffer }) {
  return new Response(new Uint8Array(entry.body), {
    headers: { "Content-Type": entry.type, "Cache-Control": "private, max-age=86400" },
  });
}

export async function GET(request: Request) {
  let target: URL;
  try {
    target = new URL(new URL(request.url).searchParams.get("u") ?? "");
  } catch {
    return new Response("Ongeldig adres", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Response("Alleen foto's van Marktplaats", { status: 400 });
  }

  const cached = cache.get(target.href);
  if (cached) {
    cache.delete(target.href);
    cache.set(target.href, cached);
    return imageResponse(cached);
  }

  try {
    const res = await fetchVia(
      target.href,
      { "User-Agent": BROWSER_UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8", Referer: "https://www.marktplaats.nl/" },
      { timeoutMs: 15_000, maxBytes: 8_000_000, maxAttempts: 2 },
    );
    const type = String(res.headers["content-type"] ?? "");
    if (res.status !== 200 || !type.startsWith("image/")) return new Response("Foto niet beschikbaar", { status: 502 });
    const entry = { type, body: res.body };
    cache.set(target.href, entry);
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
    return imageResponse(entry);
  } catch {
    return new Response("Foto niet beschikbaar", { status: 502 });
  }
}
