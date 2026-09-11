import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth/auth-config'
import { ROUTES } from '@/lib/constants/routes'

export default async function HomePage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect(ROUTES.LOGIN)
  }

  redirect(ROUTES.DASHBOARD)
}
