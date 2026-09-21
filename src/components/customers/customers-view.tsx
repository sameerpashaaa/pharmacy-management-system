'use client'

// ─────────────────────────────────────────────────────────────
// Component — CustomersView
// Paginated client view of customers with search.
// ─────────────────────────────────────────────────────────────
import { useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'

import { CustomerTable, type CustomerRow } from './customer-table'

interface PaginationState {
  page: number
  limit: number
  total: number
  pages: number
}

interface CustomersViewProps {
  initialData: CustomerRow[]
  initialPagination: PaginationState
}

export function CustomersView({ initialData, initialPagination }: CustomersViewProps) {
  const router = useRouter()
  const [customers, setCustomers] = useState<CustomerRow[]>(initialData)
  const [pagination, setPagination] = useState<PaginationState>(initialPagination)
  const [isLoading, setIsLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')

  const fetchCustomers = useCallback(
    async (page: number, search: string) => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(pagination.limit),
        })
        if (search) params.set('search', search)
        const res = await fetch(`/api/customers?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data: CustomerRow[]
          pagination: PaginationState
        }
        if (json.success) {
          setCustomers(json.data)
          setPagination(json.pagination)
        }
      } finally {
        setIsLoading(false)
      }
    },
    [pagination.limit]
  )

  function handlePageChange(page: number) {
    void fetchCustomers(page, searchInput)
  }

  function handleSearch(query: string) {
    setSearchInput(query)
    void fetchCustomers(1, query)
  }

  function handleView(customer: CustomerRow) {
    router.push(`/customers/${customer.id}`)
  }

  function handleEdit(customer: CustomerRow) {
    router.push(`/customers/${customer.id}`)
  }

  function handleAdd() {
    router.push('/customers/new')
  }

  return (
    <CustomerTable
      customers={customers}
      isLoading={isLoading}
      pagination={pagination}
      onPageChange={handlePageChange}
      onSearch={handleSearch}
      onRefresh={() => void fetchCustomers(pagination.page, searchInput)}
      onViewCustomer={handleView}
      onEditCustomer={handleEdit}
      onAddCustomer={handleAdd}
    />
  )
}
