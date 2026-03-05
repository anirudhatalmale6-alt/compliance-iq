// Shared Tofler proxy fetcher - used by both /api/enrich and /api/compliance

export interface ToflerData {
  name: string
  status: string
  companyType: string
  state: string
  registeredOffice: string
  dateOfIncorporation: string
  authorizedCapital: string
  paidUpCapital: string
  lastAGMDate: string
  lastBalanceSheetDate: string
  directorCount: number
  directorNames: string[]
  fyEndingDate: string
}

export async function fetchToflerViaProxy(cin: string): Promise<ToflerData | null> {
  const toflerUrl = `https://www.tofler.in/company/${cin}`
  let html = ''

  const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${toflerUrl}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(toflerUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(toflerUrl)}`,
  ]

  for (const proxyUrl of proxies) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)
      const response = await fetch(proxyUrl, {
        headers: { 'Accept': 'text/html' },
        signal: controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timeoutId)
      if (response.ok) {
        const text = await response.text()
        if (text.length > 5000) {
          html = text
          break
        }
      }
    } catch {
      continue
    }
  }

  if (!html) return null
  return parseToflerHTML(cin, html)
}

function parseToflerHTML(cin: string, html: string): ToflerData {
  const data: ToflerData = {
    name: '', status: '', companyType: '', state: '',
    registeredOffice: '', dateOfIncorporation: '',
    authorizedCapital: '', paidUpCapital: '',
    lastAGMDate: '', lastBalanceSheetDate: '',
    directorCount: 0, directorNames: [], fyEndingDate: '',
  }

  // Extract JS variables
  const nameMatch = html.match(/var\s+maincname\s*=\s*'([^']*)'/)
  if (nameMatch) data.name = nameMatch[1]

  const statusMatch = html.match(/var\s+maincmpxstatus\s*=\s*'([^']*)'/)
  if (statusMatch) data.status = statusMatch[1]

  // State from CIN
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
    'FTC': 'Foreign Company', 'NPT': 'Section 8 Company',
  }
  const stateCode = cin.substring(6, 8)
  const typeCode = cin.substring(12, 15)
  data.state = stateMap[stateCode] || stateCode
  data.companyType = typeMap[typeCode] || typeCode

  // Strip HTML tags for text matching
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  // FAQ answers for registered address and incorporation date
  const faqBlock = html.match(/"FAQPage"[\s\S]*?"mainEntity"[\s\S]*?\]/)?.[0] || ''
  const answers: string[] = []
  const answerRegex = /"text":\s*"(.*?)"/g
  let m
  while ((m = answerRegex.exec(faqBlock)) !== null) {
    answers.push(m[1])
  }

  for (const answer of answers) {
    const decoded = answer.replace(/\\n/g, ', ').replace(/\\u20b9/g, '₹')
    if (decoded.includes('incorporation date')) {
      const dm = decoded.match(/(\d{1,2}\s+\w+,?\s+\d{4})/)
      if (dm) data.dateOfIncorporation = dm[1]
    }
    if (decoded.includes('registered address')) {
      data.registeredOffice = decoded.replace(/.*?is\s+/, '')
    }
    if (decoded.includes('authorized share capital')) {
      const cap = decoded.match(/INR\s*₹?\s*([\d,.\s]+(?:L|Cr|Lac|Lakh|Crore)?\s*\.?)/)
      if (cap) data.authorizedCapital = cap[1].trim()
    }
    if (decoded.includes('paid-up capital')) {
      const cap = decoded.match(/INR\s*₹?\s*([\d,.\s]+(?:L|Cr|Lac|Lakh|Crore)?\s*\.?)/)
      if (cap) data.paidUpCapital = cap[1].trim()
    }
  }

  // AGM date
  const agmMatch = text.match(/AGM.*?held on\s+(\d{1,2}\s+\w+,?\s+\d{4})/i)
  if (agmMatch) data.lastAGMDate = agmMatch[1]

  // FY ending date
  const fyMatch = text.match(/financial year ending on\s+(\d{1,2}\s+\w+,?\s+\d{4})/i)
  if (fyMatch) data.fyEndingDate = fyMatch[1]

  // Balance sheet / last BS date
  const bsMatch = text.match(/balance sheet.*?(\d{1,2}\s+\w+,?\s+\d{4})/i)
  if (bsMatch) data.lastBalanceSheetDate = bsMatch[1]

  // Directors
  const dirMatch = text.match(/has\s+(\w+)\s+directors?\s*[-–—]\s*(.*?)(?:\.|The)/i)
  if (dirMatch) {
    const wordToNum: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12,
    }
    const numWord = dirMatch[1].toLowerCase()
    data.directorCount = wordToNum[numWord] || parseInt(numWord) || 0

    const names = dirMatch[2].split(/\s+and\s+|,\s*/).map((n: string) => n.trim()).filter((n: string) => n.length > 3 && !n.match(/other|director|more|\d/i))
    data.directorNames = names
  }

  return data
}
