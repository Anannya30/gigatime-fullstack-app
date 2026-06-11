import { ChevronLeft, Clock } from 'lucide-react'
import { cn, truncate, statusLabel } from '../utils/helpers'
import { NAV_ITEMS, SLIDE_STATUS, PAGES } from '../utils/constants'

const SLIDE_GRADIENT = {
  [SLIDE_STATUS.SUCCEEDED]: 'bg-gradient-to-b from-green-50 to-green-200 dark:from-green-500/10 dark:to-green-500/25',
  [SLIDE_STATUS.RUNNING]: 'bg-gradient-to-b from-orange-50 to-orange-200 dark:from-orange-500/10 dark:to-orange-500/25',
  [SLIDE_STATUS.FAILED]: 'bg-gradient-to-b from-red-50 to-red-200 dark:from-red-500/10 dark:to-red-500/25',
}
const SLIDE_BORDER = {
  [SLIDE_STATUS.SUCCEEDED]: 'border-green-500',
  [SLIDE_STATUS.RUNNING]: 'border-orange-500',
  [SLIDE_STATUS.FAILED]: 'border-red-500',
}

function RecentSlide({ slide, onSelect }) {
  const gradient = SLIDE_GRADIENT[slide.status] || 'bg-gradient-to-b from-gray-50 to-gray-200 dark:from-gray-700 dark:to-gray-600'
  const border = SLIDE_BORDER[slide.status] || 'border-gray-400'

  return (
    <button
      type="button"
      onClick={() => onSelect(slide.id)}
      className={cn('flex h-14 w-full items-center gap-2.5 rounded-lg border-l-2 pl-2.5 pr-2 text-left transition-colors hover:bg-brand/5', border)}
    >
      <span className={cn('h-10 w-8 shrink-0 rounded', gradient)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{truncate(slide.filename, 18)}</span>
        <span className="block text-[11px] font-medium text-gray-400">{statusLabel(slide.status)}</span>
      </span>
    </button>
  )
}

export default function Sidebar({ current, onNavigate, collapsed, onToggleCollapse, mobileOpen, onCloseMobile, recentSlides = [], onSelectSlide }) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-gray-900/40 backdrop-blur-sm lg:hidden" onClick={onCloseMobile} />}

      <aside
        className={cn(
          'z-40 flex shrink-0 flex-col border-r border-paper-line bg-paper transition-all duration-300 dark:border-gray-800 dark:bg-gray-900',
          collapsed ? 'w-16' : 'w-[calc(260px_+_2cm)]',
          'fixed inset-y-0 left-0 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Nav */}
        <nav className="space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = current === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { onNavigate(item.id); onCloseMobile?.() }}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg py-2.5 text-sm transition-all duration-150',
                  collapsed ? 'justify-center px-0' : 'px-3',
                  active
                    ? 'bg-brand/10 font-semibold text-brand-dark dark:text-brand-light'
                    : 'font-medium text-gray-500 hover:bg-brand/5 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                )}
              >
                <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-brand' : 'group-hover:text-brand')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Recent Slides */}
        {!collapsed && (
          <div className="mt-2 flex-1 overflow-y-auto border-t border-paper-line px-3 pt-4 dark:border-gray-800">
            <div className="mb-2 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              Recent Slides
            </div>
            <div className="space-y-0.5">
              {recentSlides.map((s) => (
                <RecentSlide key={s.id} slide={s} onSelect={onSelectSlide} />
              ))}
            </div>
            <button type="button" onClick={() => onNavigate(PAGES.HISTORY)} className="mt-2 px-2 text-xs font-semibold text-brand hover:text-brand-dark">
              View all →
            </button>
          </div>
        )}
        {collapsed && <div className="flex-1" />}

        {/* Collapse toggle */}
        <div className="hidden border-t border-paper-line p-3 dark:border-gray-800 lg:block">
          <button type="button" onClick={onToggleCollapse} className="btn-ghost w-full" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <ChevronLeft className={cn('h-4 w-4 transition-transform duration-300', collapsed && 'rotate-180')} />
            {!collapsed && <span className="text-xs font-semibold">Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
