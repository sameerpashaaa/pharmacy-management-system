import { decryptSecret, encryptSecret } from '@/lib/auth/mfa-crypto'

const ORIGINAL_KEY = process.env.MFA_ENCRYPTION_KEY

describe('mfa-crypto', () => {
  beforeEach(() => {
    process.env.MFA_ENCRYPTION_KEY = 'test-only-32-byte-key-1234567890'
  })

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.MFA_ENCRYPTION_KEY
    else process.env.MFA_ENCRYPTION_KEY = ORIGINAL_KEY
  })

  it('round-trips a secret through encrypt/decrypt', () => {
    const cipher = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(cipher).not.toBe('JBSWY3DPEHPK3PXP')
    expect(cipher.split(':')).toHaveLength(3)
    expect(decryptSecret(cipher)).toBe('JBSWY3DPEHPK3PXP')
  })

  it('produces distinct ciphertexts for the same secret (random IV)', () => {
    expect(encryptSecret('ABC')).not.toBe(encryptSecret('ABC'))
  })

  it('fails when MFA_ENCRYPTION_KEY is missing', () => {
    delete process.env.MFA_ENCRYPTION_KEY
    expect(() => encryptSecret('ABC')).toThrow('MFA_ENCRYPTION_KEY is not configured')
  })

  it('does not fall back to NEXTAUTH_SECRET', () => {
    delete process.env.MFA_ENCRYPTION_KEY
    process.env.NEXTAUTH_SECRET = 'some-nextauth-secret-value'
    expect(() => encryptSecret('ABC')).toThrow('MFA_ENCRYPTION_KEY is not configured')
    delete process.env.NEXTAUTH_SECRET
  })

  it('rejects tampered ciphertext', () => {
    const cipher = encryptSecret('JBSWY3DPEHPK3PXP')
    const tampered = `${cipher}ff`
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it('rejects malformed payloads', () => {
    expect(() => decryptSecret('not-a-payload')).toThrow('Invalid encrypted payload')
  })
})
