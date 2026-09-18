import type { Prisma } from '@prisma/client'

import prisma from '@/lib/db/prisma'

export interface GetScheduleH1RegisterParams {
  startDate: string
  endDate: string
  page?: number
  limit?: number
  search?: string
}

export async function getScheduleH1Register({
  startDate,
  endDate,
  page = 1,
  limit = 50,
  search,
}: GetScheduleH1RegisterParams) {
  const skip = (page - 1) * limit
  const where: Prisma.ScheduleH1RegisterWhereInput = {
    dispensedDate: {
      gte: new Date(startDate),
      lte: new Date(endDate),
    },
  }

  if (search) {
    where.OR = [
      { medicineName: { contains: search, mode: 'insensitive' } },
      { doctorName: { contains: search, mode: 'insensitive' } },
      { patientName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.scheduleH1Register.findMany({
      where,
      orderBy: { dispensedDate: 'desc' },
      skip,
      take: limit,
      include: {
        doctor: { select: { name: true, registrationNo: true } },
      },
    }),
    prisma.scheduleH1Register.count({ where }),
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
