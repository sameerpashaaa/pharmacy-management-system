/** @jest-environment node */
import { NextRequest } from 'next/server'

import { POST as approvePOST } from '@/app/api/prescriptions/[id]/approve/route'
import { POST as rejectPOST } from '@/app/api/prescriptions/[id]/reject/route'
import { GET as prescriptionGET } from '@/app/api/prescriptions/[id]/route'
import { GET as prescriptionsGET, POST as prescriptionsPOST } from '@/app/api/prescriptions/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import {
  approvePrescription,
  createPrescription,
  getPrescriptionById,
  listPrescriptions,
  rejectPrescription,
} from '@/lib/prescriptions/prescription-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/prescriptions/prescription-service', () => ({
  createPrescription: jest.fn(),
  listPrescriptions: jest.fn(),
  getPrescriptionById: jest.fn(),
  updatePrescription: jest.fn(),
  approvePrescription: jest.fn(),
  rejectPrescription: jest.fn(),
}))

const mockedPermission = requirePermission as jest.Mock
const mockedService = {
  createPrescription: createPrescription as jest.Mock,
  listPrescriptions: listPrescriptions as jest.Mock,
  getPrescriptionById: getPrescriptionById as jest.Mock,
  approvePrescription: approvePrescription as jest.Mock,
  rejectPrescription: rejectPrescription as jest.Mock,
}

const mockUser = { id: 'user-1', branchId: 'branch-1', permissions: ['prescriptions:read', 'prescriptions:create'] }

describe('Prescription API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedPermission.mockResolvedValue(mockUser)
  })

  describe('GET /api/prescriptions', () => {
    it('returns paginated list of prescriptions', async () => {
      mockedService.listPrescriptions.mockResolvedValue({
        data: [{ id: 'rx-1', patientName: 'John' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions?page=1&limit=20')
      const res = await prescriptionsGET(req)
      const json = await (res.json() as Promise<{ success: boolean; data: unknown[] }>)

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data).toHaveLength(1)
    })
  })

  describe('POST /api/prescriptions', () => {
    it('creates a new prescription with 201 status', async () => {
      const created = { id: 'rx-new', patientName: 'Alice', branchId: 'branch-1' }
      mockedService.createPrescription.mockResolvedValue(created)

      const req = new NextRequest('http://localhost:3000/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: 'Alice',
          branchId: 'branch-1',
        }),
      })

      const res = await prescriptionsPOST(req)
      const json = await (res.json() as Promise<{ success: boolean; data: unknown }>)

      expect(res.status).toBe(201)
      expect(json.success).toBe(true)
      expect(json.data).toEqual(created)
    })

    it('returns 400 when validation fails', async () => {
      const req = new NextRequest('http://localhost:3000/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName: '' }),
      })

      const res = await prescriptionsPOST(req)
      const json = await (res.json() as Promise<{ success: boolean; error: { code: string } }>)

      expect(res.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error.code).toBe('VALIDATION')
    })
  })

  describe('GET /api/prescriptions/[id]', () => {
    it('returns prescription detail', async () => {
      const rx = { id: 'rx-1', patientName: 'Bob' }
      mockedService.getPrescriptionById.mockResolvedValue(rx)

      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1')
      const res = await prescriptionGET(req, { params: { id: 'rx-1' } })
      const json = await (res.json() as Promise<{ success: boolean; data: unknown }>)

      expect(res.status).toBe(200)
      expect(json.data).toEqual(rx)
    })

    it('returns 404 if not found', async () => {
      mockedService.getPrescriptionById.mockRejectedValue(new Error('Not Found: prescription'))

      const req = new NextRequest('http://localhost:3000/api/prescriptions/unknown')
      const res = await prescriptionGET(req, { params: { id: 'unknown' } })

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/prescriptions/[id]/approve', () => {
    it('approves prescription successfully', async () => {
      mockedService.approvePrescription.mockResolvedValue({ id: 'rx-1', status: 'APPROVED' })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Looks good' }),
      })

      const res = await approvePOST(req, { params: { id: 'rx-1' } })
      const json = await (res.json() as Promise<{ success: boolean; data: { status: string } }>)

      expect(res.status).toBe(200)
      expect(json.data.status).toBe('APPROVED')
    })
  })

  describe('POST /api/prescriptions/[id]/reject', () => {
    it('rejects prescription with reason', async () => {
      mockedService.rejectPrescription.mockResolvedValue({ id: 'rx-1', status: 'REJECTED' })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: 'Dosage unclear' }),
      })

      const res = await rejectPOST(req, { params: { id: 'rx-1' } })
      const json = await (res.json() as Promise<{ success: boolean; data: { status: string } }>)

      expect(res.status).toBe(200)
      expect(json.data.status).toBe('REJECTED')
    })
  })
})
