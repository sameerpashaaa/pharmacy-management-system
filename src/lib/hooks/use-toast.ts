'use client'

// ─────────────────────────────────────────────────────────────
// Hook — useToast (thin wrapper around sonner)
// ─────────────────────────────────────────────────────────────
import { toast } from 'sonner'

export function useToast() {
  return {
    success: (message: string, description?: string) =>
      toast.success(message, { description }),

    error: (message: string, description?: string) =>
      toast.error(message, { description }),

    info: (message: string, description?: string) =>
      toast.info(message, { description }),

    warning: (message: string, description?: string) =>
      toast.warning(message, { description }),

    loading: (message: string) => toast.loading(message),

    dismiss: (id?: string | number) => toast.dismiss(id),

    /** Show success or error based on a boolean */
    fromResult: (
      ok: boolean,
      successMsg: string,
      errorMsg: string
    ) => (ok ? toast.success(successMsg) : toast.error(errorMsg)),
  }
}
