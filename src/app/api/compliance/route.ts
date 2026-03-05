import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateMCAComplianceChecks, fetchMCAData } from '@/lib/mca-service'
import { generateGSTComplianceChecks } from '@/lib/gst-service'
import { fetchGSTData } from '@/lib/gst-service'
import { fetchToflerViaProxy } from '@/lib/tofler-proxy'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Run compliance check for a company
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = await req.json()
  if (!companyId) return NextResponse.json({ error: 'Company ID required' }, { status: 400 })

  const userId = (session.user as any).id

  // Verify user has access
  const access = await prisma.companyUser.findUnique({
    where: { userId_companyId: { userId, companyId } },
  })
  if (!access) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  // Get company with related data
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      mcaFilings: true,
      gstReturns: true,
      directors: true,
      charges: true,
    },
  })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  // Fetch fresh data: try Edge enrichment API first (Tofler via Cloudflare), then fallback to Node.js fetch
  let enrichedCompany: any = { ...company }
  if (company.cin) {
    let toflerData: any = null

    // Fetch Tofler data directly via proxy (no self-call)
    try {
      toflerData = await fetchToflerViaProxy(company.cin)
      if (toflerData) {
        console.log('Tofler proxy success:', toflerData.name, 'AGM:', toflerData.lastAGMDate, 'FY:', toflerData.fyEndingDate)
      }
    } catch (e) {
      console.log('Tofler proxy failed, trying Node.js fetch...')
    }

    // Fallback to Node.js fetch (Tofler + data.gov.in + CIN decoder)
    const mcaData = await fetchMCAData(company.cin, company.name)

    // Merge: prefer Tofler edge data, then Node.js fetch, then existing DB data
    enrichedCompany = {
      ...company,
      companyStatus: toflerData?.status || mcaData?.companyStatus || company.companyStatus,
      companyType: toflerData?.companyType || mcaData?.companyType || company.companyType,
      registeredOffice: toflerData?.registeredOffice || mcaData?.registeredOffice || company.registeredOffice,
      state: toflerData?.state || mcaData?.state || company.state,
      dateOfIncorporation: toflerData?.dateOfIncorporation || mcaData?.dateOfIncorporation || company.dateOfIncorporation,
      lastAGMDate: toflerData?.lastAGMDate || mcaData?.lastAGMDate,
      lastBalanceSheetDate: toflerData?.lastBalanceSheetDate || mcaData?.lastBalanceSheetDate,
      fyEndingDate: toflerData?.fyEndingDate,
      directorCount: toflerData?.directorCount || mcaData?.directorCount || mcaData?.directors?.length || 0,
      directors: mcaData?.directors || [],
      name: toflerData?.name || mcaData?.name || company.name,
    }

    // Update company record with fresh data
    const updateData: any = {}
    if (enrichedCompany.name && enrichedCompany.name !== company.name) updateData.name = enrichedCompany.name
    if (enrichedCompany.companyStatus && enrichedCompany.companyStatus !== company.companyStatus) updateData.companyStatus = enrichedCompany.companyStatus
    if (enrichedCompany.companyType && enrichedCompany.companyType !== company.companyType) updateData.companyType = enrichedCompany.companyType
    if (enrichedCompany.registeredOffice && !company.registeredOffice) updateData.registeredOffice = enrichedCompany.registeredOffice
    if (enrichedCompany.state && enrichedCompany.state !== company.state) updateData.state = enrichedCompany.state
    if (Object.keys(updateData).length > 0) {
      await prisma.company.update({ where: { id: companyId }, data: updateData })
    }

    // Save directors if we got new ones
    const dirNames = toflerData?.directorNames || mcaData?.directors?.map((d: any) => d.name) || []
    if (dirNames.length > 0 && company.directors.length === 0) {
      await prisma.director.createMany({
        data: dirNames.map((name: string) => ({
          companyId: company.id,
          name,
          designation: 'Director',
        })),
      })
      const remaining = (enrichedCompany.directorCount || 0) - dirNames.length
      if (remaining > 0) {
        const extras = Array.from({ length: remaining }, (_, i) => ({
          companyId: company.id,
          name: `Director ${dirNames.length + i + 1}`,
          designation: 'Director' as string,
        }))
        await prisma.director.createMany({ data: extras })
      }
    }
  }

  // Fetch fresh GST data if GSTIN exists
  let gstData = null
  if (company.gstin) {
    gstData = await fetchGSTData(company.gstin)
  }

  // Generate compliance checks
  const mcaChecks = generateMCAComplianceChecks(enrichedCompany, company.mcaFilings, enrichedCompany.directors || company.directors)
  const gstChecks = generateGSTComplianceChecks(gstData, company.gstReturns)
  const allChecks = [...mcaChecks, ...gstChecks]

  // Get existing overrides
  const overrides = await prisma.complianceOverride.findMany({
    where: { companyId },
  })
  const overrideMap = new Map(overrides.map(o => [o.checkName, o]))

  // Delete old checks and save new ones (applying overrides)
  await prisma.complianceCheck.deleteMany({ where: { companyId } })
  await prisma.complianceCheck.createMany({
    data: allChecks.map(check => {
      const override = overrideMap.get(check.checkName)
      return {
        companyId,
        category: check.category,
        checkName: check.checkName,
        description: check.description,
        status: override ? override.status : check.status,
        severity: check.severity,
        action: override ? `[Manually verified] ${override.notes || ''}` : (check.action || null),
        deadline: check.deadline || null,
        penalty: check.penalty || null,
        reference: check.reference || null,
      }
    }),
  })

  // Update company GST status if fetched
  if (gstData) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        companyStatus: company.companyStatus || gstData.status,
        state: company.state || gstData.state,
        registeredOffice: company.registeredOffice || gstData.address,
      },
    })
  }

  // Fetch updated checks
  const savedChecks = await prisma.complianceCheck.findMany({
    where: { companyId },
    orderBy: [{ severity: 'asc' }, { status: 'asc' }],
  })

  // Calculate compliance score
  const total = savedChecks.length
  const compliant = savedChecks.filter(c => c.status === 'COMPLIANT').length
  const nonCompliant = savedChecks.filter(c => c.status === 'NON_COMPLIANT').length
  const attention = savedChecks.filter(c => c.status === 'ATTENTION').length
  const notVerified = savedChecks.filter(c => c.status === 'NOT_VERIFIED').length
  const verifiedTotal = total - notVerified
  const score = verifiedTotal > 0 ? Math.round((compliant / verifiedTotal) * 100) : 0

  return NextResponse.json({
    checks: savedChecks,
    summary: { total, compliant, nonCompliant, attention, notVerified, score },
  })
}

// Manual override - mark check as verified/compliant
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { checkId, status, notes } = await req.json()
  if (!checkId || !status) return NextResponse.json({ error: 'Check ID and status required' }, { status: 400 })

  const userId = (session.user as any).id

  // Get the check to find companyId
  const check = await prisma.complianceCheck.findUnique({ where: { id: checkId } })
  if (!check) return NextResponse.json({ error: 'Check not found' }, { status: 404 })

  // Verify access
  const access = await prisma.companyUser.findUnique({
    where: { userId_companyId: { userId, companyId: check.companyId } },
  })
  if (!access) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  // Save override (persists across check regeneration)
  await prisma.complianceOverride.upsert({
    where: { companyId_checkName: { companyId: check.companyId, checkName: check.checkName } },
    update: { status, notes, verifiedAt: new Date() },
    create: { companyId: check.companyId, checkName: check.checkName, status, notes },
  })

  // Update the check itself
  await prisma.complianceCheck.update({
    where: { id: checkId },
    data: {
      status,
      action: `[Manually verified] ${notes || ''}`,
    },
  })

  // Return updated checks
  const checks = await prisma.complianceCheck.findMany({
    where: { companyId: check.companyId },
    orderBy: [{ severity: 'asc' }, { status: 'asc' }],
  })

  const total = checks.length
  const compliant = checks.filter(c => c.status === 'COMPLIANT').length
  const nonCompliant = checks.filter(c => c.status === 'NON_COMPLIANT').length
  const attention = checks.filter(c => c.status === 'ATTENTION').length
  const notVerified = checks.filter(c => c.status === 'NOT_VERIFIED').length
  const verifiedTotal = total - notVerified
  const score = verifiedTotal > 0 ? Math.round((compliant / verifiedTotal) * 100) : 0

  return NextResponse.json({
    checks,
    summary: { total, compliant, nonCompliant, attention, notVerified, score },
  })
}

// Get existing compliance checks
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'Company ID required' }, { status: 400 })

  const userId = (session.user as any).id
  const access = await prisma.companyUser.findUnique({
    where: { userId_companyId: { userId, companyId } },
  })
  if (!access) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const checks = await prisma.complianceCheck.findMany({
    where: { companyId },
    orderBy: [{ severity: 'asc' }, { status: 'asc' }],
  })

  const total = checks.length
  const compliant = checks.filter(c => c.status === 'COMPLIANT').length
  const nonCompliant = checks.filter(c => c.status === 'NON_COMPLIANT').length
  const attention = checks.filter(c => c.status === 'ATTENTION').length
  const notVerified = checks.filter(c => c.status === 'NOT_VERIFIED').length
  const verifiedTotal = total - notVerified
  const score = verifiedTotal > 0 ? Math.round((compliant / verifiedTotal) * 100) : 0

  return NextResponse.json({
    checks,
    summary: { total, compliant, nonCompliant, attention, notVerified, score },
  })
}
