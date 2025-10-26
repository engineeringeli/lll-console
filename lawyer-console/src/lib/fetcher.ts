import type { ApiError } from "@/types";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let data: unknown;
  try { data = await res.json(); } catch { data = undefined; }

  if (!res.ok) {
    const msg =
      (typeof data === "object" &&
        data !== null &&
        "detail" in data &&
        typeof (data as ApiError).detail === "string" &&
        (data as ApiError).detail) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}
