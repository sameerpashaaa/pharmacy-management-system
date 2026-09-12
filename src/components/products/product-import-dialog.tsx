'use client'

// ─────────────────────────────────────────────────────────────
// Component — ProductImportDialog
// Bulk-imports products from a CSV file via POST /api/products/import.
// All-or-nothing: the server validates the whole file up front and
// returns a row-level error report when anything fails.
// ─────────────────────────────────────────────────────────────
import { FileUp, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_CSV_ROWS, REQUIRED_CSV_COLUMNS } from '@/lib/constants/product-import'
import { useToast } from '@/lib/hooks/use-toast'

interface ProductImportSummary {
  fileName: string
  totalRows: number
  imported: number
  failed: number
  errors: Array<{ row: number; field: string; message: string }>
}

interface ProductImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

export function ProductImportDialog({ open, onOpenChange, onImported }: ProductImportDialogProps) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ProductImportSummary | null>(null)

  function reset() {
    setFileName(null)
    setUploading(false)
    setResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null)
    setFileName(e.target.files?.[0]?.name ?? null)
  }

  async function handleImport() {
    if (!fileName) {
      toast.error('Please select a CSV file')
      return
    }
    if (!fileInputRef.current?.files?.[0]) return

    setUploading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', fileInputRef.current.files[0])

    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      })
      const json = (await res.json()) as {
        success: boolean
        message?: string
        data?: ProductImportSummary
        error?: { message?: string; summary?: ProductImportSummary }
      }

      if (res.ok && json.success) {
        const summary = json.data
        setResult(summary ?? null)
        toast.success(json.message ?? 'Products imported successfully')
        onImported?.()
      } else {
        const summary = json.error?.summary ?? {
          fileName: fileName ?? '',
          totalRows: 0,
          imported: 0,
          failed: 0,
          errors: [{ row: 0, field: 'file', message: json.error?.message ?? 'Import failed' }],
        }
        setResult(summary)
        toast.error(json.error?.message ?? 'Import failed')
      }
    } catch {
      setResult({
        fileName: fileName ?? '',
        totalRows: 0,
        imported: 0,
        failed: 1,
        errors: [{ row: 0, field: 'file', message: 'Failed to upload file. Please try again.' }],
      })
      toast.error('Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  const hasRowErrors = (result?.errors?.length ?? 0) > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Products (CSV)</DialogTitle>
          <DialogDescription>
            Bulk-create products from a CSV file. The whole file is validated first; if any row
            fails, nothing is imported and all errors are listed below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-csv-file">CSV file</Label>
            <Input
              id="product-csv-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">
              Required columns: {REQUIRED_CSV_COLUMNS.join(', ')}. Up to {MAX_CSV_ROWS} rows.
              Categories are referenced by slug or name (separate multiple with&nbsp;;). Separate
              additional barcodes with&nbsp;;.
            </p>
          </div>

          {result && (
            <div
              role="alert"
              className={`rounded-md border p-3 text-sm ${
                hasRowErrors
                  ? 'border-destructive/50 bg-destructive/10'
                  : 'border-border bg-muted/50'
              }`}
            >
              <p className="font-medium">
                {hasRowErrors
                  ? `Import failed — ${result.failed} row${result.failed === 1 ? '' : 's'} with errors`
                  : `Imported ${result.imported} of ${result.totalRows} rows successfully`}
              </p>
              {hasRowErrors && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {result.errors.map((e, idx) => (
                    <li key={`${e.row}-${e.field}-${idx}`}>
                      {e.row > 0 ? `Row ${e.row}` : e.field}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleImport} disabled={!fileName || uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <FileUp className="mr-2 h-4 w-4" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
