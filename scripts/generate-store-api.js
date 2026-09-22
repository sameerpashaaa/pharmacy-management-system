const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '../src/app/api/store');

const templates = {
  'walls/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { getWalls, createWall } from '@/lib/store/rack-service'
import { wallSchema } from '@/lib/validations/store'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.STORE_READ)
    const branchId = req.nextUrl.searchParams.get('branchId') || user.branchId
    if (!branchId) throw new Error('Branch ID required')
    
    const data = await getWalls(branchId)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = wallSchema.parse(body)
    
    const result = await createWall(data)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}
`,

  'walls/[id]/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { getWall, updateWall, deleteWall } from '@/lib/store/rack-service'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_READ)
    const data = await getWall(params.id)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = await updateWall(params.id, body)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    await deleteWall(params.id)
    return NextResponse.json({ success: true, message: 'Wall deleted' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}
`,

  'racks/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { createRack } from '@/lib/store/rack-service'
import { rackSchema } from '@/lib/validations/store'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = rackSchema.parse(body)
    
    const result = await createRack(data)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}
`,

  'racks/[id]/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { getRack, updateRack, deleteRack } from '@/lib/store/rack-service'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_READ)
    const data = await getRack(params.id)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = await updateRack(params.id, body)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    await deleteRack(params.id)
    return NextResponse.json({ success: true, message: 'Rack deleted' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}
`,

  'shelves/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { createShelf } from '@/lib/store/rack-service'
import { rackShelfSchema } from '@/lib/validations/store'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = rackShelfSchema.parse(body)
    
    const result = await createShelf(data)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}
`,

  'shelves/[id]/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { updateShelf, deleteShelf } from '@/lib/store/rack-service'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = await updateShelf(params.id, body)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    await deleteShelf(params.id)
    return NextResponse.json({ success: true, message: 'Shelf deleted' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}
`,

  'bins/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { createBin } from '@/lib/store/rack-service'
import { storeBinSchema } from '@/lib/validations/store'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = storeBinSchema.parse(body)
    
    const result = await createBin(data)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}
`,

  'bins/[id]/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { getBin, updateBin, deleteBin, assignStockToBin } from '@/lib/store/rack-service'
import { assignStockSchema } from '@/lib/validations/store'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_READ)
    const data = await getBin(params.id)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = await updateBin(params.id, body)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requirePermission(PERMISSIONS.STORE_ASSIGN)
    const body = await req.json()
    const data = assignStockSchema.parse(body)
    
    const result = await assignStockToBin(params.id, data, user.id)
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    await deleteBin(params.id)
    return NextResponse.json({ success: true, message: 'Bin deleted' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}
`,

  'locate/route.ts': `import { NextRequest, NextResponse } from 'next/server'
import { locateProduct } from '@/lib/store/rack-service'
import { storeLocateQuerySchema } from '@/lib/validations/store'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.STORE_READ)
    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    
    const query = storeLocateQuerySchema.parse({
      ...searchParams,
      branchId: searchParams.branchId || user.branchId,
    })
    
    const data = await locateProduct(query)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 })
  }
}
`,
};

Object.entries(templates).forEach(([route, content]) => {
  const fullPath = path.join(basePath, route);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
});

console.log('API routes created.');
