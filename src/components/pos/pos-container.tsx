import { PosClient } from '@/components/pos/pos-client'
import { getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getAccessibleBranches } from '@/lib/inventory/branch-access'
import { getPosSettings } from '@/lib/settings/settings-service'

export async function PosContainer() {
  const session = await getSession()
  if (!session?.user) return null
  
  if (!session.user.permissions.includes(PERMISSIONS.SALES_CREATE)) {
    return null
  }

  const user = {
    id: session.user.id,
    branchId: session.user.branchId,
    permissions: session.user.permissions,
  }

  const [settings, branches] = await Promise.all([
    getPosSettings(),
    getAccessibleBranches({ id: session.user.id, branchId: session.user.branchId }),
  ])

  return (
    <PosClient
      user={user}
      branches={branches.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
      initialConfig={settings}
    />
  )
}
