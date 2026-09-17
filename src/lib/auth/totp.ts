import crypto from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Encodes bytes as RFC 4648 base32 (no padding), suitable for TOTP secrets. */
export function base32Encode(data: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of data) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

/** Decodes an RFC 4648 base32 secret (case-insensitive, padding optional). */
export function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) throw new Error('Invalid base32 secret')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** Generates a 160-bit random secret, base32-encoded (Google Authenticator compatible). */
export function generateSecret(byteLength = 20): string {
  return base32Encode(crypto.randomBytes(byteLength))
}

function hotp(key: Buffer, counter: bigint, digits = 6): string {
  const counterBuf = Buffer.alloc(8)
  counterBuf.writeBigUInt64BE(counter)
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return (code % 10 ** digits).toString().padStart(digits, '0')
}

/**
 * Generates the current TOTP code (RFC 6238, SHA-1, 30s step, 6 digits).
 * `at` is a millisecond epoch timestamp (defaults to now); exposed for tests.
 */
export function totp(
  secret: string,
  at: number = Date.now(),
  stepSeconds = 30,
  digits = 6
): string {
  const key = base32Decode(secret)
  const counter = BigInt(Math.floor(at / 1000 / stepSeconds))
  return hotp(key, counter, digits)
}

/**
 * Verifies a TOTP code, accepting the current step plus `window` steps of
 * clock drift on either side.
 */
export function verifyTotp(
  token: string,
  secret: string,
  at: number = Date.now(),
  stepSeconds = 30,
  digits = 6,
  window = 1
): boolean {
  const clean = token.trim()
  if (!new RegExp(`^\\d{${digits}}$`).test(clean)) return false
  let key: Buffer
  try {
    key = base32Decode(secret)
  } catch {
    return false
  }
  const counter = BigInt(Math.floor(at / 1000 / stepSeconds))
  for (let drift = -window; drift <= window; drift++) {
    const step = counter + BigInt(drift)
    if (step < BigInt(0)) continue
    const expected = hotp(key, step, digits)
    if (crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(expected))) return true
  }
  return false
}
