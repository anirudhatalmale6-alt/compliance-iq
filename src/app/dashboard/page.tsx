'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Company {
  id: string
  name: string
  cin?: string
  gstin?: string
  companyStatus?: string
  state?: string
  companyType?: string
  complianceChecks: ComplianceCheck[]
  _count: { mcaFilings: number; gstReturns: number; directors: number }
}

interface ComplianceCheck {
  id: string
  category: string
  checkName: string
  description: string
  status: string
  severity: string
  action?: string
  penalty?: string
  reference?: string
  deadline?: string
}

interface ComplianceSummary {
  total: number
  compliant: number
  nonCompliant: number
  attention: number
  notVerified: number
  score: number
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [checks, setChecks] = useState<ComplianceCheck[]>([])
  const [summary, setSummary] = useState<ComplianceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [runningCheck, setRunningCheck] = useState(false)
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [addForm, setAddForm] = useState({ cin: '', gstin: '', name: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [verifyingCheck, setVerifyingCheck] = useState<string | null>(null)
  const [verifyNote, setVerifyNote] = useState('')
  const [verifyStatus, setVerifyStatus] = useState('COMPLIANT')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated') fetchCompanies()
  }, [status, router])

  async function fetchCompanies() {
    setLoading(true)
    const res = await fetch('/api/company')
    const data = await res.json()
    setCompanies(data)
    if (data.length > 0 && !selectedCompany) {
      setSelectedCompany(data[0])
      if (data[0].complianceChecks.length > 0) {
        setChecks(data[0].complianceChecks)
        calculateSummary(data[0].complianceChecks)
      }
    }
    setLoading(false)
  }

  function calculateSummary(checks: ComplianceCheck[]) {
    const total = checks.length
    const compliant = checks.filter(c => c.status === 'COMPLIANT').length
    const nonCompliant = checks.filter(c => c.status === 'NON_COMPLIANT').length
    const attention = checks.filter(c => c.status === 'ATTENTION').length
    const notVerified = checks.filter(c => c.status === 'NOT_VERIFIED').length
    const verifiedTotal = total - notVerified
    const score = verifiedTotal > 0 ? Math.round((compliant / verifiedTotal) * 100) : 0
    setSummary({ total, compliant, nonCompliant, attention, notVerified, score })
  }

  async function runComplianceCheck() {
    if (!selectedCompany) return
    setRunningCheck(true)
    const res = await fetch('/api/compliance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: selectedCompany.id }),
    })
    const data = await res.json()
    setChecks(data.checks)
    setSummary(data.summary)
    setRunningCheck(false)
  }

  async function addCompany(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError('')
    const res = await fetch('/api/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    const data = await res.json()
    setAddLoading(false)
    if (!res.ok) { setAddError(data.error); return }
    setShowAddCompany(false)
    setAddForm({ cin: '', gstin: '', name: '' })
    fetchCompanies()
  }

  async function manualVerify(checkId: string) {
    const res = await fetch('/api/compliance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkId, status: verifyStatus, notes: verifyNote }),
    })
    const data = await res.json()
    if (res.ok) {
      setChecks(data.checks)
      setSummary(data.summary)
      setVerifyingCheck(null)
      setVerifyNote('')
      setVerifyStatus('COMPLIANT')
    }
  }

  function selectCompany(company: Company) {
    setSelectedCompany(company)
    setChecks(company.complianceChecks)
    calculateSummary(company.complianceChecks)
  }

  const filteredChecks = checks.filter(c => {
    if (filterCategory !== 'all' && c.category !== filterCategory) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    return true
  })

  const statusIcon = (status: string) => {
    switch (status) {
      case 'COMPLIANT': return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-bold">&#10003;</span>
      case 'NON_COMPLIANT': return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-500/20 text-red-400 text-sm font-bold">&#10007;</span>
      case 'ATTENTION': return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">!</span>
      case 'NOT_VERIFIED': return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold">?</span>
      default: return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-500/20 text-slate-400 text-sm">?</span>
    }
  }

  const statusBadge = (status: string) => {
    const classes: Record<string, string> = {
      'COMPLIANT': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      'NON_COMPLIANT': 'bg-red-500/10 text-red-400 border-red-500/20',
      'ATTENTION': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      'NOT_VERIFIED': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    }
    const labels: Record<string, string> = {
      'COMPLIANT': 'Compliant',
      'NON_COMPLIANT': 'Non-Compliant',
      'ATTENTION': 'Needs Attention',
      'NOT_VERIFIED': 'Not Verified',
    }
    return <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${classes[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>{labels[status] || status}</span>
  }

  const severityBadge = (severity: string) => {
    const classes: Record<string, string> = {
      'HIGH': 'text-red-400',
      'MEDIUM': 'text-amber-400',
      'LOW': 'text-slate-400',
    }
    return <span className={`text-xs font-medium ${classes[severity] || 'text-slate-400'}`}>{severity}</span>
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900/50 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-white">Adira</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{session?.user?.name}</span>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-slate-500 hover:text-white transition">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Company Selector */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            {companies.length > 0 && (
              <select
                value={selectedCompany?.id || ''}
                onChange={e => { const c = companies.find(c => c.id === e.target.value); if (c) selectCompany(c) }}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50"
              >
                {companies.map(c => (
                  <option key={c.id} value={c.id} className="bg-slate-900">{c.name} {c.cin ? `(${c.cin})` : ''}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowAddCompany(true)} className="px-4 py-2 bg-white/5 border border-white/10 text-white text-sm rounded-lg hover:bg-white/10 transition">
              + Add Company
            </button>
            {selectedCompany && (
              <button onClick={runComplianceCheck} disabled={runningCheck}
                className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-emerald-500/25 transition disabled:opacity-50">
                {runningCheck ? 'Running Check...' : 'Run Compliance Check'}
              </button>
            )}
          </div>
        </div>

        {/* Add Company Modal */}
        {showAddCompany && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 w-full max-w-md">
              <h3 className="text-xl font-bold text-white mb-6">Add Company</h3>
              {addError && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{addError}</div>}
              <form onSubmit={addCompany} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1.5 block">Company Name</label>
                  <input type="text" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50" placeholder="Alphanio NexGen Pvt Ltd" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1.5 block">CIN (Corporate Identification Number)</label>
                  <input type="text" value={addForm.cin} onChange={e => setAddForm({...addForm, cin: e.target.value.toUpperCase()})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 font-mono" placeholder="U72900KA2020PTC140161" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1.5 block">GSTIN</label>
                  <input type="text" value={addForm.gstin} onChange={e => setAddForm({...addForm, gstin: e.target.value.toUpperCase()})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 font-mono" placeholder="29XXXXX1234X1ZX" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddCompany(false)} className="flex-1 py-3 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition">Cancel</button>
                  <button type="submit" disabled={addLoading || (!addForm.cin && !addForm.gstin)}
                    className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl disabled:opacity-50">
                    {addLoading ? 'Adding...' : 'Add & Fetch Data'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* No companies state */}
        {companies.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No companies added yet</h3>
            <p className="text-slate-400 mb-6">Add your company using CIN or GSTIN to start checking compliance</p>
            <button onClick={() => setShowAddCompany(true)} className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition">
              + Add Your First Company
            </button>
          </div>
        )}

        {/* Dashboard Content */}
        {selectedCompany && (
          <>
            {/* Company Info Bar */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div><span className="text-slate-500">Company:</span> <span className="text-white font-medium">{selectedCompany.name}</span></div>
                {selectedCompany.cin && <div><span className="text-slate-500">CIN:</span> <span className="text-white font-mono">{selectedCompany.cin}</span></div>}
                {selectedCompany.gstin && <div><span className="text-slate-500">GSTIN:</span> <span className="text-white font-mono">{selectedCompany.gstin}</span></div>}
                {selectedCompany.companyStatus && <div><span className="text-slate-500">Status:</span> <span className={selectedCompany.companyStatus.toLowerCase() === 'active' ? 'text-emerald-400' : 'text-red-400'}>{selectedCompany.companyStatus}</span></div>}
                {selectedCompany.state && <div><span className="text-slate-500">State:</span> <span className="text-white">{selectedCompany.state}</span></div>}
                {selectedCompany.companyType && <div><span className="text-slate-500">Type:</span> <span className="text-white">{selectedCompany.companyType}</span></div>}
              </div>
            </div>

            {/* Summary Cards */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
                  <div className="text-3xl font-bold text-white mb-1">{summary.score}%</div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">Compliance Score</div>
                  <div className="mt-3 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${summary.score >= 70 ? 'bg-emerald-500' : summary.score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{width: `${summary.score}%`}} />
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
                  <div className="text-3xl font-bold text-white mb-1">{summary.total}</div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">Total Checks</div>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-5 text-center">
                  <div className="text-3xl font-bold text-emerald-400 mb-1">{summary.compliant}</div>
                  <div className="text-xs text-emerald-400/60 uppercase tracking-wider">Compliant</div>
                </div>
                <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-5 text-center">
                  <div className="text-3xl font-bold text-red-400 mb-1">{summary.nonCompliant}</div>
                  <div className="text-xs text-red-400/60 uppercase tracking-wider">Non-Compliant</div>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-5 text-center">
                  <div className="text-3xl font-bold text-amber-400 mb-1">{summary.attention}</div>
                  <div className="text-xs text-amber-400/60 uppercase tracking-wider">Needs Attention</div>
                </div>
                <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-5 text-center">
                  <div className="text-3xl font-bold text-blue-400 mb-1">{summary.notVerified}</div>
                  <div className="text-xs text-blue-400/60 uppercase tracking-wider">Not Verified</div>
                </div>
              </div>
            )}

            {/* Filters */}
            {checks.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-6">
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                  <option value="all" className="bg-slate-900">All Categories</option>
                  <option value="MCA" className="bg-slate-900">MCA</option>
                  <option value="GST" className="bg-slate-900">GST</option>
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                  <option value="all" className="bg-slate-900">All Status</option>
                  <option value="COMPLIANT" className="bg-slate-900">Compliant</option>
                  <option value="NON_COMPLIANT" className="bg-slate-900">Non-Compliant</option>
                  <option value="ATTENTION" className="bg-slate-900">Needs Attention</option>
                  <option value="NOT_VERIFIED" className="bg-slate-900">Not Verified</option>
                </select>
              </div>
            )}

            {/* Compliance Checks */}
            {checks.length === 0 && (
              <div className="text-center py-16 bg-white/5 border border-white/10 rounded-xl">
                <p className="text-slate-400 mb-4">No compliance checks run yet for this company</p>
                <button onClick={runComplianceCheck} disabled={runningCheck}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-medium rounded-xl transition disabled:opacity-50">
                  {runningCheck ? 'Running...' : 'Run First Compliance Check'}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {filteredChecks.map(check => (
                <div key={check.id}
                  className={`bg-white/5 border rounded-xl transition cursor-pointer ${
                    expandedCheck === check.id ? 'border-emerald-500/30' : 'border-white/10 hover:border-white/20'
                  }`}
                  onClick={() => setExpandedCheck(expandedCheck === check.id ? null : check.id)}
                >
                  <div className="p-5 flex items-center gap-4">
                    {statusIcon(check.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-white font-medium">{check.checkName}</span>
                        <span className="px-2 py-0.5 bg-white/5 text-slate-400 text-xs rounded font-mono">{check.category}</span>
                        {severityBadge(check.severity)}
                      </div>
                      <p className="text-sm text-slate-400 truncate">{check.description}</p>
                    </div>
                    {statusBadge(check.status)}
                    <svg className={`w-5 h-5 text-slate-500 transition-transform ${expandedCheck === check.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {expandedCheck === check.id && (
                    <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
                      {check.action && (
                        <div>
                          <h4 className="text-sm font-semibold text-emerald-400 mb-1.5">Recommended Action</h4>
                          <p className="text-sm text-slate-300 leading-relaxed">{check.action}</p>
                        </div>
                      )}
                      {check.penalty && (
                        <div>
                          <h4 className="text-sm font-semibold text-red-400 mb-1.5">Penalty for Non-Compliance</h4>
                          <p className="text-sm text-slate-300 leading-relaxed">{check.penalty}</p>
                        </div>
                      )}
                      {check.reference && (
                        <div>
                          <h4 className="text-sm font-semibold text-blue-400 mb-1.5">Legal Reference</h4>
                          <p className="text-sm text-slate-400">{check.reference}</p>
                        </div>
                      )}
                      {check.deadline && (
                        <div>
                          <h4 className="text-sm font-semibold text-amber-400 mb-1.5">Deadline</h4>
                          <p className="text-sm text-slate-300">{new Date(check.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>
                      )}

                      {/* Manual Verification */}
                      {check.status !== 'COMPLIANT' && (
                        <div className="border-t border-white/5 pt-4">
                          {verifyingCheck === check.id ? (
                            <div className="space-y-3" onClick={e => e.stopPropagation()}>
                              <div className="flex gap-3">
                                <select value={verifyStatus} onChange={e => setVerifyStatus(e.target.value)}
                                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                                  <option value="COMPLIANT" className="bg-slate-900">Mark as Compliant</option>
                                  <option value="ATTENTION" className="bg-slate-900">Needs Attention</option>
                                  <option value="NON_COMPLIANT" className="bg-slate-900">Non-Compliant</option>
                                </select>
                              </div>
                              <input type="text" value={verifyNote} onChange={e => setVerifyNote(e.target.value)}
                                placeholder="Add verification notes (e.g., 'Filed on GST portal on 15 Feb')"
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/50" />
                              <div className="flex gap-2">
                                <button onClick={(e) => { e.stopPropagation(); manualVerify(check.id) }}
                                  className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm rounded-lg hover:bg-emerald-500/30 transition">
                                  Confirm
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setVerifyingCheck(null) }}
                                  className="px-4 py-2 bg-white/5 border border-white/10 text-slate-400 text-sm rounded-lg hover:bg-white/10 transition">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); setVerifyingCheck(check.id); setVerifyNote(''); setVerifyStatus('COMPLIANT') }}
                              className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg hover:bg-emerald-500/20 transition flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Mark as Verified
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
