import {
  approvePrescriptionSchema,
  createPrescriptionSchema,
  prescriptionQuerySchema,
  rejectPrescriptionSchema,
  updatePrescriptionSchema,
} from '@/lib/validations/prescription'

describe('Prescription Validation Schemas', () => {
  describe('createPrescriptionSchema', () => {
    it('accepts valid prescription data', () => {
      const valid = {
        patientName: 'John Doe',
        patientAge: 45,
        patientPhone: '+919876543210',
        doctorName: 'Dr. Smith',
        doctorRegNumber: 'MED-12345',
        prescriptionDate: '2026-09-15T00:00:00.000Z',
        notes: 'Take with food',
        branchId: 'branch-1',
        images: [
          {
            fileUrl: 'https://example.com/rx.jpg',
            fileName: 'rx.jpg',
            fileSize: 1024,
            mimeType: 'image/jpeg',
          },
        ],
      }
      const parsed = createPrescriptionSchema.parse(valid)
      expect(parsed.patientName).toBe('John Doe')
      expect(parsed.patientAge).toBe(45)
      expect(parsed.images).toHaveLength(1)
    })

    it('rejects missing patient name', () => {
      expect(() =>
        createPrescriptionSchema.parse({
          patientName: '',
          branchId: 'branch-1',
        })
      ).toThrow()
    })

    it('rejects negative patient age', () => {
      expect(() =>
        createPrescriptionSchema.parse({
          patientName: 'Jane',
          patientAge: -5,
          branchId: 'branch-1',
        })
      ).toThrow()
    })

    it('rejects missing branchId', () => {
      expect(() =>
        createPrescriptionSchema.parse({
          patientName: 'Jane',
          branchId: '',
        })
      ).toThrow()
    })
  })

  describe('updatePrescriptionSchema', () => {
    it('accepts partial updates', () => {
      const update = {
        patientName: 'Updated Name',
        notes: 'Updated notes',
      }
      const parsed = updatePrescriptionSchema.parse(update)
      expect(parsed.patientName).toBe('Updated Name')
      expect(parsed.notes).toBe('Updated notes')
    })
  })

  describe('approvePrescriptionSchema', () => {
    it('allows empty or optional notes', () => {
      expect(approvePrescriptionSchema.parse({})).toEqual({})
      expect(approvePrescriptionSchema.parse({ notes: 'Verified' })).toEqual({
        notes: 'Verified',
      })
    })
  })

  describe('rejectPrescriptionSchema', () => {
    it('requires a rejection reason', () => {
      expect(() => rejectPrescriptionSchema.parse({})).toThrow()
      expect(() => rejectPrescriptionSchema.parse({ rejectionReason: '' })).toThrow()
      const parsed = rejectPrescriptionSchema.parse({
        rejectionReason: 'Invalid signature',
      })
      expect(parsed.rejectionReason).toBe('Invalid signature')
    })
  })

  describe('prescriptionQuerySchema', () => {
    it('provides sensible defaults for pagination', () => {
      const parsed = prescriptionQuerySchema.parse({})
      expect(parsed.page).toBe(1)
      expect(parsed.limit).toBe(20)
      expect(parsed.sortBy).toBe('createdAt')
      expect(parsed.sortOrder).toBe('desc')
    })

    it('coerces string numbers for page and limit', () => {
      const parsed = prescriptionQuerySchema.parse({ page: '2', limit: '10' })
      expect(parsed.page).toBe(2)
      expect(parsed.limit).toBe(10)
    })
  })
})
