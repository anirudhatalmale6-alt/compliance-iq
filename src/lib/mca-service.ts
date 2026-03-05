import axios from 'axios'
import * as cheerio from 'cheerio'

interface MCACompanyData {
  cin: string
  name: string
  dateOfIncorporation?: string
  registeredOffice?: string
  companyType?: string
  companyStatus?: string
  authorizedCapital?: string
  paidUpCapital?: string
  state?: string
  email?: string
  directors: DirectorData[]
  charges: ChargeData[]
  filings: FilingData[]
}

interface DirectorData {
  din?: string
  name: string
  designation?: string
  dateOfAppointment?: string
}

interface ChargeData {
  chargeId?: string
  chargeHolder?: string
  dateOfCreation?: string
  status?: string
  amount?: string
}

interface FilingData {
  formType: string
  formName: string
  filingDate?: string
  status: string
}

// Fetch company data from MCA public APIs
export async function fetchMCAData(cin: string): Promise<MCACompanyData | null> {
  try {
    // MCA V3 API for company master data
    const response = await axios.get(
      `https://www.mca.gov.in/mcafoportal/companyLLPMasterData.do`,
      {
        params: { companyID: cin },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/html',
        },
        timeout: 15000,
      }
    )

    if (response.data) {
      return parseMCAResponse(cin, response.data)
    }
  } catch (err) {
    console.log('MCA direct API failed, trying alternative sources...')
  }

  // Fallback: Try alternate public data sources
  try {
    return await fetchFromAlternateSource(cin)
  } catch (err) {
    console.error('All MCA data sources failed:', err)
    return null
  }
}

async function fetchFromAlternateSource(cin: string): Promise<MCACompanyData | null> {
  try {
    // Try Tofler / ZaubaCorp style public API
    const response = await axios.get(
      `https://api.data.gov.in/resource/company-master-data?api-key=579b464db66ec23bdd000001&format=json&filters[corporateIdentificationNumber]=${cin}`,
      { timeout: 15000 }
    )

    if (response.data?.records?.length > 0) {
      const record = response.data.records[0]
      return {
        cin: cin,
        name: record.companyName || '',
        dateOfIncorporation: record.dateOfIncorporation,
        registeredOffice: record.registeredOfficeAddress,
        companyType: record.companyClass,
        companyStatus: record.companyStatus,
        authorizedCapital: record.authorizedCapital?.toString(),
        paidUpCapital: record.paidUpCapital?.toString(),
        state: record.registeredState,
        email: record.emailId,
        directors: [],
        charges: [],
        filings: [],
      }
    }
  } catch (err) {
    console.log('data.gov.in API failed')
  }

  return null
}

function parseMCAResponse(cin: string, data: any): MCACompanyData {
  // Handle different response formats from MCA
  if (typeof data === 'string') {
    // HTML response - parse with cheerio
    const $ = cheerio.load(data)
    const companyData: MCACompanyData = {
      cin,
      name: '',
      directors: [],
      charges: [],
      filings: [],
    }

    // Extract table data
    $('table tr').each((_, row) => {
      const cells = $(row).find('td')
      if (cells.length >= 2) {
        const label = $(cells[0]).text().trim().toLowerCase()
        const value = $(cells[1]).text().trim()
        if (label.includes('company name')) companyData.name = value
        if (label.includes('date of incorporation')) companyData.dateOfIncorporation = value
        if (label.includes('registered office')) companyData.registeredOffice = value
        if (label.includes('company type') || label.includes('class')) companyData.companyType = value
        if (label.includes('company status')) companyData.companyStatus = value
        if (label.includes('authorized capital')) companyData.authorizedCapital = value
        if (label.includes('paid up capital')) companyData.paidUpCapital = value
        if (label.includes('state')) companyData.state = value
        if (label.includes('email')) companyData.email = value
      }
    })

    return companyData
  }

  // JSON response
  return {
    cin,
    name: data.companyName || data.company_name || '',
    dateOfIncorporation: data.dateOfIncorporation || data.date_of_incorporation,
    registeredOffice: data.registeredOfficeAddress || data.registered_office,
    companyType: data.companyClass || data.company_type,
    companyStatus: data.companyStatus || data.company_status,
    authorizedCapital: data.authorizedCapital?.toString(),
    paidUpCapital: data.paidUpCapital?.toString(),
    state: data.registeredState || data.state,
    email: data.emailId || data.email,
    directors: (data.directors || []).map((d: any) => ({
      din: d.din,
      name: d.name || d.directorName,
      designation: d.designation,
      dateOfAppointment: d.dateOfAppointment,
    })),
    charges: (data.charges || []).map((c: any) => ({
      chargeId: c.chargeId,
      chargeHolder: c.chargeHolder,
      dateOfCreation: c.dateOfCreation,
      status: c.status,
      amount: c.amount,
    })),
    filings: (data.filings || []).map((f: any) => ({
      formType: f.formType || f.form_type,
      formName: f.formName || f.form_name || '',
      filingDate: f.filingDate || f.filing_date,
      status: f.status || 'Filed',
    })),
  }
}

// Generate MCA compliance checks for a company
export function generateMCAComplianceChecks(company: any, filings: any[], directors: any[]) {
  const checks: any[] = []
  const currentYear = new Date().getFullYear()
  const currentFY = `${currentYear - 1}-${currentYear}`
  const prevFY = `${currentYear - 2}-${currentYear - 1}`

  // 1. Company Status Check
  const companyStatusLower = company.companyStatus?.toLowerCase()
  const companyStatusResolved = companyStatusLower === 'active' ? 'COMPLIANT'
    : !company.companyStatus ? 'NOT_VERIFIED'
    : 'NON_COMPLIANT'
  checks.push({
    category: 'MCA',
    checkName: 'Company Active Status',
    description: 'Company should have Active status on MCA records',
    status: companyStatusResolved,
    severity: 'HIGH',
    action: companyStatusResolved === 'NOT_VERIFIED'
      ? 'Company status data not available from public APIs. Please verify manually on MCA portal (mca.gov.in) or provide company master data.'
      : companyStatusResolved === 'NON_COMPLIANT'
        ? `Company status is "${company.companyStatus}". File necessary forms to restore active status. Contact ROC office.`
        : 'Company status is Active. No action needed.',
    penalty: 'Struck off companies face penalty up to ₹1,00,000 and directors disqualified for 5 years.',
    reference: 'Companies Act 2013, Section 248',
  })

  // 2. Annual Return (MGT-7/MGT-7A) Filing
  const mgt7Filed = filings.some(f =>
    (f.formType === 'MGT-7' || f.formType === 'MGT-7A') &&
    (f.financialYear === currentFY || f.financialYear === prevFY) &&
    f.status === 'Filed'
  )
  const mgt7Status = mgt7Filed ? 'COMPLIANT' : filings.length === 0 ? 'NOT_VERIFIED' : 'ATTENTION'
  checks.push({
    category: 'MCA',
    checkName: 'Annual Return Filing (MGT-7/MGT-7A)',
    description: `Annual return for FY ${prevFY} must be filed within 60 days of AGM`,
    status: mgt7Status,
    severity: 'HIGH',
    action: mgt7Status === 'NOT_VERIFIED'
      ? 'Filing data not available from public APIs. Please verify manually on MCA portal or provide filing records.'
      : !mgt7Filed
        ? `File Form MGT-7 (or MGT-7A for OPC/Small companies) for FY ${prevFY}. Due within 60 days of AGM date. Late filing attracts additional fees of ₹100/day.`
        : 'Annual return filed. No action needed.',
    penalty: 'Late filing: ₹100 per day of delay. Non-filing: up to ₹5,00,000 penalty.',
    reference: 'Companies Act 2013, Section 92(4)',
    deadline: new Date(currentYear, 10, 29), // Nov 29
  })

  // 3. Financial Statements (AOC-4/AOC-4 CFS)
  const aoc4Filed = filings.some(f =>
    (f.formType === 'AOC-4' || f.formType === 'AOC-4 CFS') &&
    (f.financialYear === currentFY || f.financialYear === prevFY) &&
    f.status === 'Filed'
  )
  const aoc4Status = aoc4Filed ? 'COMPLIANT' : filings.length === 0 ? 'NOT_VERIFIED' : 'ATTENTION'
  checks.push({
    category: 'MCA',
    checkName: 'Financial Statements Filing (AOC-4)',
    description: `Financial statements for FY ${prevFY} must be filed within 30 days of AGM`,
    status: aoc4Status,
    severity: 'HIGH',
    action: aoc4Status === 'NOT_VERIFIED'
      ? 'Filing data not available from public APIs. Please verify manually on MCA portal or provide filing records.'
      : !aoc4Filed
        ? `File Form AOC-4 for FY ${prevFY}. Due within 30 days of AGM. Ensure Balance Sheet, P&L, Cash Flow Statement, and notes are attached.`
        : 'Financial statements filed. No action needed.',
    penalty: 'Late filing: ₹100 per day. Company penalty up to ₹5,00,000, Officer penalty up to ₹1,00,000.',
    reference: 'Companies Act 2013, Section 137',
    deadline: new Date(currentYear, 10, 29),
  })

  // 4. Auditor Appointment (ADT-1)
  const adt1Filed = filings.some(f => f.formType === 'ADT-1' && f.status === 'Filed')
  const adt1Status = adt1Filed ? 'COMPLIANT' : filings.length === 0 ? 'NOT_VERIFIED' : 'ATTENTION'
  checks.push({
    category: 'MCA',
    checkName: 'Auditor Appointment (ADT-1)',
    description: 'Statutory auditor must be appointed for 5-year term and intimated to ROC via ADT-1',
    status: adt1Status,
    severity: 'MEDIUM',
    action: adt1Status === 'NOT_VERIFIED'
      ? 'Filing data not available from public APIs. Please verify manually on MCA portal or provide filing records.'
      : !adt1Filed
        ? 'File Form ADT-1 within 15 days of AGM to intimate ROC about auditor appointment. Ensure auditor holds valid membership with ICAI.'
        : 'Auditor appointment filed. No action needed.',
    penalty: 'Non-appointment: Company penalty ₹25,000 to ₹5,00,000.',
    reference: 'Companies Act 2013, Section 139',
  })

  // 5. Director KYC (DIR-3 KYC)
  const activeDirectors = directors.filter(d => !d.cessationDate)
  const dirKycPending = activeDirectors.filter(d => d.kycStatus !== 'Compliant')
  checks.push({
    category: 'MCA',
    checkName: 'Director KYC (DIR-3 KYC)',
    description: 'All directors must file DIR-3 KYC annually by September 30',
    status: dirKycPending.length === 0 && activeDirectors.length > 0 ? 'COMPLIANT' :
            directors.length === 0 ? 'NOT_VERIFIED' : 'NON_COMPLIANT',
    severity: 'HIGH',
    action: directors.length === 0
      ? 'Director data not available from public APIs. Please verify manually on MCA portal or provide director details.'
      : dirKycPending.length > 0
        ? `${dirKycPending.length} director(s) need to file DIR-3 KYC. Names: ${dirKycPending.map(d => d.name).join(', ')}. Due by September 30 every year. Late fee: ₹5,000.`
        : 'All directors have filed KYC. No action needed.',
    penalty: 'DIN deactivation if KYC not filed. Reactivation fee: ₹5,000.',
    reference: 'Companies Act 2013, Rule 12A of Companies (Appointment and Qualification of Directors) Rules',
    deadline: new Date(currentYear, 8, 30), // Sep 30
  })

  // 6. Registered Office Address
  checks.push({
    category: 'MCA',
    checkName: 'Registered Office Verification',
    description: 'Company must maintain a registered office and display name, address, CIN at the office',
    status: company.registeredOffice ? 'COMPLIANT' : 'NOT_VERIFIED',
    severity: 'MEDIUM',
    action: !company.registeredOffice
      ? 'Registered office data not available from public APIs. Please verify manually on MCA portal or provide company details.'
      : 'Registered office on record. Ensure CIN and company name are displayed at premises.',
    penalty: 'Penalty up to ₹1,000 per day for non-display.',
    reference: 'Companies Act 2013, Section 12',
  })

  // 7. Minimum Directors
  const minDirectors = company.companyType?.toLowerCase().includes('public') ? 3 :
                        company.companyType?.toLowerCase().includes('opc') ? 1 : 2
  checks.push({
    category: 'MCA',
    checkName: 'Minimum Number of Directors',
    description: `${company.companyType || 'Company'} must have minimum ${minDirectors} director(s)`,
    status: directors.length === 0 ? 'NOT_VERIFIED' :
            activeDirectors.length >= minDirectors ? 'COMPLIANT' : 'NON_COMPLIANT',
    severity: 'HIGH',
    action: directors.length === 0
      ? `Director data not available from public APIs. Please verify manually on MCA portal or provide director details. Minimum ${minDirectors} director(s) required.`
      : activeDirectors.length < minDirectors
        ? `Only ${activeDirectors.length} active director(s) found. Minimum ${minDirectors} required. Appoint additional director(s) and file DIR-12.`
        : `${activeDirectors.length} active director(s). Minimum requirement met.`,
    penalty: 'Company and every officer in default: penalty up to ₹1,00,000.',
    reference: 'Companies Act 2013, Section 149',
  })

  // 8. Commencement of Business (INC-20A)
  if (company.dateOfIncorporation) {
    const incDate = new Date(company.dateOfIncorporation)
    const sixMonthsAfter = new Date(incDate.getTime() + 180 * 24 * 60 * 60 * 1000)
    const inc20aFiled = filings.some(f => f.formType === 'INC-20A' && f.status === 'Filed')
    const isRecent = sixMonthsAfter > new Date()

    if (isRecent || !inc20aFiled) {
      checks.push({
        category: 'MCA',
        checkName: 'Commencement of Business (INC-20A)',
        description: 'Declaration of commencement of business must be filed within 180 days of incorporation',
        status: inc20aFiled ? 'COMPLIANT' : isRecent ? 'ATTENTION' : 'NON_COMPLIANT',
        severity: 'HIGH',
        action: !inc20aFiled
          ? 'File INC-20A declaration. Directors must verify that subscribers have paid the subscription amount. Required within 180 days of incorporation.'
          : 'INC-20A filed. No action needed.',
        penalty: 'Company may be removed from register. Penalty: ₹50,000 on company, ₹1,000/day on directors.',
        reference: 'Companies Act 2013, Section 10A',
        deadline: sixMonthsAfter,
      })
    }
  }

  // 9. AGM (Annual General Meeting)
  checks.push({
    category: 'MCA',
    checkName: 'Annual General Meeting (AGM)',
    description: 'AGM must be held within 6 months from end of financial year (by September 30)',
    status: 'NOT_VERIFIED',
    severity: 'HIGH',
    action: 'Cannot be verified via public API. Ensure AGM is conducted by September 30 each year. First AGM within 9 months of closing of first financial year. Gap between two AGMs should not exceed 15 months.',
    penalty: 'Company penalty: ₹1,00,000. Officer penalty: ₹5,000/day.',
    reference: 'Companies Act 2013, Section 96',
    deadline: new Date(currentYear, 8, 30),
  })

  // 10. Board Meetings
  checks.push({
    category: 'MCA',
    checkName: 'Board Meetings Compliance',
    description: 'Minimum 4 board meetings per year, with gap not exceeding 120 days between consecutive meetings',
    status: 'NOT_VERIFIED',
    severity: 'MEDIUM',
    action: 'Cannot be verified via public API. Verify that at least 4 board meetings are held per financial year. Maximum gap between two meetings: 120 days. First meeting within 30 days of incorporation.',
    penalty: 'Penalty up to ₹1,00,000 on company and ₹25,000 on every director.',
    reference: 'Companies Act 2013, Section 173',
  })

  return checks
}
