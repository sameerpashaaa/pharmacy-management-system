import prisma from '@/lib/db/prisma'
import { assertBranchAccess } from '@/lib/inventory/branch-access'
import {
  approvePrescription,
  createPrescription,
  generatePrescriptionNumber,
  getPrescriptionById,
  getPrescriptionStats,
  listPrescriptions,
  rejectPrescription,
  updatePrescription,
} from '@/lib/prescriptions/prescription-service'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    prescription: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    prescriptionImage: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  assertBranchAccess: jest.fn(),
}))

const prismaMock = prisma as unknown as {
  prescription: {
    findMany: jest.Mock
    findUnique: jest.Mock
    create: jest.Mock
    update: jest.Mock
    count: jest.Mock
  }
  prescriptionImage: {
    create: jest.Mock
  }
  auditLog: {
    create: jest.Mock
  }
  $transaction: jest.Mock
}

const mockActor = {
  id: 'user-pharma-1',
  branchId: 'branch-1',
  permissions: ['prescriptions:read', 'prescriptions:create', 'prescriptions:approve'],
}

describe('Prescription Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof prismaMock) => Promise<T>): Promise<T> => {
        return cb(prismaMock)
      }
    )
  })

  describe('generatePrescriptionNumber', () => {
    it('generates a formatted prescription number', () => {
      const num = generatePrescriptionNumber(new Date(2026, 8, 15))
      expect(num).toMatch(/^RX-20260915-\d{4}$/)
    })
  })

  describe('createPrescription', () => {
    it('creates a prescription and audit log in a transaction', async () => {
      const mockRx = {
        id: 'rx-1',
        prescriptionNumber: 'RX-20260915-1234',
        patientName: 'Jane Smith',
        branchId: 'branch-1',
        status: 'PENDING',
        images: [],
      }
      prismaMock.prescription.create.mockResolvedValue(mockRx)
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' })

      const res = await createPrescription(
        {
          patientName: 'Jane Smith',
          branchId: 'branch-1',
        },
        mockActor
      )

      expect(assertBranchAccess).toHaveBeenCalledWith(mockActor, 'branch-1')
      expect(prismaMock.prescription.create).toHaveBeenCalled()
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PRESCRIPTION_CREATE',
            entity: 'Prescription',
          }),
        })
      )
      expect(res).toEqual(mockRx)
    })
  })

  describe('getPrescriptionById', () => {
    it('returns prescription when found and accessible', async () => {
      const mockRx = {
        id: 'rx-1',
        branchId: 'branch-1',
        patientName: 'Jane Smith',
      }
      prismaMock.prescription.findUnique.mockResolvedValue(mockRx)

      const res = await getPrescriptionById('rx-1', mockActor)
      expect(res).toEqual(mockRx)
      expect(assertBranchAccess).toHaveBeenCalledWith(mockActor, 'branch-1')
    })

    it('throws Not Found when prescription does not exist', async () => {
      prismaMock.prescription.findUnique.mockResolvedValue(null)
      await expect(getPrescriptionById('non-existent', mockActor)).rejects.toThrow(
        'Not Found: prescription'
      )
    })
  })

  describe('listPrescriptions', () => {
    it('returns paginated prescriptions', async () => {
      const mockList = [{ id: 'rx-1' }, { id: 'rx-2' }]
      prismaMock.prescription.findMany.mockResolvedValue(mockList)
      prismaMock.prescription.count.mockResolvedValue(2)

      const result = await listPrescriptions(
        { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
        mockActor
      )

      expect(result.data).toEqual(mockList)
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        pages: 1,
      })
    })
  })

  describe('updatePrescription', () => {
    it('updates a pending prescription successfully', async () => {
      const existing = {
        id: 'rx-1',
        branchId: 'branch-1',
        patientName: 'Old Name',
        status: 'PENDING',
      }
      const updated = {
        ...existing,
        patientName: 'New Name',
      }
      prismaMock.prescription.findUnique.mockResolvedValue(existing)
      prismaMock.prescription.update.mockResolvedValue(updated)

      const res = await updatePrescription('rx-1', { patientName: 'New Name' }, mockActor)

      expect(res.patientName).toBe('New Name')
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PRESCRIPTION_UPDATE' }),
        })
      )
    })

    it('throws error when trying to update non-pending prescription', async () => {
      const existing = {
        id: 'rx-1',
        branchId: 'branch-1',
        patientName: 'Old Name',
        status: 'APPROVED',
      }
      prismaMock.prescription.findUnique.mockResolvedValue(existing)

      await expect(
        updatePrescription('rx-1', { patientName: 'New Name' }, mockActor)
      ).rejects.toThrow(/Cannot update prescription in APPROVED status/)
    })
  })

  describe('approvePrescription', () => {
    it('approves a pending prescription', async () => {
      const existing = {
        id: 'rx-1',
        branchId: 'branch-1',
        status: 'PENDING',
        notes: null,
      }
      const approved = {
        ...existing,
        status: 'APPROVED',
        approvedById: mockActor.id,
        approvedAt: new Date(),
      }
      prismaMock.prescription.findUnique.mockResolvedValue(existing)
      prismaMock.prescription.update.mockResolvedValue(approved)

      const res = await approvePrescription('rx-1', { notes: 'Approved' }, mockActor)
      expect(res.status).toBe('APPROVED')
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PRESCRIPTION_APPROVE' }),
        })
      )
    })
  })

  describe('rejectPrescription', () => {
    it('rejects a pending prescription with reason', async () => {
      const existing = {
        id: 'rx-1',
        branchId: 'branch-1',
        status: 'PENDING',
      }
      const rejected = {
        ...existing,
        status: 'REJECTED',
        rejectionReason: 'Invalid dosage',
      }
      prismaMock.prescription.findUnique.mockResolvedValue(existing)
      prismaMock.prescription.update.mockResolvedValue(rejected)

      const res = await rejectPrescription('rx-1', { rejectionReason: 'Invalid dosage' }, mockActor)
      expect(res.status).toBe('REJECTED')
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PRESCRIPTION_REJECT' }),
        })
      )
    })
  })

  describe('getPrescriptionStats', () => {
    it('returns counts of statuses', async () => {
      prismaMock.prescription.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(4) // pending
        .mockResolvedValueOnce(3) // approved
        .mockResolvedValueOnce(2) // dispensed
        .mockResolvedValueOnce(1) // rejected

      const stats = await getPrescriptionStats('branch-1', mockActor)
      expect(stats).toEqual({
        total: 10,
        pending: 4,
        approved: 3,
        dispensed: 2,
        rejected: 1,
      })
    })
  })
})
