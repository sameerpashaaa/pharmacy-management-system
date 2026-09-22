// ─────────────────────────────────────────────────────────────
// Transaction retry policy — shared across workflows that
// serialize their mutations.
//
// Postgres Serializable isolation surfaces conflicts as P2034
// (serialization failure) and unique-constraint conflicts as
// P2002. Both are transient under concurrent access: re-running
// the operation re-reads freshly committed state and re-evaluates
// its business rules inside a fresh serialized snapshot.
//
// Extracted verbatim from the sales-service private helper so the
// create/cancel-sale and customer-return paths share ONE policy.
// ─────────────────────────────────────────────────────────────

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
  )
}

function isSerializationError(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2034'
  )
}

export async function runWithRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!isUniqueConstraintError(e) && !isSerializationError(e)) throw e
      lastError = e
      if (i === attempts - 1) {
        throw new Error('Conflict: a concurrent sale changed the data, please retry')
      }
    }
  }
  throw lastError
}
