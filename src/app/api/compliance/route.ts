import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateMCAComplianceChecks, fetchMCAData } from '@/lib/mca-service'
import { generateGSTComplianceChecks } from '@/lib/gst-service'
import { fetchGSTData } from '@/lib/gst-service'

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

  // Fetch fresh MCA data from Tofler if CIN exists
  let enrichedCompany: any = { ...company }
  if (company.cin) {
    const mcaData = await fetchMCAData(company.cin)
    if (mcaData) {
      enrichedCompany = {
        ...company,
        companyStatus: mcaData.companyStatus || company.companyStatus,
        companyType: mcaData.companyType || company.companyType,
        registeredOffice: mcaData.registeredOffice || company.registeredOffice,
        state: mcaData.state || company.state,
        dateOfIncorporation: mcaData.dateOfIncorporation || company.dateOfIncorporation,
        lastAGMDate: mcaData.lastAGMDate,
        lastBalanceSheetDate: mcaData.lastBalanceSheetDate,
        directorCount: mcaData.directorCount || mcaData.directors?.length || 0,
        directors: mcaData.directors || [],
        name: mcaData.name || company.name,
      }
      // Update company record with fresh data
      await prisma.company.update({
        where: { id: companyId },
        data: {
          name: mcaData.name || company.name,
          companyStatus: mcaData.companyStatus || company.companyStatus,
          companyType: mcaData.companyType || company.companyType,
          registeredOffice: mcaData.registeredOffice || company.registeredOffice,
          state: mcaData.state || company.state,
        },
      })
      // Save directors if we got new ones
      if (mcaData.directors?.length && company.directors.length === 0) {
        await prisma.director.createMany({
          data: mcaData.directors.map(d => ({
            companyId: company.id,
            name: d.name,
            din: d.din || null,
            designation: d.designation || null,
            dateOfAppointment: d.dateOfAppointment ? new Date(d.dateOfAppointment) : null,
          })),
        })
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

  // Delete old checks and save new ones
  await prisma.complianceCheck.deleteMany({ where: { companyId } })
  await prisma.complianceCheck.createMany({
    data: allChecks.map(check => ({
      companyId,
      category: check.category,
      checkName: check.checkName,
      description: check.description,
      status: check.status,
      severity: check.severity,
      action: check.action || null,
      deadline: check.deadline || null,
      penalty: check.penalty || null,
      reference: check.reference || null,
    })),
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
