'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Package,
  BarChart3,
  ShoppingCart,
  ClipboardList,
  Users,
  Building2,
  TrendingDown,
  FileText,
  Settings,
  LogOut,
  ChevronDown,
  Pill,
  Receipt,
  RotateCcw,
  UserCheck,
  Truck,
  BadgeDollarSign,
  AlertTriangle,
  ScrollText,
  Shield,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils/cn'
import { ROUTES } from '@/lib/constants/routes'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

type NavItem = {
  label: string
  href?: string
  icon: React.ElementType
  permission?: string
  children?: Omit<NavItem, 'children'>[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { label: 'POS / Billing', href: ROUTES.POS, icon: ShoppingCart },
  {
    label: 'Products',
    icon: Pill,
    children: [
      { label: 'All Products', href: ROUTES.PRODUCTS, icon: Package },
      { label: 'Categories', href: ROUTES.CATEGORIES, icon: ClipboardList },
    ],
  },
  {
    label: 'Inventory',
    icon: BarChart3,
    children: [
      { label: 'Stock Overview', href: ROUTES.INVENTORY, icon: BarChart3 },
      { label: 'Adjustments', href: ROUTES.INVENTORY_ADJUSTMENTS, icon: ScrollText },
      { label: 'Movements', href: ROUTES.INVENTORY_MOVEMENTS, icon: TrendingDown },
      { label: 'Batches', href: ROUTES.BATCHES, icon: Package },
    ],
  },
  {
    label: 'Purchases',
    icon: Truck,
    children: [
      { label: 'All Purchases', href: ROUTES.PURCHASES, icon: ClipboardList },
      { label: 'Suppliers', href: ROUTES.SUPPLIERS, icon: Building2 },
    ],
  },
  {
    label: 'Sales',
    icon: Receipt,
    children: [
      { label: 'Sales History', href: ROUTES.SALES, icon: Receipt },
      { label: 'Prescriptions', href: ROUTES.PRESCRIPTIONS, icon: FileText },
      { label: 'Customers', href: ROUTES.CUSTOMERS, icon: UserCheck },
    ],
  },
  { label: 'Returns', href: ROUTES.SALE_RETURNS, icon: RotateCcw },
  { label: 'Expiry', href: ROUTES.EXPIRY, icon: AlertTriangle },
  {
    label: 'Finance',
    icon: BadgeDollarSign,
    children: [
      { label: 'Overview', href: ROUTES.FINANCE, icon: BadgeDollarSign },
      { label: 'GST Reports', href: ROUTES.GST, icon: FileText },
    ],
  },
  { label: 'Reports', href: ROUTES.REPORTS, icon: BarChart3 },
  {
    label: 'Admin',
    icon: Shield,
    children: [
      { label: 'Users', href: ROUTES.USERS, icon: Users },
      { label: 'Roles', href: ROUTES.ROLES, icon: Shield },
      { label: 'Audit Logs', href: ROUTES.AUDIT, icon: ScrollText },
      { label: 'Settings', href: ROUTES.SETTINGS, icon: Settings },
    ],
  },
]

function NavItemComponent({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname()

  if (item.children) {
    const isActiveParent = item.children.some((child) => child.href === pathname)

    return (
      <Collapsible defaultOpen={isActiveParent}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <span className="flex items-center gap-2">
            <item.icon className="h-4 w-4" />
            {item.label}
          </span>
          <ChevronDown className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-4 mt-1 space-y-1 border-l pl-3">
            {item.children.map((child) => (
              <NavItemComponent key={child.label} item={child} depth={depth + 1} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  const isActive = pathname === item.href

  return (
    <Link
      href={item.href!}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  )
}

export function Sidebar() {
  const { data: session } = useSession()

  const handleLogout = async () => {
    await signOut({ callbackUrl: ROUTES.LOGIN })
    toast.success('Signed out successfully')
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          💊
        </div>
        <div>
          <p className="text-sm font-bold leading-none">PharmaCare</p>
          <p className="text-xs text-muted-foreground">Management System</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavItemComponent key={item.label} item={item} />
        ))}
      </nav>

      {/* User section */}
      <div className="border-t p-3">
        <div className="mb-2 flex items-center gap-2 px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {session?.user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{session?.user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{session?.user?.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-destructive hover:text-destructive" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  )
}
