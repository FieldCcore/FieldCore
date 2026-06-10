import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies()
  const token = cookieStore.get('fieldcore_token')?.value
  if (!token) redirect('/auth/login')

  let profile = null
  let organizations: { id: string; name: string; color: string; role: string }[] = []

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) redirect('/auth/login')
    const data = await res.json()
    profile = data.user
    organizations = data.organizations ?? [
      {
        id: profile.accountId ?? profile.account_id,
        name: profile.accountName ?? profile.account_name,
        color: '#D6B58A',
        role: profile.role ?? 'owner',
      },
    ]
  } catch {
    redirect('/auth/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        organizations={organizations}
        activeOrgId={profile?.accountId ?? profile?.account_id ?? ''}
        profile={profile}
        planTier={profile?.plan ?? 'starter'}
      />
      <div className="flex-1 flex flex-col overflow-hidden bg-offwhite">{children}</div>
    </div>
  )
}
