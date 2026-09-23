/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Suitable for abuse-resistant single-instance deployments (the current shape
 * of this app). It protects unauthenticated, credential-neutral endpoints such
 * as forgot-password / reset-password from scripted abuse without a Redis
 * dependency. For multi-instance deployments, swap the store for a shared one
 * (Redis/Upstash) behind the same `checkRateLimit` interface.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Opportunistic sweep so long-lived processes don't grow the map forever.
const SWEEP_EVERY_MS = 60_000
let lastSweep = Date.now()

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitConfig {
  /** Unique scope, e.g. 'forgot-password'. Combined with the identifier key. */
  scope: string
  /** Maximum requests allowed inside the window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Milliseconds until the window resets (0 when allowed). */
  retryAfterMs: number
}

/**
 * Check + record one hit for `identifier` (e.g. client IP or email) inside a
 * named scope. Returns whether the request is allowed.
 */
export function checkRateLimit(config: RateLimitConfig, identifier: string): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const key = `${config.scope}:${identifier}`
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }

  bucket.count += 1
  if (bucket.count > config.limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now }
  }
  return { allowed: true, retryAfterMs: 0 }
}

/** Best-effort client IP from a Next.js request (for rate-limit keying). */
export function clientIp(req: Request): string {
  const headers = req.headers
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}
