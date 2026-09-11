'use client'

// ─────────────────────────────────────────────────────────────
// Shared Component — ConfirmationDialog
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useUiStore } from '@/lib/stores/ui-store'

/**
 * Global confirmation dialog driven by ui-store.
 * Mount once in your layout — calls are made via useUiStore.openConfirmDialog().
 */
export function ConfirmationDialog() {
  const { confirmDialog, closeConfirmDialog } = useUiStore()
  const [pending, setPending] = useState(false)

  async function handleConfirm() {
    setPending(true)
    try {
      await confirmDialog.onConfirm()
    } finally {
      setPending(false)
      closeConfirmDialog()
    }
  }

  return (
    <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && closeConfirmDialog()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className={
              confirmDialog.variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : ''
            }
          >
            {pending ? 'Please wait…' : 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
