'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard')
  }, [status, router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white">Adira</span>
        </div>
        <div className="flex gap-3">
          <a href="/login" className="px-5 py-2.5 text-sm font-medium text-white/80 hover:text-white transition">Login</a>
          <a href="/register" className="px-5 py-2.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition">Get Started</a>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-8 pt-20 pb-32">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-emerald-400 text-sm mb-8">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            MCA + GST Compliance Intelligence
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
            Know Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Compliance</span> Status Instantly
          </h1>
          <p className="text-xl text-slate-400 mb-10 leading-relaxed">
            Enter your CIN or GSTIN and get a complete compliance health check.
            See what&apos;s compliant, what needs attention, and exactly what actions to take.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/register" className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl text-lg hover:shadow-lg hover:shadow-emerald-500/25 transition">
              Check Your Compliance Free
            </a>
            <a href="/login" className="px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-xl text-lg hover:bg-white/10 transition">
              Already have an account?
            </a>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-24">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.07] transition">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">MCA Compliance</h3>
            <p className="text-slate-400">Track annual filings (AOC-4, MGT-7), director KYC, auditor appointments, and company status from MCA portal.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.07] transition">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">GST Compliance</h3>
            <p className="text-slate-400">Monitor GSTR-1, GSTR-3B, GSTR-9 filing status, ITC reconciliation, e-invoicing, and e-way bill compliance.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.07] transition">
            <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Action Items</h3>
            <p className="text-slate-400">Get specific recommendations with deadlines, penalty info, and law references for each non-compliant item.</p>
          </div>
        </div>
      </div>

      <footer className="border-t border-white/5 py-8 text-center text-slate-500 text-sm">
        <p>Powered by Alphanio NexGen &middot; Data sourced from MCA &amp; GST public portals</p>
      </footer>
    </div>
  )
}
