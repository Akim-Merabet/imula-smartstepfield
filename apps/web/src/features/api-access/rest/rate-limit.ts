/**
 * Limitation de débit simple en mémoire (fenêtre fixe d'une minute), par clé (client API ou IP).
 * Suffisant pour une instance unique ; pour plusieurs instances, remplacer par un compteur partagé.
 */
type Bucket = { count: number; resetAt: number };

const store: Map<string, Bucket> = ((globalThis as { __apiRateLimit?: Map<string, Bucket> }).__apiRateLimit ??= new Map());

export const RATE_LIMITS = {
  /** Requêtes par minute et par client API. */
  perClient: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 600),
  /** Tentatives d'authentification par minute et par IP (anti force brute). */
  authPerIp: Number(process.env.API_RATE_LIMIT_AUTH_PER_MINUTE ?? 30),
};

export function hitRateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()) {
  if (store.size > 10_000) {
    for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
  }
  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}
