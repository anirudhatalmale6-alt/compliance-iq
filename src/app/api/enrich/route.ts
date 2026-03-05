// Serverless route - fetches Tofler data via proxy to bypass IP blocking
import { fetchToflerViaProxy } from '@/lib/tofler-proxy'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: Request) {
  const { cin } = await req.json()
  if (!cin) return new Response(JSON.stringify({ error: 'CIN required' }), { status: 400 })

  try {
    const data = await fetchToflerViaProxy(cin)
    if (!data) {
      return new Response(JSON.stringify({ error: 'All proxies failed' }), { status: 502 })
    }
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Fetch failed' }), { status: 500 })
  }
}
