import type { Prisma } from '@prisma/client'

import prisma from '@/lib/db/prisma'
import { assertBranchAccess } from '@/lib/inventory/branch-access'
import type {
  ApprovePrescriptionInput,
  CreatePrescriptionInput,
  PrescriptionQueryParams,
  RejectPrescriptionInput,
  UpdatePrescriptionInput,
} from '@/lib/validations/prescription'

export interface PrescriptionActor {
  id: string
  branchId: string | null
  permissions?: string[]
}

export function generatePrescriptionNumber(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const randomSuffix = Math.floor(1000 + Math.random() * 9000)
  return `RX-${y}${m}${d}-${randomSuffix}`
}

const prescriptionInclude = {
  images: true,
  pharmacist: {
    select: { id: true, name: true, email: true },
  },
  approvedBy: {
    select: { id: true, name: true, phone: true, email: true },
  },
  sales: {
    select: {
      id: true,
      invoiceNumber: true,
      saleDate: true,
      totalAmount: true,
      status: true,
    },
  },
} satisfies Prisma.PrescriptionInclude

export async function createPrescription(input: CreatePrescriptionInput, actor: PrescriptionActor) {
  await assertBranchAccess(actor, input.branchId)

  const prescriptionNumber = generatePrescriptionNumber()

  const prescription = await prisma.$transaction(async (tx) => {
    const rx = await tx.prescription.create({
      data: {
        prescriptionNumber,
        patientName: input.patientName,
        patientAge: input.patientAge ?? null,
        patientPhone: input.patientPhone ?? null,
        doctorName: input.doctorName ?? null,
        doctorRegNumber: input.doctorRegNumber ?? null,
        prescriptionDate: input.prescriptionDate ? new Date(input.prescriptionDate) : new Date(),
        notes: input.notes ?? null,
        status: 'PENDING',
        customerId: input.customerId ?? null,
        branchId: input.branchId,
        images:
          input.images && input.images.length > 0
            ? {
                create: input.images.map((img) => ({
                  fileUrl: img.fileUrl,
                  fileName: img.fileName,
                  fileSize: img.fileSize,
                  mimeType: img.mimeType,
                })),
              }
            : undefined,
      },
      include: prescriptionInclude,
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PRESCRIPTION_CREATE',
        entity: 'Prescription',
        entityId: rx.id,
        newData: {
          prescriptionNumber,
          patientName: rx.patientName,
          branchId: rx.branchId,
          status: rx.status,
        },
      },
    })

    return rx
  })

  return prescription
}

export async function getPrescriptionById(id: string, actor: PrescriptionActor) {
  const rx = await prisma.prescription.findUnique({
    where: { id },
    include: prescriptionInclude,
  })

  if (!rx) {
    throw new Error('Not Found: prescription')
  }

  await assertBranchAccess(actor, rx.branchId)
  return rx
}

export async function listPrescriptions(params: PrescriptionQueryParams, actor: PrescriptionActor) {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    branchId,
    customerId,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params

  const targetBranch = actor.branchId ?? branchId
  if (targetBranch) {
    await assertBranchAccess(actor, targetBranch)
  }

  const where: Prisma.PrescriptionWhereInput = {}

  if (targetBranch) {
    where.branchId = targetBranch
  }

  if (status) {
    where.status = status
  }

  if (customerId) {
    where.customerId = customerId
  }

  if (search) {
    where.OR = [
      { prescriptionNumber: { contains: search, mode: 'insensitive' } },
      { patientName: { contains: search, mode: 'insensitive' } },
      { patientPhone: { contains: search, mode: 'insensitive' } },
      { doctorName: { contains: search, mode: 'insensitive' } },
      { doctorRegNumber: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    }
  }

  const skip = (page - 1) * limit
  const orderBy: Prisma.PrescriptionOrderByWithRelationInput = {
    [sortBy]: sortOrder,
  }

  const [data, total] = await Promise.all([
    prisma.prescription.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: prescriptionInclude,
    }),
    prisma.prescription.count({ where }),
  ])

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
}

export async function updatePrescription(
  id: string,
  input: UpdatePrescriptionInput,
  actor: PrescriptionActor
) {
  const rx = await prisma.prescription.findUnique({
    where: { id },
  })

  if (!rx) {
    throw new Error('Not Found: prescription')
  }

  await assertBranchAccess(actor, rx.branchId)

  if (rx.status !== 'PENDING') {
    throw new Error(`Cannot update prescription in ${rx.status} status`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.prescription.update({
      where: { id },
      data: {
        patientName: input.patientName,
        patientAge: input.patientAge,
        patientPhone: input.patientPhone,
        doctorName: input.doctorName,
        doctorRegNumber: input.doctorRegNumber,
        prescriptionDate: input.prescriptionDate ? new Date(input.prescriptionDate) : undefined,
        notes: input.notes,
        customerId: input.customerId,
      },
      include: prescriptionInclude,
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PRESCRIPTION_UPDATE',
        entity: 'Prescription',
        entityId: id,
        oldData: {
          patientName: rx.patientName,
          doctorName: rx.doctorName,
        },
        newData: {
          patientName: res.patientName,
          doctorName: res.doctorName,
        },
      },
    })

    return res
  })

  return updated
}

export async function approvePrescription(
  id: string,
  input: ApprovePrescriptionInput,
  actor: PrescriptionActor
) {
  const rx = await prisma.prescription.findUnique({
    where: { id },
  })

  if (!rx) {
    throw new Error('Not Found: prescription')
  }

  await assertBranchAccess(actor, rx.branchId)

  if (rx.status !== 'PENDING') {
    throw new Error(`Cannot approve prescription in ${rx.status} status`)
  }

  const approved = await prisma.$transaction(async (tx) => {
    const res = await tx.prescription.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: actor.id,
        approvedAt: new Date(),
        notes: input.notes !== undefined ? input.notes : rx.notes,
      },
      include: prescriptionInclude,
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PRESCRIPTION_APPROVE',
        entity: 'Prescription',
        entityId: id,
        newData: {
          status: 'APPROVED',
          approvedById: actor.id,
        },
      },
    })

    return res
  })

  return approved
}

export async function rejectPrescription(
  id: string,
  input: RejectPrescriptionInput,
  actor: PrescriptionActor
) {
  const rx = await prisma.prescription.findUnique({
    where: { id },
  })

  if (!rx) {
    throw new Error('Not Found: prescription')
  }

  await assertBranchAccess(actor, rx.branchId)

  if (rx.status !== 'PENDING') {
    throw new Error(`Cannot reject prescription in ${rx.status} status`)
  }

  const rejected = await prisma.$transaction(async (tx) => {
    const res = await tx.prescription.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: input.rejectionReason,
      },
      include: prescriptionInclude,
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PRESCRIPTION_REJECT',
        entity: 'Prescription',
        entityId: id,
        newData: {
          status: 'REJECTED',
          rejectionReason: input.rejectionReason,
        },
      },
    })

    return res
  })

  return rejected
}

export async function addPrescriptionImage(
  prescriptionId: string,
  image: { fileUrl: string; fileName: string; fileSize: number; mimeType: string },
  actor: PrescriptionActor
) {
  const rx = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
  })

  if (!rx) {
    throw new Error('Not Found: prescription')
  }

  await assertBranchAccess(actor, rx.branchId)

  return prisma.prescriptionImage.create({
    data: {
      prescriptionId,
      fileUrl: image.fileUrl,
      fileName: image.fileName,
      fileSize: image.fileSize,
      mimeType: image.mimeType,
    },
  })
}

export async function getPrescriptionStats(branchId?: string, actor?: PrescriptionActor) {
  const targetBranch = actor?.branchId ?? branchId
  if (targetBranch && actor) {
    await assertBranchAccess(actor, targetBranch)
  }

  const where: Prisma.PrescriptionWhereInput = targetBranch ? { branchId: targetBranch } : {}

  const [total, pending, approved, dispensed, rejected] = await Promise.all([
    prisma.prescription.count({ where }),
    prisma.prescription.count({ where: { ...where, status: 'PENDING' } }),
    prisma.prescription.count({ where: { ...where, status: 'APPROVED' } }),
    prisma.prescription.count({ where: { ...where, status: 'DISPENSED' } }),
    prisma.prescription.count({ where: { ...where, status: 'REJECTED' } }),
  ])

  return { total, pending, approved, dispensed, rejected }
}
