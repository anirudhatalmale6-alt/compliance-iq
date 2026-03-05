import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Update company with enriched Tofler data
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, toflerData } = await req.json()
  if (!companyId || !toflerData) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

  const userId = (session.user as any).id
  const access = await prisma.companyUser.findUnique({
    where: { userId_companyId: { userId, companyId } },
  })
  if (!access) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  // Update company with Tofler data
  const updateData: any = {}
  if (toflerData.name) updateData.name = toflerData.name
  if (toflerData.status) updateData.companyStatus = toflerData.status
  if (toflerData.companyType) updateData.companyType = toflerData.companyType
  if (toflerData.state) updateData.state = toflerData.state
  if (toflerData.registeredOffice) updateData.registeredOffice = toflerData.registeredOffice
  if (toflerData.dateOfIncorporation) {
    try { updateData.dateOfIncorporation = new Date(toflerData.dateOfIncorporation) } catch {}
  }
  if (toflerData.authorizedCapital) updateData.authorizedCapital = toflerData.authorizedCapital
  if (toflerData.paidUpCapital) updateData.paidUpCapital = toflerData.paidUpCapital

  if (Object.keys(updateData).length > 0) {
    await prisma.company.update({
      where: { id: companyId },
      data: updateData,
    })
  }

  // Add directors if found
  if (toflerData.directorNames?.length > 0) {
    const existingDirs = await prisma.director.count({ where: { companyId } })
    if (existingDirs === 0) {
      await prisma.director.createMany({
        data: toflerData.directorNames.map((name: string) => ({
          companyId,
          name,
          designation: 'Director',
        })),
      })
      // Also add unnamed directors if count is higher
      const remaining = (toflerData.directorCount || 0) - toflerData.directorNames.length
      if (remaining > 0) {
        const extras = Array.from({ length: remaining }, (_, i) => ({
          companyId,
          name: `Director ${toflerData.directorNames.length + i + 1}`,
          designation: 'Director',
        }))
        await prisma.director.createMany({ data: extras })
      }
    }
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      complianceChecks: { orderBy: { checkedAt: 'desc' } },
      _count: { select: { mcaFilings: true, gstReturns: true, directors: true } },
    },
  })

  return NextResponse.json(company)
}
