'use client'

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
  Building,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { signOut } from 'next-auth/react'
import { useMemo } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ROUTES } from '@/lib/constants/routes'
import { cn } from '@/lib/utils/cn'

type NavItem = {
  label: string
  href?: string
  icon: React.ElementType
  permission?: string
  children?: NavChild[]
}

type NavChild = Omit<NavItem, 'children'> & {
  children?: Omit<NavItem, 'children'>[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { label: 'POS / Billing', href: ROUTES.POS, icon: ShoppingCart, permission: 'sales:create' },
  {
    label: 'Products',
    icon: Pill,
    permission: 'products:read',
    children: [
      { label: 'All Products', href: ROUTES.PRODUCTS, icon: Package, permission: 'products:read' },
      {
        label: 'Categories',
        href: ROUTES.CATEGORIES,
        icon: ClipboardList,
        permission: 'categories:manage',
      },
    ],
  },
  {
    label: 'Inventory',
    icon: BarChart3,
    permission: 'inventory:read',
    children: [
      {
        label: 'Stock Overview',
        href: ROUTES.INVENTORY,
        icon: BarChart3,
        permission: 'inventory:read',
      },
      {
        label: 'Adjustments',
        href: ROUTES.INVENTORY_ADJUSTMENTS,
        icon: ScrollText,
        permission: 'inventory:read',
      },
      {
        label: 'Movements',
        href: ROUTES.INVENTORY_MOVEMENTS,
        icon: TrendingDown,
        permission: 'inventory:read',
      },
      { label: 'Batches', href: ROUTES.BATCHES, icon: Package, permission: 'batches:read' },
    ],
  },
  {
    label: 'Purchases',
    icon: Truck,
    permission: 'purchases:read',
    children: [
      {
        label: 'All Purchases',
        href: ROUTES.PURCHASES,
        icon: ClipboardList,
        permission: 'purchases:read',
      },
      { label: 'Suppliers', href: ROUTES.SUPPLIERS, icon: Building2, permission: 'suppliers:read' },
    ],
  },
  {
    label: 'Sales',
    icon: Receipt,
    permission: 'sales:read',
    children: [
      { label: 'Sales History', href: ROUTES.SALES, icon: Receipt, permission: 'sales:read' },
      {
        label: 'Prescriptions',
        href: ROUTES.PRESCRIPTIONS,
        icon: FileText,
        permission: 'prescriptions:read',
      },
      { label: 'Customers', href: ROUTES.CUSTOMERS, icon: UserCheck, permission: 'customers:read' },
    ],
  },
  { label: 'Returns', href: ROUTES.SALE_RETURNS, icon: RotateCcw, permission: 'returns:read' },
  { label: 'Expiry', href: ROUTES.EXPIRY, icon: AlertTriangle, permission: 'batches:read' },
  {
    label: 'Finance',
    icon: BadgeDollarSign,
    permission: 'finance:read',
    children: [
      {
        label: 'Overview',
        href: ROUTES.FINANCE,
        icon: BadgeDollarSign,
        permission: 'finance:read',
      },
      { label: 'GST Reports', href: ROUTES.GST, icon: FileText, permission: 'gst:read' },
    ],
  },
  { label: 'Reports', href: ROUTES.REPORTS, icon: BarChart3, permission: 'reports:sales' },
  {
    label: 'Compliance',
    href: ROUTES.COMPLIANCE_FORM35,
    icon: ScrollText,
    permission: 'reports:export',
  },
  {
    label: 'Admin',
    icon: Shield,
    children: [
      { label: 'Users', href: ROUTES.USERS, icon: Users, permission: 'users:read' },
      { label: 'Roles', href: ROUTES.ROLES, icon: Shield, permission: 'roles:manage' },
      { label: 'Audit Logs', href: ROUTES.AUDIT, icon: ScrollText, permission: 'audit:read' },
      {
        label: 'Settings',
        icon: Settings,
        permission: 'settings:read',
        children: [
          { label: 'Overview', href: ROUTES.SETTINGS, icon: Settings, permission: 'settings:read' },
          {
            label: 'Organization',
            href: ROUTES.SETTINGS_ORGANIZATION,
            icon: Building,
            permission: 'organization:update',
          },
        ],
      },
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

  const visibleNavItems = useMemo(() => {
    const permissions = session?.user?.permissions ?? []
    const isAllowed = (item: NavItem) =>
      item.permission ? permissions.includes(item.permission) : true
    const filterChildren = (children?: Omit<NavItem, 'children'>[]) =>
      children?.filter((child) => isAllowed(child)) ?? []

    return NAV_ITEMS.filter((item) => {
      if (!isAllowed(item)) return false
      if (item.children) return filterChildren(item.children).length > 0
      return true
    }).map((item) =>
      item.children
        ? {
            ...item,
            children: filterChildren(item.children),
          }
        : item
    )
  }, [session])

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
        {visibleNavItems.map((item) => (
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
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-destructive hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  )
}
