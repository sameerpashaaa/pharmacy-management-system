import crypto from 'crypto'

function getKey(): Buffer {
  const keyRaw = process.env.MFA_ENCRYPTION_KEY
  if (!keyRaw) throw new Error('MFA_ENCRYPTION_KEY is not configured')
  const buf = Buffer.from(keyRaw, 'utf-8')
  if (buf.length === 32) return buf
  return crypto.createHash('sha256').update(buf).digest()
}

export function encryptSecret(plain: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptSecret(ciphertext: string): string {
  const key = getKey()
  const [ivHex, tagHex, encHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted payload')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}
