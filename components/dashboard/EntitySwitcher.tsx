interface Org {
  id: string
  name: string
  color?: string
  role?: string
}

interface EntitySwitcherProps {
  organizations: Org[]
  activeOrgId: string
}

export function EntitySwitcher({ organizations, activeOrgId }: EntitySwitcherProps) {
  return (
    <div className="px-3 pb-3">
      <div className="space-y-0.5">
        {organizations.map(org => {
          const isActive = org.id === activeOrgId
          const color = org.color ?? '#D6B58A'
          const initials = org.name
            .split(' ')
            .slice(0, 2)
            .map(w => w[0])
            .join('')
            .toUpperCase()

          return (
            <div
              key={org.id}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg ${
                isActive
                  ? 'bg-[#D6B58A]/10'
                  : 'bg-white/[0.06] opacity-70 hover:opacity-100 transition-opacity'
              }`}
            >
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {initials}
              </div>
              <span className={`text-sm font-medium truncate flex-1 min-w-0 ${isActive ? 'text-[#D6B58A]' : 'text-white/60'}`}>
                {org.name}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${isActive ? 'bg-[#D6B58A]/20 text-[#D6B58A]' : 'bg-white/[0.06] text-white/40'}`}>
                {org.role ?? 'owner'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 h-px bg-white/[0.06]" />
    </div>
  )
}
