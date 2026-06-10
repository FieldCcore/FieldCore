import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const cookieStore = cookies()
  const token = cookieStore.get('fieldcore_token')?.value
  if (!token) redirect('/auth/login')

  let profile = null
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) redirect('/auth/login')
    const data = await res.json()
    profile = data.user
  } catch {
    redirect('/auth/login')
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="font-bold text-navy text-2xl mb-6">
        {greeting}, {firstName} 👋
      </h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Revenue Today', value: '$0', sub: 'No completed jobs yet' },
          { label: 'Jobs Today', value: '0', sub: 'None scheduled' },
          { label: 'Jobs This Week', value: '0', sub: 'Getting started' },
          { label: 'Outstanding', value: '$0', sub: 'No open invoices' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-lightgray rounded-lg p-5">
            <p className="text-[11px] font-semibold text-slate uppercase tracking-wide">{k.label}</p>
            <p className="text-3xl font-bold text-navy mt-2">{k.value}</p>
            <p className="text-xs text-steel mt-1">{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-lightgray rounded-lg p-6">
        <h2 className="font-bold text-navy text-sm mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['New Job', 'New Client', 'New Invoice', 'New Quote'].map(a => (
            <button key={a} className="bg-offwhite border border-lightgray rounded-lg p-4 text-left hover:border-sand hover:bg-sand/5 transition-colors">
              <p className="text-sm font-semibold text-navy">{a}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
