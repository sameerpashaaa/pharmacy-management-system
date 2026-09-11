'use client'

import { Bell } from 'lucide-react'
import { useSession } from 'next-auth/react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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

      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <Badge className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full p-0 text-xs">
            3
          </Badge>
        </Button>
      </div>
    </header>
  )
}
