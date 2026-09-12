import { render, screen } from '@testing-library/react'
import { Plus } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'

describe('EmptyState component', () => {
  it('renders default title and description', () => {
    render(<EmptyState />)
    expect(screen.getByText('No results found')).toBeInTheDocument()
    expect(screen.getByText('There is nothing here yet.')).toBeInTheDocument()
  })

  it('renders custom title and description', () => {
    render(<EmptyState title="Custom Title" description="Custom description" />)
    expect(screen.getByText('Custom Title')).toBeInTheDocument()
    expect(screen.getByText('Custom description')).toBeInTheDocument()
  })

  it('renders custom icon', () => {
    render(<EmptyState icon={Plus} />)
    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument()
  })

  it('renders action when provided', () => {
    render(<EmptyState action={<button data-testid="action-btn">Action</button>} />)
    expect(screen.getByTestId('action-btn')).toBeInTheDocument()
  })
})
