import { render, screen } from '@testing-library/react'

import { AdjustmentsTable, type AdjustmentRow } from '@/components/inventory/adjustments-table'

const sampleAdjustments: AdjustmentRow[] = [
  {
    id: 'adj-1',
    branchId: 'br-1',
    productId: 'prod-1',
    adjustmentType: 'PHYSICAL_COUNT',
    quantity: 5,
    reason: 'Cycle count',
    status: 'APPROVED',
    approvedAt: '2026-01-06T00:00:00.000Z',
    createdAt: '2026-01-05T00:00:00.000Z',
    product: { id: 'prod-1', name: 'Paracetamol 500mg', sku: 'PCM-500' },
    branch: { id: 'br-1', name: 'Branch A', code: 'BR-A' },
    createdBy: { id: 'user-1', name: 'User One' },
  },
  {
    id: 'adj-2',
    branchId: 'br-1',
    productId: 'prod-2',
    adjustmentType: 'DAMAGE',
    quantity: -3,
    reason: 'Broken strips',
    status: 'PENDING',
    approvedAt: null,
    createdAt: '2026-01-07T00:00:00.000Z',
    product: { id: 'prod-2', name: 'Amoxicillin 500mg', sku: 'AMX-500' },
    branch: { id: 'br-1', name: 'Branch A', code: 'BR-A' },
    createdBy: { id: 'user-1', name: 'User One' },
  },
]

describe('AdjustmentsTable', () => {
  it('renders adjustment rows with product, branch, and status', () => {
    render(<AdjustmentsTable rows={sampleAdjustments} />)
    expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument()
    expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument()
    expect(screen.getAllByText('Branch A')).toHaveLength(2)
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('shows signed quantities', () => {
    render(<AdjustmentsTable rows={sampleAdjustments} />)
    expect(screen.getByText('+5')).toBeInTheDocument()
    expect(screen.getByText('-3')).toBeInTheDocument()
  })

  it('shows approve/reject actions only for pending rows when permitted', () => {
    const onApprove = jest.fn()
    const onReject = jest.fn()
    render(
      <AdjustmentsTable
        rows={sampleAdjustments}
        canApprove
        onApprove={onApprove}
        onReject={onReject}
      />
    )
    expect(screen.getByTitle('Approve and apply adjustment')).toBeInTheDocument()
    expect(screen.getByTitle('Reject adjustment')).toBeInTheDocument()
    expect(screen.getAllByTitle('Approve and apply adjustment')).toHaveLength(1)
  })

  it('hides actions when the user cannot approve', () => {
    render(<AdjustmentsTable rows={sampleAdjustments} />)
    expect(screen.queryByTitle('Approve and apply adjustment')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Reject adjustment')).not.toBeInTheDocument()
  })

  it('calls approve and reject handlers', () => {
    const onApprove = jest.fn()
    const onReject = jest.fn()
    render(
      <AdjustmentsTable
        rows={sampleAdjustments}
        canApprove
        onApprove={onApprove}
        onReject={onReject}
      />
    )
    screen.getByTitle('Approve and apply adjustment').click()
    screen.getByTitle('Reject adjustment').click()
    expect(onApprove).toHaveBeenCalledWith(sampleAdjustments[1])
    expect(onReject).toHaveBeenCalledWith(sampleAdjustments[1])
  })

  it('renders the empty message when there are no adjustments', () => {
    render(<AdjustmentsTable rows={[]} />)
    expect(screen.getByText(/No stock adjustments found/i)).toBeInTheDocument()
  })
})
