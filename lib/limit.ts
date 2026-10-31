import "server-only";

/** Small in-memory rate limit: `max` attempts per `windowMs` per key. */
const g = globalThis as unknown as { __sealedLimits?: Map<string, number[]> };
const hits = (g.__sealedLimits ??= new Map<string, number[]>());
export function limited(key: string, max = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}
export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
