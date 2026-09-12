import { render, screen } from '@testing-library/react'

import { ProductTable, type ProductRow } from '@/components/products/product-table'

const sampleProducts: ProductRow[] = [
  {
    id: 'prod-1',
    name: 'Paracetamol 500mg',
    genericName: 'Paracetamol',
    sku: 'PCM-500',
    barcode: '8901234567890',
    manufacturer: 'Generic Pharma',
    mrp: '25.00',
    unitOfMeasure: 'Strip',
    isActive: true,
    isPrescriptionRequired: false,
    drugSchedule: 'NONE',
    createdAt: '2026-01-01T00:00:00.000Z',
    categories: [{ category: { id: 'cat-1', name: 'Tablets' } }],
  },
  {
    id: 'prod-2',
    name: 'Amoxicillin 500mg',
    genericName: 'Amoxicillin',
    sku: 'AMX-500',
    barcode: '8901234567891',
    manufacturer: 'Generic Pharma',
    mrp: '85.00',
    unitOfMeasure: 'Strip',
    isActive: false,
    isPrescriptionRequired: true,
    drugSchedule: 'H',
    createdAt: '2026-01-02T00:00:00.000Z',
    categories: [{ category: { id: 'cat-1', name: 'Tablets' } }],
  },
]

describe('ProductTable', () => {
  it('renders product rows with names and SKUs', () => {
    render(<ProductTable products={sampleProducts} />)
    expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument()
    expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument()
    expect(screen.getByText('PCM-500')).toBeInTheDocument()
    expect(screen.getByText('AMX-500')).toBeInTheDocument()
  })

  it('shows Rx and OTC badges', () => {
    render(<ProductTable products={sampleProducts} />)
    expect(screen.getAllByText('Rx').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('OTC')).toBeInTheDocument()
  })

  it('shows active and inactive status badges', () => {
    render(<ProductTable products={sampleProducts} />)
    expect(screen.getAllByText('Active')).toHaveLength(1)
    expect(screen.getAllByText('Inactive')).toHaveLength(1)
  })

  it('renders category badges', () => {
    render(<ProductTable products={sampleProducts} />)
    expect(screen.getAllByText('Tablets')).toHaveLength(2)
  })

  it('renders the empty message when there are no products', () => {
    render(<ProductTable products={[]} />)
    expect(screen.getByText(/No products found/i)).toBeInTheDocument()
  })

  it('calls onAddProduct when the toolbar button is clicked', () => {
    const onAdd = jest.fn()
    render(<ProductTable products={sampleProducts} onAddProduct={onAdd} />)
    const addBtn = screen.getByRole('button', { name: /add product/i })
    addBtn.click()
    expect(onAdd).toHaveBeenCalled()
  })

  it('renders the product count in the table footer', () => {
    render(<ProductTable products={sampleProducts} />)
    expect(screen.getByText('2 row(s)')).toBeInTheDocument()
  })
})
