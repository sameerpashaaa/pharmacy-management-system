import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'

import { ProductImportDialog } from '@/components/products/product-import-dialog'

const successSummary = {
  fileName: 'products.csv',
  totalRows: 2,
  imported: 2,
  failed: 0,
  errors: [],
}

const failureSummary = {
  fileName: 'products.csv',
  totalRows: 2,
  imported: 0,
  failed: 1,
  errors: [{ row: 2, field: 'mrp', message: 'Invalid input: expected number, received string' }],
}

describe('ProductImportDialog', () => {
  let fetchMock: jest.Mock

  const renderDialog = (onImported = jest.fn()) => {
    render(<ProductImportDialog open onOpenChange={jest.fn()} onImported={onImported} />)
    return onImported
  }

  const mockFetch = (json: unknown, ok = true) => {
    fetchMock = jest.fn().mockResolvedValue({ ok, json: async () => json })
    globalThis.fetch = fetchMock as unknown as typeof fetch
  }

  beforeEach(() => {
    jest.clearAllMocks()
    globalThis.fetch = jest.fn()
  })

  it('renders the required-columns hint and the up-to row limit', () => {
    renderDialog()
    expect(screen.getByText(/Required columns: name, sku, mrp, categories/)).toBeTruthy()
    expect(screen.getByText(/Up to 1000 rows/)).toBeTruthy()
  })

  it('disables Import until a file is selected', () => {
    renderDialog()
    const importButton = screen.getByRole('button', { name: /Import/ })
    expect(importButton).toBeDisabled()
  })

  it('does nothing when Import is clicked while disabled (no toast, no fetch)', () => {
    const errorSpy = jest.spyOn(toast, 'error')
    renderDialog()
    const importButton = screen.getByRole('button', { name: /Import/ })
    fireEvent.click(importButton)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('imports a file, shows the success summary, and notifies the parent', async () => {
    mockFetch({ success: true, message: 'Imported 2 products successfully', data: successSummary })
    const onImported = renderDialog()

    const file = new File(['name,sku,mrp,categories'], 'products.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } })

    const importButton = screen.getByRole('button', { name: /Import/ })
    expect(importButton).toBeEnabled()

    fireEvent.click(importButton)
    await waitFor(() => {
      expect(screen.getByText('Imported 2 of 2 rows successfully')).toBeTruthy()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/products/import',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    )
    expect(onImported).toHaveBeenCalled()
  })

  it('shows the row-level error report and does not notify the parent on failure', async () => {
    mockFetch(
      {
        success: false,
        error: {
          code: 'IMPORT_FAILED',
          message: 'Import failed. No rows were inserted.',
          summary: failureSummary,
        },
      },
      false
    )
    const onImported = renderDialog()

    const file = new File(['name,sku,mrp,categories'], 'products.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /Import/ }))

    await waitFor(() => {
      expect(screen.getByText('Import failed — 1 row with errors')).toBeTruthy()
    })
    expect(screen.getByText(/Row 2: Invalid input: expected number, received string/)).toBeTruthy()
    expect(onImported).not.toHaveBeenCalled()
  })
})
