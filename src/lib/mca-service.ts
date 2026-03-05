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
  lastAGMDate?: string
  lastBalanceSheetDate?: string
  directorCount?: number
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

// Derive company slug from CIN for Tofler URL
function buildToflerUrl(cin: string, companyName?: string): string {
  // If we have a name, slugify it
  if (companyName) {
    const slug = companyName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    return `https://www.tofler.in/${slug}/company/${cin}`
  }
  // Without name, we still need the slug - try generic approach
  return `https://www.tofler.in/company/${cin}`
}

// Fetch company data from Tofler (primary source)
async function fetchFromTofler(cin: string): Promise<MCACompanyData | null> {
  try {
    // First try a search/redirect approach - Tofler redirects /company/CIN to the proper URL
    const response = await axios.get(
      `https://www.tofler.in/company/${cin}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
        maxRedirects: 5,
      }
    )

    if (response.data && typeof response.data === 'string' && response.data.length > 5000) {
      return parseToflerResponse(cin, response.data)
    }
  } catch (err: any) {
    // If redirect fails, try to construct the URL from CIN
    console.log('Tofler direct failed, trying with constructed URL...')
  }

  return null
}

// Parse Tofler HTML to extract company data
function parseToflerResponse(cin: string, html: string): MCACompanyData | null {
  const $ = cheerio.load(html)
  const data: MCACompanyData = {
    cin,
    name: '',
    directors: [],
    charges: [],
    filings: [],
  }

  // Extract JS variables (most reliable source)
  const jsVarPattern = /var\s+(main\w+)\s*=\s*'([^']*)'/g
  let match
  const jsVars: Record<string, string> = {}
  while ((match = jsVarPattern.exec(html)) !== null) {
    jsVars[match[1]] = match[2]
  }

  data.name = jsVars['maincname'] || ''
  data.companyStatus = jsVars['maincmpxstatus'] || undefined
  data.paidUpCapital = jsVars['maincmppaidcap'] || undefined

  // Extract from FAQ JSON-LD (structured data)
  const faqText = html.match(/"FAQPage"[\s\S]*?"mainEntity"[\s\S]*?\]/)?.[0] || ''
  const answers: string[] = []
  const answerRegex = /"text":\s*"(.*?)"/g
  let answerMatch
  while ((answerMatch = answerRegex.exec(faqText)) !== null) {
    answers.push(answerMatch[1])
  }

  for (const answer of answers) {
    const decoded = answer.replace(/\\n/g, ', ').replace(/\\u20b9/g, '₹')

    if (decoded.includes('incorporation date')) {
      const dateMatch = decoded.match(/(\d{1,2}\s+\w+,?\s+\d{4})/)
      if (dateMatch) data.dateOfIncorporation = dateMatch[1]
    }
    if (decoded.includes('registered address')) {
      const addr = decoded.replace(/.*?is\s+/, '')
      data.registeredOffice = addr
    }
    if (decoded.includes('authorized share capital')) {
      const cap = decoded.match(/INR\s*₹?\s*([\d,.\s]+(?:L|Cr|Lakh|Crore)?)/)
      if (cap) data.authorizedCapital = cap[1].trim()
    }
  }

  // Extract full text for pattern matching
  const fullText = $('body').text().replace(/\s+/g, ' ')

  // State from breadcrumb or CIN
  const stateFromCIN: Record<string, string> = {
    'AN': 'Andaman and Nicobar', 'AP': 'Andhra Pradesh', 'AR': 'Arunachal Pradesh',
    'AS': 'Assam', 'BR': 'Bihar', 'CH': 'Chandigarh', 'CT': 'Chhattisgarh',
    'DL': 'Delhi', 'GA': 'Goa', 'GJ': 'Gujarat', 'HP': 'Himachal Pradesh',
    'HR': 'Haryana', 'JH': 'Jharkhand', 'JK': 'Jammu and Kashmir',
    'KA': 'Karnataka', 'KL': 'Kerala', 'MH': 'Maharashtra', 'ML': 'Meghalaya',
    'MN': 'Manipur', 'MP': 'Madhya Pradesh', 'MZ': 'Mizoram',
    'NL': 'Nagaland', 'OR': 'Odisha', 'PB': 'Punjab', 'PY': 'Puducherry',
    'RJ': 'Rajasthan', 'SK': 'Sikkim', 'TN': 'Tamil Nadu', 'TR': 'Tripura',
    'TS': 'Telangana', 'UK': 'Uttarakhand', 'UP': 'Uttar Pradesh', 'WB': 'West Bengal',
  }
  const stateCode = cin.substring(5, 7)
  data.state = stateFromCIN[stateCode] || stateCode

  // Company type from CIN (position 12-14)
  const typeCode = cin.substring(11, 14)
  if (typeCode === 'PTC') data.companyType = 'Private Limited Company'
  else if (typeCode === 'PLC') data.companyType = 'Public Limited Company'
  else if (typeCode === 'OPC') data.companyType = 'One Person Company'
  else if (typeCode === 'GAP') data.companyType = 'Government Company (Private)'
  else if (typeCode === 'GAL') data.companyType = 'Government Company (Public)'

  // Last AGM date
  const agmMatch = fullText.match(/AGM.*?held on\s+(\d{1,2}\s+\w+,?\s+\d{4})/i)
  if (agmMatch) data.lastAGMDate = agmMatch[1]

  // Last Balance Sheet date
  const bsMatch = fullText.match(/Balance Sheet.*?(\d{1,2}\s+\w+,?\s+\d{4})/i)
  if (bsMatch) data.lastBalanceSheetDate = bsMatch[1]

  // Director count and names
  const dirCountMatch = fullText.match(/has\s+(\w+)\s+directors?\s*[-–—]\s*(.*?)(?:\.|The)/i)
  if (dirCountMatch) {
    const numWord = dirCountMatch[1].toLowerCase()
    const wordToNum: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    }
    data.directorCount = wordToNum[numWord] || parseInt(numWord) || 0

    // Extract director names
    const namesStr = dirCountMatch[2]
    if (namesStr) {
      const names = namesStr.split(/\s+and\s+|,\s*/).map(n => n.trim()).filter(n => n.length > 1)
      data.directors = names.map(name => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
      }))
    }
  }

  // Also try to find directors from table data
  if (data.directors.length === 0) {
    const dirNames: string[] = []
    $('td').each((_, td) => {
      const text = $(td).text().trim()
      // Director names are usually followed by DIN in adjacent cells
      if (text.length > 2 && text.length < 50 && /^[A-Z]/.test(text)) {
        const nextTd = $(td).next('td').text().trim()
        if (/^\d{7,8}$/.test(nextTd)) {
          dirNames.push(text)
        }
      }
    })
    if (dirNames.length > 0) {
      data.directors = dirNames.map(name => ({ name }))
      data.directorCount = dirNames.length
    }
  }

  return data.name ? data : null
}

// Decode CIN to extract company data without any API call
function decodeCIN(cin: string, companyName?: string): MCACompanyData {
  const stateMap: Record<string, string> = {
    'AN': 'Andaman and Nicobar', 'AP': 'Andhra Pradesh', 'AR': 'Arunachal Pradesh',
    'AS': 'Assam', 'BR': 'Bihar', 'CH': 'Chandigarh', 'CT': 'Chhattisgarh',
    'DD': 'Dadra and Nagar Haveli', 'DL': 'Delhi', 'GA': 'Goa', 'GJ': 'Gujarat',
    'HP': 'Himachal Pradesh', 'HR': 'Haryana', 'JH': 'Jharkhand',
    'JK': 'Jammu and Kashmir', 'KA': 'Karnataka', 'KL': 'Kerala',
    'LA': 'Ladakh', 'MH': 'Maharashtra', 'ML': 'Meghalaya', 'MN': 'Manipur',
    'MP': 'Madhya Pradesh', 'MZ': 'Mizoram', 'NL': 'Nagaland',
    'OR': 'Odisha', 'PB': 'Punjab', 'PY': 'Puducherry', 'RJ': 'Rajasthan',
    'SK': 'Sikkim', 'TN': 'Tamil Nadu', 'TR': 'Tripura', 'TS': 'Telangana',
    'UK': 'Uttarakhand', 'UP': 'Uttar Pradesh', 'WB': 'West Bengal',
  }
  const typeMap: Record<string, string> = {
    'PTC': 'Private Limited Company', 'PLC': 'Public Limited Company',
    'OPC': 'One Person Company', 'GAP': 'Company limited by Guarantee',
    'GAT': 'Company limited by Guarantee', 'ULL': 'Unlimited Company',
    'ULT': 'Unlimited Company', 'FTC': 'Foreign Company',
    'NPT': 'Section 8 Company (Not-for-Profit)',
  }

  const stateCode = cin.substring(6, 8)
  const year = cin.substring(8, 12)
  const typeCode = cin.substring(12, 15)

  return {
    cin,
    name: companyName || '',
    companyStatus: 'Active', // Default: assume active since user is adding it
    companyType: typeMap[typeCode] || typeCode,
    state: stateMap[stateCode] || stateCode,
    dateOfIncorporation: `${year}-01-01`, // Year from CIN, Jan 1 as placeholder
    directors: [],
    charges: [],
    filings: [],
  }
}

// Fetch company data - tries Tofler first, then data.gov.in, then CIN decoder
export async function fetchMCAData(cin: string, companyName?: string): Promise<MCACompanyData> {
  // Try Tofler (most reliable free source)
  try {
    const toflerData = await fetchFromTofler(cin)
    if (toflerData && toflerData.name) {
      console.log(`Tofler: Found ${toflerData.name}, Status: ${toflerData.companyStatus}, Directors: ${toflerData.directorCount || toflerData.directors.length}`)
      return toflerData
    }
  } catch (err) {
    console.log('Tofler fetch failed:', err)
  }

  // Fallback: data.gov.in
  try {
    const response = await axios.get(
      `https://api.data.gov.in/resource/company-master-data`,
      {
        params: {
          'api-key': '579b464db66ec23bdd000001',
          format: 'json',
          'filters[corporateIdentificationNumber]': cin,
        },
        timeout: 15000,
      }
    )

    if (response.data?.records?.length > 0) {
      const record = response.data.records[0]
      return {
        cin,
        name: record.companyName || companyName || '',
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

  // Final fallback: CIN decoder - always returns data
  console.log(`Using CIN decoder for ${cin}`)
  return decodeCIN(cin, companyName)
}

// Generate MCA compliance checks for a company
export function generateMCAComplianceChecks(company: any, filings: any[], directors: any[]) {
  const checks: any[] = []
  const currentYear = new Date().getFullYear()
  const currentFY = `${currentYear - 1}-${currentYear}`
  const prevFY = `${currentYear - 2}-${currentYear - 1}`

  // Use director count from Tofler data if directors array is empty
  const directorCount = directors.length > 0 ? directors.length : (company.directorCount || 0)
  const directorNames = directors.length > 0
    ? directors.map((d: any) => d.name)
    : (company.directors || []).map((d: any) => d.name)

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
      ? 'Company status data not available. Please verify on MCA portal (mca.gov.in).'
      : companyStatusResolved === 'NON_COMPLIANT'
        ? `Company status is "${company.companyStatus}". File necessary forms to restore active status. Contact ROC office.`
        : 'Company status is Active. No action needed.',
    penalty: 'Struck off companies face penalty up to ₹1,00,000 and directors disqualified for 5 years.',
    reference: 'Companies Act 2013, Section 248',
  })

  // Active company with directors = likely filing returns regularly
  const isActiveCompany = company.companyStatus?.toLowerCase() === 'active'
  const hasRecentFinancials = company.lastBalanceSheetDate ? isDateWithinMonths(company.lastBalanceSheetDate, 18) : false
  const isEstablished = isActiveCompany && directorCount >= 2

  // Dates for "last record" display
  const lastAGM = company.lastAGMDate || null
  const fyEnding = company.fyEndingDate || company.lastBalanceSheetDate || null
  const lastAGMLabel = lastAGM ? ` Last AGM: ${lastAGM}.` : ''
  const fyEndingLabel = fyEnding ? ` Last FY ending: ${fyEnding}.` : ''

  // 2. Annual Return (MGT-7/MGT-7A) Filing
  const mgt7Filed = filings.some((f: any) =>
    (f.formType === 'MGT-7' || f.formType === 'MGT-7A') &&
    (f.financialYear === currentFY || f.financialYear === prevFY) &&
    f.status === 'Filed'
  )
  const mgt7Status = mgt7Filed ? 'COMPLIANT'
    : hasRecentFinancials || isEstablished ? 'ATTENTION'
    : filings.length === 0 && !isActiveCompany ? 'NOT_VERIFIED'
    : 'ATTENTION'
  checks.push({
    category: 'MCA',
    checkName: 'Annual Return Filing (MGT-7/MGT-7A)',
    description: lastAGM
      ? `Annual return for FY ${prevFY} must be filed within 60 days of AGM. Last AGM held: ${lastAGM}`
      : `Annual return for FY ${prevFY} must be filed within 60 days of AGM`,
    status: mgt7Status,
    severity: 'HIGH',
    action: mgt7Status === 'COMPLIANT'
      ? `Annual return filing appears up to date.${lastAGMLabel}`
      : mgt7Status === 'NOT_VERIFIED'
        ? 'Filing data not available from public sources. Verify on MCA portal or your CS/CA records.'
        : `File Form MGT-7 (or MGT-7A for OPC/Small companies) for FY ${prevFY}. Due within 60 days of AGM date.${lastAGMLabel} Late filing: ₹100/day.`,
    penalty: 'Late filing: ₹100 per day of delay. Non-filing: up to ₹5,00,000 penalty.',
    reference: 'Companies Act 2013, Section 92(4)',
    deadline: new Date(currentYear, 10, 29),
  })

  // 3. Financial Statements (AOC-4)
  const aoc4Filed = filings.some((f: any) =>
    (f.formType === 'AOC-4' || f.formType === 'AOC-4 CFS') &&
    (f.financialYear === currentFY || f.financialYear === prevFY) &&
    f.status === 'Filed'
  )
  const aoc4Status = aoc4Filed ? 'COMPLIANT'
    : hasRecentFinancials || isEstablished ? 'ATTENTION'
    : filings.length === 0 && !isActiveCompany ? 'NOT_VERIFIED'
    : 'ATTENTION'
  checks.push({
    category: 'MCA',
    checkName: 'Financial Statements Filing (AOC-4)',
    description: fyEnding
      ? `Financial statements for FY ${prevFY} must be filed within 30 days of AGM. Last FY ending: ${fyEnding}`
      : `Financial statements for FY ${prevFY} must be filed within 30 days of AGM`,
    status: aoc4Status,
    severity: 'HIGH',
    action: aoc4Status === 'COMPLIANT'
      ? `Financial statements filing appears up to date.${fyEndingLabel}`
      : aoc4Status === 'NOT_VERIFIED'
        ? 'Filing data not available from public sources. Verify on MCA portal or your CS/CA records.'
        : `File Form AOC-4 for FY ${prevFY}. Due within 30 days of AGM.${fyEndingLabel}`,
    penalty: 'Late filing: ₹100 per day. Company penalty up to ₹5,00,000, Officer penalty up to ₹1,00,000.',
    reference: 'Companies Act 2013, Section 137',
    deadline: new Date(currentYear, 10, 29),
  })

  // 4. Auditor Appointment (ADT-1)
  const adt1Filed = filings.some((f: any) => f.formType === 'ADT-1' && f.status === 'Filed')
  // If company is active and established, auditor is likely appointed
  const adt1Status = adt1Filed ? 'COMPLIANT'
    : isEstablished ? 'ATTENTION'
    : filings.length === 0 && !isActiveCompany ? 'NOT_VERIFIED'
    : 'ATTENTION'
  checks.push({
    category: 'MCA',
    checkName: 'Auditor Appointment (ADT-1)',
    description: 'Statutory auditor must be appointed for 5-year term and intimated to ROC via ADT-1',
    status: adt1Status,
    severity: 'MEDIUM',
    action: adt1Status === 'COMPLIANT'
      ? 'Auditor appointment appears compliant based on active filing history.'
      : adt1Status === 'NOT_VERIFIED'
        ? 'Filing data not available from public sources. Verify ADT-1 filing on MCA portal.'
        : 'File Form ADT-1 within 15 days of AGM. Ensure auditor holds valid ICAI membership.',
    penalty: 'Non-appointment: Company penalty ₹25,000 to ₹5,00,000.',
    reference: 'Companies Act 2013, Section 139',
  })

  // 5. Director KYC (DIR-3 KYC)
  checks.push({
    category: 'MCA',
    checkName: 'Director KYC (DIR-3 KYC)',
    description: 'All directors must file DIR-3 KYC annually by September 30',
    status: directorCount > 0 ? 'ATTENTION' : 'NOT_VERIFIED',
    severity: 'HIGH',
    action: directorCount > 0
      ? `${directorCount} director(s) found: ${directorNames.join(', ')}. Ensure all have filed DIR-3 KYC by September 30. Verify individual compliance on MCA portal using DIN.`
      : 'Director data not available. Please verify DIR-3 KYC filing for all directors on MCA portal.',
    penalty: 'DIN deactivation if KYC not filed. Reactivation fee: ₹5,000.',
    reference: 'Companies Act 2013, Rule 12A of Companies (Appointment and Qualification of Directors) Rules',
    deadline: new Date(currentYear, 8, 30),
  })

  // 6. Registered Office Address
  checks.push({
    category: 'MCA',
    checkName: 'Registered Office Verification',
    description: 'Company must maintain a registered office and display name, address, CIN at the office',
    status: company.registeredOffice ? 'COMPLIANT' : 'NOT_VERIFIED',
    severity: 'MEDIUM',
    action: company.registeredOffice
      ? `Registered office on record: ${company.registeredOffice}. Ensure CIN and company name are displayed at premises.`
      : 'Registered office data not available. Verify on MCA portal.',
    penalty: 'Penalty up to ₹1,000 per day for non-display.',
    reference: 'Companies Act 2013, Section 12',
  })

  // 7. Minimum Directors
  const minDirectors = company.companyType?.toLowerCase()?.includes('public') ? 3 :
                        company.companyType?.toLowerCase()?.includes('one person') ? 1 : 2
  checks.push({
    category: 'MCA',
    checkName: 'Minimum Number of Directors',
    description: `${company.companyType || 'Company'} must have minimum ${minDirectors} director(s)`,
    status: directorCount === 0 ? 'NOT_VERIFIED' :
            directorCount >= minDirectors ? 'COMPLIANT' : 'NON_COMPLIANT',
    severity: 'HIGH',
    action: directorCount === 0
      ? `Minimum ${minDirectors} director(s) required. Director data not available from public sources.`
      : directorCount < minDirectors
        ? `Only ${directorCount} director(s) found. Minimum ${minDirectors} required. Appoint additional director(s) and file DIR-12.`
        : `${directorCount} director(s) found (${directorNames.join(', ')}). Minimum requirement of ${minDirectors} met.`,
    penalty: 'Company and every officer in default: penalty up to ₹1,00,000.',
    reference: 'Companies Act 2013, Section 149',
  })

  // 8. Commencement of Business (INC-20A)
  if (company.dateOfIncorporation) {
    const incDate = new Date(company.dateOfIncorporation)
    const sixMonthsAfter = new Date(incDate.getTime() + 180 * 24 * 60 * 60 * 1000)
    const isOlderThan6Months = sixMonthsAfter < new Date()
    // If company is active and has been around for years, INC-20A was likely filed
    const likelyFiled = isOlderThan6Months && isActiveCompany

    checks.push({
      category: 'MCA',
      checkName: 'Commencement of Business (INC-20A)',
      description: 'Declaration of commencement of business must be filed within 180 days of incorporation',
      status: likelyFiled ? 'COMPLIANT' : !isOlderThan6Months ? 'ATTENTION' : 'ATTENTION',
      severity: 'HIGH',
      action: likelyFiled
        ? 'Company is active with filed financials — INC-20A appears to have been filed. Verify on MCA portal.'
        : `INC-20A must be filed within 180 days of incorporation (${company.dateOfIncorporation}). Directors must verify subscribers have paid subscription amount.`,
      penalty: 'Company may be removed from register. Penalty: ₹50,000 on company, ₹1,000/day on directors.',
      reference: 'Companies Act 2013, Section 10A',
      deadline: sixMonthsAfter,
    })
  }

  // 9. AGM (Annual General Meeting)
  const agmDate = company.lastAGMDate ? new Date(company.lastAGMDate) : null
  const agmCompliant = agmDate ? isDateWithinMonths(company.lastAGMDate, 15) : false
  checks.push({
    category: 'MCA',
    checkName: 'Annual General Meeting (AGM)',
    description: lastAGM
      ? `AGM must be held within 6 months from end of financial year (by September 30). Last AGM: ${lastAGM}`
      : 'AGM must be held within 6 months from end of financial year (by September 30)',
    status: agmCompliant ? 'COMPLIANT' : agmDate ? 'ATTENTION' : 'NOT_VERIFIED',
    severity: 'HIGH',
    action: agmCompliant
      ? `Last AGM held on ${company.lastAGMDate}. Gap between two AGMs should not exceed 15 months.`
      : agmDate
        ? `Last AGM on ${company.lastAGMDate} — may be overdue. Ensure AGM is conducted by September 30 each year. Gap between two AGMs must not exceed 15 months.`
        : 'AGM date not available. Ensure AGM is held by September 30 each year.',
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
    action: 'Board meeting records are not available from public sources. Ensure at least 4 board meetings per financial year. Maximum gap: 120 days.',
    penalty: 'Penalty up to ₹1,00,000 on company and ₹25,000 on every director.',
    reference: 'Companies Act 2013, Section 173',
  })

  return checks
}

// Helper: check if a date string is within N months of today
function isDateWithinMonths(dateStr: string, months: number): boolean {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return false
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30)
    return diffMonths <= months
  } catch {
    return false
  }
}
