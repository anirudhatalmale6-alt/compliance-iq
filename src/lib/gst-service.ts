import axios from 'axios'

interface GSTData {
  gstin: string
  legalName: string
  tradeName?: string
  status: string
  registrationDate?: string
  cancellationDate?: string
  gstinType?: string
  constitutionOfBusiness?: string
  state?: string
  address?: string
  filingStatus: GSTFilingPeriod[]
}

interface GSTFilingPeriod {
  returnType: string
  period: string
  status: string
  filingDate?: string
  dueDate?: string
}

// Fetch GST data from public GST search API
export async function fetchGSTData(gstin: string): Promise<GSTData | null> {
  try {
    // GST public search API
    const response = await axios.get(
      `https://sheet.gstzen.in/taxpayer/${gstin}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 15000,
      }
    )

    if (response.data) {
      return parseGSTResponse(gstin, response.data)
    }
  } catch (err) {
    console.log('GST primary API failed, trying alternate...')
  }

  // Try alternate API
  try {
    const response = await axios.get(
      `https://commonapi.mastersindia.co/commonapis/searchgstin?gstin=${gstin}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        },
        timeout: 15000,
      }
    )
    if (response.data?.data) {
      return parseGSTAlternateResponse(gstin, response.data.data)
    }
  } catch (err) {
    console.log('GST alternate API also failed')
  }

  return null
}

function parseGSTResponse(gstin: string, data: any): GSTData {
  return {
    gstin,
    legalName: data.lgnm || data.legalName || '',
    tradeName: data.tradeNam || data.tradeName || '',
    status: data.sts || data.status || 'Unknown',
    registrationDate: data.rgdt || data.registrationDate,
    cancellationDate: data.cxdt || data.cancellationDate,
    gstinType: data.dty || data.gstinType || '',
    constitutionOfBusiness: data.ctb || data.constitutionOfBusiness || '',
    state: data.stj || data.state || extractStateFromGSTIN(gstin),
    address: formatAddress(data.pradr || data.address),
    filingStatus: parseFilingStatus(data.fillingStatus || data.filingStatus || []),
  }
}

function parseGSTAlternateResponse(gstin: string, data: any): GSTData {
  return {
    gstin,
    legalName: data.legal_name || data.lgnm || '',
    tradeName: data.trade_name || data.tradeNam || '',
    status: data.gstin_status || data.sts || 'Unknown',
    registrationDate: data.registration_date || data.rgdt,
    gstinType: data.gstin_type || data.dty || '',
    constitutionOfBusiness: data.constitution_of_business || data.ctb || '',
    state: extractStateFromGSTIN(gstin),
    address: data.address || '',
    filingStatus: [],
  }
}

function extractStateFromGSTIN(gstin: string): string {
  const stateCode = gstin.substring(0, 2)
  const stateMap: Record<string, string> = {
    '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
    '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
    '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
    '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
    '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
    '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
    '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '29': 'Karnataka',
    '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
    '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar',
    '36': 'Telangana', '37': 'Andhra Pradesh',
  }
  return stateMap[stateCode] || `State Code: ${stateCode}`
}

function formatAddress(addr: any): string {
  if (typeof addr === 'string') return addr
  if (!addr) return ''
  const parts = [addr.bno, addr.st, addr.loc, addr.dst, addr.stcd, addr.pncd]
  return parts.filter(Boolean).join(', ')
}

function parseFilingStatus(filings: any[]): GSTFilingPeriod[] {
  return filings.map((f: any) => ({
    returnType: f.rtntype || f.return_type || '',
    period: f.ret_prd || f.tax_period || f.period || '',
    status: f.status || f.sts || 'Unknown',
    filingDate: f.dof || f.filing_date,
    dueDate: f.due_date,
  }))
}

// Generate GST compliance checks
export function generateGSTComplianceChecks(gstData: GSTData | null, gstReturns: any[]) {
  const checks: any[] = []
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  if (!gstData) {
    checks.push({
      category: 'GST',
      checkName: 'GSTIN Verification',
      description: 'Unable to verify GSTIN from GST portal',
      status: 'ATTENTION',
      severity: 'HIGH',
      action: 'Please verify the GSTIN is correct. If the company is required to register under GST, file for registration immediately.',
      penalty: 'Operating without GST registration: Penalty of ₹25,000 or 100% of tax evaded.',
      reference: 'CGST Act 2017, Section 122',
    })
    return checks
  }

  // 1. GSTIN Active Status
  checks.push({
    category: 'GST',
    checkName: 'GSTIN Active Status',
    description: 'GSTIN should be Active on GST portal',
    status: gstData.status?.toLowerCase() === 'active' ? 'COMPLIANT' : 'NON_COMPLIANT',
    severity: 'HIGH',
    action: gstData.status?.toLowerCase() !== 'active'
      ? `GSTIN status is "${gstData.status}". If cancelled, apply for revocation within 30 days of cancellation order. If suspended, respond to the notice immediately.`
      : 'GSTIN is Active. No action needed.',
    penalty: 'Cancelled GSTIN: Cannot issue invoices or collect GST. Penalty for continued business without registration.',
    reference: 'CGST Act 2017, Section 29',
  })

  // 2. GSTR-1 (Outward Supplies) - Monthly/Quarterly
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  for (let i = 1; i <= 3; i++) {
    let checkMonth = currentMonth - i
    let checkYear = currentYear
    if (checkMonth < 0) { checkMonth += 12; checkYear-- }
    const period = `${months[checkMonth]} ${checkYear}`

    const gstr1Filed = gstReturns.some(r =>
      r.returnType === 'GSTR-1' && r.period === period && r.status === 'Filed'
    ) || gstData.filingStatus.some(f =>
      f.returnType === 'GSTR1' && f.period?.includes(months[checkMonth]) && f.status?.toLowerCase() === 'filed'
    )

    checks.push({
      category: 'GST',
      checkName: `GSTR-1 Filing - ${period}`,
      description: `GSTR-1 (Outward supplies) for ${period}. Due by 11th of next month.`,
      status: gstr1Filed ? 'COMPLIANT' : i === 1 ? 'ATTENTION' : 'NON_COMPLIANT',
      severity: i <= 1 ? 'MEDIUM' : 'HIGH',
      action: !gstr1Filed
        ? `File GSTR-1 for ${period}. Contains details of all outward supplies (sales). Due by 11th of following month.`
        : `GSTR-1 for ${period} filed. No action needed.`,
      penalty: 'Late fee: ₹50/day (₹25 CGST + ₹25 SGST). Max ₹10,000 per return. Nil return: ₹20/day.',
      reference: 'CGST Act 2017, Section 37',
    })
  }

  // 3. GSTR-3B (Summary Return) - Monthly
  for (let i = 1; i <= 3; i++) {
    let checkMonth = currentMonth - i
    let checkYear = currentYear
    if (checkMonth < 0) { checkMonth += 12; checkYear-- }
    const period = `${months[checkMonth]} ${checkYear}`

    const gstr3bFiled = gstReturns.some(r =>
      r.returnType === 'GSTR-3B' && r.period === period && r.status === 'Filed'
    ) || gstData.filingStatus.some(f =>
      f.returnType === 'GSTR3B' && f.period?.includes(months[checkMonth]) && f.status?.toLowerCase() === 'filed'
    )

    checks.push({
      category: 'GST',
      checkName: `GSTR-3B Filing - ${period}`,
      description: `GSTR-3B (Summary return with tax payment) for ${period}. Due by 20th of next month.`,
      status: gstr3bFiled ? 'COMPLIANT' : i === 1 ? 'ATTENTION' : 'NON_COMPLIANT',
      severity: 'HIGH',
      action: !gstr3bFiled
        ? `File GSTR-3B for ${period}. This is the summary return with actual tax payment. Due by 20th of following month. Interest of 18% p.a. on late payment of tax.`
        : `GSTR-3B for ${period} filed. No action needed.`,
      penalty: 'Late fee: ₹50/day (₹25 CGST + ₹25 SGST). Max ₹10,000. Plus interest at 18% p.a. on outstanding tax.',
      reference: 'CGST Act 2017, Section 39',
    })
  }

  // 4. GSTR-9 (Annual Return)
  const prevFY = `FY ${currentYear - 2}-${(currentYear - 1).toString().slice(-2)}`
  const gstr9Filed = gstReturns.some(r =>
    r.returnType === 'GSTR-9' && r.period === prevFY && r.status === 'Filed'
  )
  checks.push({
    category: 'GST',
    checkName: `Annual Return (GSTR-9) - ${prevFY}`,
    description: `GSTR-9 annual return for ${prevFY}. Due by December 31.`,
    status: gstr9Filed ? 'COMPLIANT' : 'ATTENTION',
    severity: 'HIGH',
    action: !gstr9Filed
      ? `File GSTR-9 annual return for ${prevFY}. Due by December 31. Reconcile all monthly returns. If turnover exceeds ₹5 crore, GSTR-9C reconciliation statement also required.`
      : `GSTR-9 for ${prevFY} filed. No action needed.`,
    penalty: 'Late fee: ₹200/day (₹100 CGST + ₹100 SGST). Max 0.5% of turnover in the state.',
    reference: 'CGST Act 2017, Section 44',
    deadline: new Date(currentYear - 1, 11, 31),
  })

  // 5. E-Invoice Compliance
  checks.push({
    category: 'GST',
    checkName: 'E-Invoice Compliance',
    description: 'Companies with turnover above ₹5 crore must generate e-invoices',
    status: 'ATTENTION',
    severity: 'MEDIUM',
    action: 'If aggregate turnover exceeds ₹5 crore in any FY from 2017-18, e-invoicing is mandatory for all B2B supplies. Ensure IRN is generated for every invoice via IRP portal.',
    penalty: 'Invoice without IRN: 100% of tax due or ₹25,000, whichever is higher.',
    reference: 'CGST Rules, Rule 48(4), Notification 13/2020',
  })

  // 6. E-Way Bill Compliance
  checks.push({
    category: 'GST',
    checkName: 'E-Way Bill Compliance',
    description: 'E-Way bill required for movement of goods exceeding ₹50,000',
    status: 'ATTENTION',
    severity: 'MEDIUM',
    action: 'Generate E-Way Bill on ewaybillgst.gov.in for all goods movement above ₹50,000. Valid for distance-based periods. Ensure Part A (invoice details) and Part B (vehicle number) are filled.',
    penalty: 'Goods detained + penalty of ₹10,000 or tax amount, whichever is higher.',
    reference: 'CGST Rules, Rule 138',
  })

  // 7. Input Tax Credit Reconciliation
  checks.push({
    category: 'GST',
    checkName: 'ITC Reconciliation (GSTR-2B)',
    description: 'Input Tax Credit claimed should match auto-populated GSTR-2B',
    status: 'ATTENTION',
    severity: 'HIGH',
    action: 'Reconcile ITC claimed in GSTR-3B with auto-populated GSTR-2B every month. Any excess ITC claim needs to be reversed with interest. Ensure all vendors have filed their GSTR-1.',
    penalty: 'Wrong ITC claim: Interest at 24% p.a. + penalty equal to ITC wrongly claimed.',
    reference: 'CGST Act 2017, Section 16(2)',
  })

  return checks
}
