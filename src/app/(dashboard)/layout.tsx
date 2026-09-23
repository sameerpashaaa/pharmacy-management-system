import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'
import { PosContainer } from '@/components/pos/pos-container'
import { authOptions } from '@/lib/auth/auth-config'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect(ROUTES.LOGIN)
  }

  // Accounts whose admin-provisioned password has not been changed yet must
  // not reach the dashboard — they go straight to the forced change screen.
  if (session.user.mustChangePassword) {
    redirect(ROUTES.CHANGE_PASSWORD)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden relative">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 relative">
          {children}
        </main>
        <PosContainer />
      </div>
    </div>
  )
}
