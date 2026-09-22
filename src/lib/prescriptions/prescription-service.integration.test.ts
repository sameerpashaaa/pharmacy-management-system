/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Prescription API — Real PostgreSQL integration tests.
//
// Covers the existing /api/prescriptions/* route handlers against
// the real test database, with requirePermission mocked for
// auth/RBAC assertions. Service-layer calls hit real Prisma/PostgreSQL.
//
// Runs against the dedicated local test container when DATABASE_URL
// is set (jest.setup.ts defaults it to the `pharma_test` schema on
// localhost:5435). Skips when no DB is configured.
// ─────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'

import { POST as approvePOST } from '@/app/api/prescriptions/[id]/approve/route'
import { POST as imagesPOST } from '@/app/api/prescriptions/[id]/images/route'
import { POST as rejectPOST } from '@/app/api/prescriptions/[id]/reject/route'
import {
  GET as prescriptionGET,
  PATCH as prescriptionPATCH,
} from '@/app/api/prescriptions/[id]/route'
import { GET as prescriptionsGET, POST as prescriptionsPOST } from '@/app/api/prescriptions/route'
import { GET as statsGET } from '@/app/api/prescriptions/stats/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

const TRUNCATE_TABLES = ['prescription_images', 'prescriptions', 'audit_logs', 'customer_ledgers']

const mockRequirePermission = requirePermission as jest.Mock

function mockUser(overrides: { id: string; branchId: string | null; permissions: string[] }) {
  return mockRequirePermission.mockResolvedValue(overrides)
}

function mockReject(message: string) {
  mockRequirePermission.mockRejectedValue(new Error(message))
}

describe('Prescription API Integration (Real PostgreSQL)', () => {
  let branchId: string
  let customerId: string
  let actor: { id: string; branchId: string | null; permissions: string[] }

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: 'Rx Org' } })

    const branch = await prisma.branch.create({
      data: { name: 'Rx Branch', organizationId: org.id },
    })
    branchId = branch.id

    const user = await prisma.user.create({
      data: {
        name: 'Dr. Test',
        email: `rx-test-${Date.now()}@pharma.test`,
        branchId,
      },
    })
    actor = {
      id: user.id,
      branchId,
      permissions: [
        PERMISSIONS.PRESCRIPTIONS_READ,
        PERMISSIONS.PRESCRIPTIONS_CREATE,
        PERMISSIONS.PRESCRIPTIONS_APPROVE,
      ],
    }

    const customer = await prisma.customer.create({
      data: { name: 'Rx Patient', phone: '5551234567' },
    })
    customerId = customer.id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE`
    )
    mockRequirePermission.mockClear()
  })

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE`
    )
  })

  // ─── GET /api/prescriptions ──────────────────────────────

  describe('GET /api/prescriptions', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const req = new NextRequest('http://localhost:3000/api/prescriptions')
      const res = await prescriptionsGET(req)
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking prescriptions:read', async () => {
      mockReject("Forbidden: requires permission 'prescriptions:read'")
      const req = new NextRequest('http://localhost:3000/api/prescriptions')
      const res = await prescriptionsGET(req)
      expect(res.status).toBe(403)
    })

    it('returns paginated prescriptions from real database', async () => {
      mockUser(actor)
      await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-TEST-001',
          patientName: 'John Doe',
          branchId,
          customerId,
          status: 'PENDING',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions?page=1&limit=20')
      const res = await prescriptionsGET(req)
      const json = (await res.json()) as { success: boolean; data: unknown[]; pagination: unknown }

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data).toHaveLength(1)
      expect((json.data[0] as { patientName: string }).patientName).toBe('John Doe')
    })
  })

  // ─── POST /api/prescriptions ─────────────────────────────

  describe('POST /api/prescriptions', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const req = new NextRequest('http://localhost:3000/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName: 'Test', branchId }),
      })
      const res = await prescriptionsPOST(req)
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking prescriptions:create', async () => {
      mockReject("Forbidden: requires permission 'prescriptions:create'")
      const req = new NextRequest('http://localhost:3000/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName: 'Test', branchId }),
      })
      const res = await prescriptionsPOST(req)
      expect(res.status).toBe(403)
    })

    it('returns 400 when validation fails', async () => {
      mockUser(actor)
      const req = new NextRequest('http://localhost:3000/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName: '', branchId }),
      })
      const res = await prescriptionsPOST(req)
      const json = (await res.json()) as { success: boolean; error: { code: string } }
      expect(res.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error.code).toBe('VALIDATION')
    })

    it('creates a prescription persisted to real database with 201', async () => {
      mockUser(actor)
      const req = new NextRequest('http://localhost:3000/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: 'Jane Smith',
          patientAge: 45,
          doctorName: 'Dr. Test',
          branchId,
          customerId,
        }),
      })
      const res = await prescriptionsPOST(req)
      const json = (await res.json()) as {
        success: boolean
        data: { id: string; patientName: string; status: string; branchId: string }
      }

      expect(res.status).toBe(201)
      expect(json.success).toBe(true)
      expect(json.data.patientName).toBe('Jane Smith')
      expect(json.data.status).toBe('PENDING')
      expect(json.data.branchId).toBe(branchId)

      const dbRx = await prisma.prescription.findUnique({ where: { id: json.data.id } })
      expect(dbRx).not.toBeNull()
      expect(dbRx!.patientName).toBe('Jane Smith')
    })
  })

  // ─── GET /api/prescriptions/[id] ─────────────────────────

  describe('GET /api/prescriptions/[id]', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1')
      const res = await prescriptionGET(req, { params: { id: 'rx-1' } })
      expect(res.status).toBe(401)
    })

    it('returns 404 when not found', async () => {
      mockUser(actor)
      const req = new NextRequest('http://localhost:3000/api/prescriptions/unknown')
      const res = await prescriptionGET(req, { params: { id: 'unknown' } })
      expect(res.status).toBe(404)
    })

    it('returns prescription from real database', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-TEST-002',
          patientName: 'Bob Smith',
          branchId,
          status: 'PENDING',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id)
      const res = await prescriptionGET(req, { params: { id: rx.id } })
      const json = (await res.json()) as { success: boolean; data: { patientName: string } }

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.patientName).toBe('Bob Smith')
    })
  })

  // ─── PATCH /api/prescriptions/[id] ───────────────────────

  describe('PATCH /api/prescriptions/[id]', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName: 'Updated' }),
      })
      const res = await prescriptionPATCH(req, { params: { id: 'rx-1' } })
      expect(res.status).toBe(401)
    })

    it('returns 404 when not found', async () => {
      mockUser(actor)
      const req = new NextRequest('http://localhost:3000/api/prescriptions/unknown', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName: 'Updated' }),
      })
      const res = await prescriptionPATCH(req, { params: { id: 'unknown' } })
      expect(res.status).toBe(404)
    })

    it('returns 400 when updating a non-PENDING prescription', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-TEST-003',
          patientName: 'Original',
          branchId,
          status: 'APPROVED',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName: 'Updated' }),
      })
      const res = await prescriptionPATCH(req, { params: { id: rx.id } })
      expect(res.status).toBe(400)
    })

    it('updates prescription in real database', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-TEST-004',
          patientName: 'Original',
          branchId,
          status: 'PENDING',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName: 'Updated Name' }),
      })
      const res = await prescriptionPATCH(req, { params: { id: rx.id } })
      const json = (await res.json()) as { success: boolean; data: { patientName: string } }

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.patientName).toBe('Updated Name')

      const dbRx = await prisma.prescription.findUnique({ where: { id: rx.id } })
      expect(dbRx!.patientName).toBe('Updated Name')
    })
  })

  // ─── POST /api/prescriptions/[id]/approve ────────────────

  describe('POST /api/prescriptions/[id]/approve', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'OK' }),
      })
      const res = await approvePOST(req, { params: { id: 'rx-1' } })
      expect(res.status).toBe(401)
    })

    it('returns 404 when not found', async () => {
      mockUser(actor)
      const req = new NextRequest('http://localhost:3000/api/prescriptions/unknown/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'OK' }),
      })
      const res = await approvePOST(req, { params: { id: 'unknown' } })
      expect(res.status).toBe(404)
    })

    it('returns 400 when approving a non-PENDING prescription', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-TEST-005',
          patientName: 'Test',
          branchId,
          status: 'APPROVED',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id + '/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'OK' }),
      })
      const res = await approvePOST(req, { params: { id: rx.id } })
      expect(res.status).toBe(400)
    })

    it('approves prescription in real database', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-TEST-006',
          patientName: 'Test',
          branchId,
          status: 'PENDING',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id + '/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Approved' }),
      })
      const res = await approvePOST(req, { params: { id: rx.id } })
      const json = (await res.json()) as {
        success: boolean
        data: { status: string; approvedById: string }
      }

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('APPROVED')
      expect(json.data.approvedById).toBe(actor.id)

      const dbRx = await prisma.prescription.findUnique({ where: { id: rx.id } })
      expect(dbRx!.status).toBe('APPROVED')
    })
  })

  // ─── Regression: Prescription relation contract ──────────
  //
  // Guards the fix for the misnamed `approvedBy` accessor which used to
  // resolve through `customerId`. After the schema correction the API
  // response must expose `customer` (Customer shape) and `pharmacist`
  // (User shape, the approver), and must never carry an `approvedBy`
  // relation field.

  describe('Prescription relation contract (regression)', () => {
    it('exposes customer (Customer) and pharmacist (User) as distinct relations and no approvedBy relation', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-CONTRACT-001',
          patientName: 'Contract Patient',
          branchId,
          customerId,
          status: 'PENDING',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id)
      const res = await prescriptionGET(req, { params: { id: rx.id } })
      const json = (await res.json()) as {
        success: boolean
        data: {
          approvedById: string | null
          customerId: string | null
          customer: { id: string; name: string } | null
          pharmacist: { id: string; name: string } | null
        }
      }

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)

      // The approver column still exists and is null before approval.
      expect(json.data.approvedById).toBeNull()

      // customer relation must resolve to the Customer (id matches the
      // customer's id, NOT the actor user's id).
      expect(json.data.customer).not.toBeNull()
      expect(json.data.customer!.id).toBe(customerId)
      expect(json.data.customer!.id).not.toBe(actor.id)
      expect(json.data.customer!.name).toBe('Rx Patient')

      // pharmacist must be null until approval.
      expect(json.data.pharmacist).toBeNull()

      // The misleading `approvedBy` relation accessor must not appear.
      const dataRecord = json.data as Record<string, unknown>
      expect(dataRecord).not.toHaveProperty('approvedBy')
    })

    it('after approval, pharmacist resolves to the approving User and customer remains the Customer', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-CONTRACT-002',
          patientName: 'Contract Patient 2',
          branchId,
          customerId,
          status: 'PENDING',
        },
      })

      const approveReq = new NextRequest(
        'http://localhost:3000/api/prescriptions/' + rx.id + '/approve',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: 'Looks good' }),
        }
      )
      const approveRes = await approvePOST(approveReq, { params: { id: rx.id } })
      expect(approveRes.status).toBe(200)

      const detailReq = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id)
      const detailRes = await prescriptionGET(detailReq, { params: { id: rx.id } })
      const json = (await detailRes.json()) as {
        success: boolean
        data: {
          status: string
          approvedById: string
          customerId: string | null
          customer: { id: string; name: string } | null
          pharmacist: { id: string; name: string } | null
        }
      }

      expect(json.success).toBe(true)
      expect(json.data.status).toBe('APPROVED')
      expect(json.data.approvedById).toBe(actor.id)

      // pharmacist must resolve to the approving User (id matches actor,
      // NOT the customer).
      expect(json.data.pharmacist).not.toBeNull()
      expect(json.data.pharmacist!.id).toBe(actor.id)
      expect(json.data.pharmacist!.id).not.toBe(customerId)
      expect(json.data.pharmacist!.name).toBe('Dr. Test')

      // customer relation unaffected by approval; still points to the
      // Customer, not the User actor.
      expect(json.data.customer).not.toBeNull()
      expect(json.data.customer!.id).toBe(customerId)
      expect(json.data.customer!.id).not.toBe(actor.id)

      // Sanity: the FK columns in the database match the relation rows.
      const dbRx = await prisma.prescription.findUnique({ where: { id: rx.id } })
      expect(dbRx!.customerId).toBe(customerId)
      expect(dbRx!.approvedById).toBe(actor.id)

      // No `approvedBy` relation accessor on the payload.
      const dataRecord = json.data as Record<string, unknown>
      expect(dataRecord).not.toHaveProperty('approvedBy')
    })
  })

  // ─── POST /api/prescriptions/[id]/reject ─────────────────

  describe('POST /api/prescriptions/[id]/reject', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: 'Wrong' }),
      })
      const res = await rejectPOST(req, { params: { id: 'rx-1' } })
      expect(res.status).toBe(401)
    })

    it('returns 404 when not found', async () => {
      mockUser(actor)
      const req = new NextRequest('http://localhost:3000/api/prescriptions/unknown/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: 'Wrong' }),
      })
      const res = await rejectPOST(req, { params: { id: 'unknown' } })
      expect(res.status).toBe(404)
    })

    it('returns 400 when rejecting a non-PENDING prescription', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-TEST-007',
          patientName: 'Test',
          branchId,
          status: 'APPROVED',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id + '/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: 'Wrong' }),
      })
      const res = await rejectPOST(req, { params: { id: rx.id } })
      expect(res.status).toBe(400)
    })

    it('rejects prescription in real database', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-TEST-008',
          patientName: 'Test',
          branchId,
          status: 'PENDING',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id + '/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: 'Invalid dosage' }),
      })
      const res = await rejectPOST(req, { params: { id: rx.id } })
      const json = (await res.json()) as {
        success: boolean
        data: { status: string; rejectionReason: string }
      }

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('REJECTED')
      expect(json.data.rejectionReason).toBe('Invalid dosage')

      const dbRx = await prisma.prescription.findUnique({ where: { id: rx.id } })
      expect(dbRx!.status).toBe('REJECTED')
      expect(dbRx!.rejectionReason).toBe('Invalid dosage')
    })
  })

  // ─── POST /api/prescriptions/[id]/images ─────────────────

  describe('POST /api/prescriptions/[id]/images', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: 'https://example.com/img.jpg',
          fileName: 'img.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
        }),
      })
      const res = await imagesPOST(req, { params: { id: 'rx-1' } })
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking prescriptions:create', async () => {
      mockReject("Forbidden: requires permission 'prescriptions:create'")
      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: 'https://example.com/img.jpg',
          fileName: 'img.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
        }),
      })
      const res = await imagesPOST(req, { params: { id: 'rx-1' } })
      expect(res.status).toBe(403)
    })

    it('returns 400 when validation fails', async () => {
      mockUser(actor)
      const req = new NextRequest('http://localhost:3000/api/prescriptions/rx-1/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: '',
          fileName: '',
          fileSize: 0,
          mimeType: '',
        }),
      })
      const res = await imagesPOST(req, { params: { id: 'rx-1' } })
      const json = (await res.json()) as { success: boolean; error: { code: string } }
      expect(res.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error.code).toBe('VALIDATION')
    })

    it('returns 404 when prescription not found', async () => {
      mockUser(actor)
      const req = new NextRequest('http://localhost:3000/api/prescriptions/unknown/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: 'https://example.com/img.jpg',
          fileName: 'img.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
        }),
      })
      const res = await imagesPOST(req, { params: { id: 'unknown' } })
      expect(res.status).toBe(404)
    })

    it('adds image to prescription in real database', async () => {
      mockUser(actor)
      const rx = await prisma.prescription.create({
        data: {
          prescriptionNumber: 'RX-TEST-009',
          patientName: 'Test',
          branchId,
          status: 'PENDING',
        },
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/' + rx.id + '/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: 'https://example.com/img.jpg',
          fileName: 'img.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
        }),
      })
      const res = await imagesPOST(req, { params: { id: rx.id } })
      const json = (await res.json()) as {
        success: boolean
        data: { fileUrl: string; prescriptionId: string }
      }

      expect(res.status).toBe(201)
      expect(json.success).toBe(true)
      expect(json.data.fileUrl).toBe('https://example.com/img.jpg')

      const dbImg = await prisma.prescriptionImage.findFirst({
        where: { prescriptionId: rx.id },
      })
      expect(dbImg).not.toBeNull()
      expect(dbImg!.fileUrl).toBe('https://example.com/img.jpg')
    })
  })

  // ─── GET /api/prescriptions/stats ────────────────────────

  describe('GET /api/prescriptions/stats', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const req = new NextRequest('http://localhost:3000/api/prescriptions/stats')
      const res = await statsGET(req)
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking prescriptions:read', async () => {
      mockReject("Forbidden: requires permission 'prescriptions:read'")
      const req = new NextRequest('http://localhost:3000/api/prescriptions/stats')
      const res = await statsGET(req)
      expect(res.status).toBe(403)
    })

    it('returns stats from real database', async () => {
      mockUser(actor)
      await prisma.prescription.createMany({
        data: [
          {
            prescriptionNumber: 'RX-STAT-001',
            patientName: 'A',
            branchId,
            status: 'PENDING',
          },
          {
            prescriptionNumber: 'RX-STAT-002',
            patientName: 'B',
            branchId,
            status: 'APPROVED',
          },
          {
            prescriptionNumber: 'RX-STAT-003',
            patientName: 'C',
            branchId,
            status: 'REJECTED',
          },
        ],
      })

      const req = new NextRequest('http://localhost:3000/api/prescriptions/stats')
      const res = await statsGET(req)
      const json = (await res.json()) as {
        success: boolean
        data: {
          total: number
          pending: number
          approved: number
          dispensed: number
          rejected: number
        }
      }

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.total).toBe(3)
      expect(json.data.pending).toBe(1)
      expect(json.data.approved).toBe(1)
      expect(json.data.dispensed).toBe(0)
      expect(json.data.rejected).toBe(1)
    })
  })
})
