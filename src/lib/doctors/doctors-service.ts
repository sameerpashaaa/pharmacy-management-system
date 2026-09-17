import prisma from '@/lib/db/prisma'

export interface DoctorInput {
  name: string
  registrationNo: string
  mciNumber?: string
  specialization?: string
  clinicName?: string
  clinicAddress?: string
  phone?: string
  email?: string
  organizationId: string
  isActive?: boolean
}

export async function getDoctors(organizationId: string) {
  return prisma.doctor.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
  })
}

export async function getDoctorById(id: string, organizationId: string) {
  const doctor = await prisma.doctor.findUnique({
    where: { id },
  })
  if (doctor?.organizationId !== organizationId) return null
  return doctor
}

export async function createDoctor(data: DoctorInput) {
  return prisma.doctor.create({
    data,
  })
}

export async function updateDoctor(id: string, organizationId: string, data: Partial<DoctorInput>) {
  const existing = await getDoctorById(id, organizationId)
  if (!existing) throw new Error('Doctor not found')
  return prisma.doctor.update({
    where: { id },
    data,
  })
}

export async function deleteDoctor(id: string, organizationId: string) {
  const existing = await getDoctorById(id, organizationId)
  if (!existing) throw new Error('Doctor not found')
  return prisma.doctor.delete({
    where: { id },
  })
}
