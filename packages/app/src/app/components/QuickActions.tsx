interface QuickActionsProps {
  actions: { icon: string; label: string; action: string }[]
  onActionClick: (action: string) => void
  disabled?: boolean
}

export function QuickActions({ actions, onActionClick, disabled }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((item, index) => (
        <button
          key={index}
          onClick={() => onActionClick(item.action)}
          disabled={disabled}
          className="px-4 py-2 bg-gray-100 border border-gray-200 text-gray-700 rounded-full hover:bg-[#C9956C] hover:text-white hover:border-[#C9956C] transition-all text-sm whitespace-nowrap disabled:opacity-40"
        >
          {item.icon} {item.label}
        </button>
      ))}
    </div>
  )
}
