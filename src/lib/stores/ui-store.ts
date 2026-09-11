// ─────────────────────────────────────────────────────────────
// Zustand Store — UI State
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand'

type UiStore = {
  // Sidebar
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  // Global loading overlay
  globalLoading: boolean
  setGlobalLoading: (loading: boolean) => void

  // Confirmation dialog
  confirmDialog: {
    open: boolean
    title: string
    description: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'destructive'
  }
  openConfirmDialog: (opts: {
    title: string
    description: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'destructive'
  }) => void
  closeConfirmDialog: () => void
}

const DEFAULT_CONFIRM = {
  open: false,
  title: '',
  description: '',
  onConfirm: () => {},
  variant: 'default' as const,
}

export const useUiStore = create<UiStore>((set) => ({
  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Global loading
  globalLoading: false,
  setGlobalLoading: (loading) => set({ globalLoading: loading }),

  // Confirmation dialog
  confirmDialog: DEFAULT_CONFIRM,
  openConfirmDialog: (opts) =>
    set({ confirmDialog: { open: true, variant: 'default', ...opts } }),
  closeConfirmDialog: () => set({ confirmDialog: DEFAULT_CONFIRM }),
}))
