import type { Notice, PublicState } from "./types";

export interface ApiResult {
  state?: PublicState;
  notice?: Notice;
  errors?: string[];
}

export async function api(path: string, method = "GET", body?: unknown): Promise<ApiResult> {
  const res = await fetch(path, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as ApiResult;
  if (!res.ok) return { errors: data.errors?.length ? data.errors : [`Er ging iets mis (HTTP ${res.status}).`] };
  return data;
}

/** Foto's gaan via de eigen server (en dus via je proxy). */
export function imageSrc(url: string): string {
  return url ? `/api/image?u=${encodeURIComponent(url)}` : "";
}
