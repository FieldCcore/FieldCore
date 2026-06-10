'use client'
import { useRouter } from 'next/navigation'

interface Org { id: string; name: string; color: string; role: string }
interface Props { organizations: Org[]; activeOrgId: string }

export function EntitySwitcher({ organizations, activeOrgId }: Props) {
  const router = useRouter()
  return (
    <>
      <div className="px-2.5 pt-3 pb-1">
        <p className="text-[9px] font-bold text-steel uppercase tracking-widest px-2 mb-1.5">Entities</p>
        {organizations.map(org => (
          <button key={org.id} onClick={() => router.refresh()}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg transition-colors hover:bg-[#2d3a52] mb-0.5 text-left ${org.id === activeOrgId ? 'bg-sand/10' : ''}`}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: org.color }} />
            <span className={`text-xs font-semibold truncate flex-1 ${org.id === activeOrgId ? 'text-sand' : 'text-white/60'}`}>{org.name}</span>
            <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${org.id === activeOrgId ? 'text-sand bg-sand/15' : 'text-steel bg-white/[0.06]'}`}>{org.role}</span>
          </button>
        ))}
      </div>
      <div className="h-px bg-white/[0.06] mx-2.5 my-2" />
    </>
  )
}
