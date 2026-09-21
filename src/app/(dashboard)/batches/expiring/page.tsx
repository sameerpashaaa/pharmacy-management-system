import { redirect } from 'next/navigation'

// /batches/expiring is a legacy alias for /expiry/expiring.
// Redirect permanently to consolidate on the canonical expiry path.
export default function ExpiringBatchesRedirect() {
  redirect('/expiry/expiring')
}
