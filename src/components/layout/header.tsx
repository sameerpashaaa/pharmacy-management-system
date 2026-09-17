'use client'

import { useSession } from 'next-auth/react'

export function Header() {
  const { data: session } = useSession()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-6">
      <div>
        {/* Breadcrumb placeholder — will be dynamic */}
        <p className="text-sm text-muted-foreground">
          Welcome back, <span className="font-medium text-foreground">{session?.user?.name}</span>
        </p>
      </div>
    </header>
  )
}
