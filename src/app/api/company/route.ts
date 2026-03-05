import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchMCAData } from '@/lib/mca-service'
import { fetchGSTData } from '@/lib/gst-service'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any).id
  const companies = await prisma.companyUser.findMany({
    where: { userId },
    include: {
      company: {
        include: {
          complianceChecks: { orderBy: { checkedAt: 'desc' } },
          _count: { select: { mcaFilings: true, gstReturns: true, directors: true } },
        },
      },
    },
  })

  return NextResponse.json(companies.map(cu => ({
    ...cu.company,
    userRole: cu.role,
  })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any).id
  const { cin, gstin, name } = await req.json()

  if (!cin && !gstin) {
    return NextResponse.json({ error: 'Please provide CIN or GSTIN' }, { status: 400 })
  }

  // Check if company already exists
  if (cin) {
    const existing = await prisma.company.findUnique({ where: { cin } })
    if (existing) {
      // Link user to existing company
      await prisma.companyUser.upsert({
        where: { userId_companyId: { userId, companyId: existing.id } },
        update: {},
        create: { userId, companyId: existing.id, role: 'VIEWER' },
      })
      return NextResponse.json(existing)
    }
  }

  // Fetch data from MCA if CIN provided
  let mcaData = null
  if (cin) {
    mcaData = await fetchMCAData(cin)
  }

  // Fetch data from GST if GSTIN provided
  let gstData = null
  if (gstin) {
    gstData = await fetchGSTData(gstin)
  }

  // Create company
  const company = await prisma.company.create({
    data: {
      name: mcaData?.name || gstData?.legalName || name || 'Company',
      cin: cin || null,
      gstin: gstin || null,
      dateOfIncorporation: mcaData?.dateOfIncorporation ? new Date(mcaData.dateOfIncorporation) : null,
      registeredOffice: mcaData?.registeredOffice || gstData?.address || null,
      companyType: mcaData?.companyType || gstData?.constitutionOfBusiness || null,
      companyStatus: mcaData?.companyStatus || gstData?.status || null,
      state: mcaData?.state || gstData?.state || null,
      email: mcaData?.email || null,
      authorizedCapital: mcaData?.authorizedCapital || null,
      paidUpCapital: mcaData?.paidUpCapital || null,
    },
  })

  // Link user as owner
  await prisma.companyUser.create({
    data: { userId, companyId: company.id, role: 'OWNER' },
  })

  // Save directors if available
  if (mcaData?.directors?.length) {
    await prisma.director.createMany({
      data: mcaData.directors.map(d => ({
        companyId: company.id,
        din: d.din || null,
        name: d.name,
        designation: d.designation || null,
        dateOfAppointment: d.dateOfAppointment ? new Date(d.dateOfAppointment) : null,
      })),
    })
  }

  // Save charges if available
  if (mcaData?.charges?.length) {
    await prisma.charge.createMany({
      data: mcaData.charges.map(c => ({
        companyId: company.id,
        chargeId: c.chargeId || null,
        chargeHolder: c.chargeHolder || null,
        dateOfCreation: c.dateOfCreation ? new Date(c.dateOfCreation) : null,
        status: c.status || null,
        amount: c.amount || null,
      })),
    })
  }

  // Save MCA filings if available
  if (mcaData?.filings?.length) {
    await prisma.mCAFiling.createMany({
      data: mcaData.filings.map(f => ({
        companyId: company.id,
        formType: f.formType,
        formName: f.formName || '',
        filingDate: f.filingDate ? new Date(f.filingDate) : null,
        status: f.status,
      })),
    })
  }

  return NextResponse.json(company)
}
