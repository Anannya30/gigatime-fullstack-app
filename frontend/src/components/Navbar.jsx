import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, User } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import ResearchBadge from './ResearchBadge'
import { cn, timeAgo } from '../utils/helpers'
import { APP_NAME, PAGES } from '../utils/constants'
import biostackLogo from '../data/biostack-logo.jpeg'

/** Brand mark: BioStack DNA logo. */
export function Logo({ className }) {
  return <img src={biostackLogo} alt={`${APP_NAME} logo`} className={cn('object-contain', className)} />
}

/** Serif notebook wordmark: "Giga" + italic "TIME" (TIME in green when accentTime). */
export function Wordmark({ className, accentTime = false }) {
  return (
    <span className={cn('font-serif text-lg font-bold tracking-tight text-gray-900 dark:text-white', className)}>
      Giga<span className={cn('italic', accentTime && 'text-brand dark:text-brand-light')}>TIME</span>
    </span>
  )
}

// Map a backend slide status (COMPLETED/FAILED) to a label + dot tone.
function notifMeta(status) {
  const failed = String(status).toUpperCase() === 'FAILED'
  return { label: failed ? 'Failed' : 'Completed', tone: failed ? 'red' : 'green' }
}

export default function Navbar({ user, isDark, onToggleTheme, onToggleSidebar, onNavigate, onLogout, scrolled, notifications = [], unreadCount = 0, onClearNotification }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const menuRef = useRef(null)
  const bellRef = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-paper-line bg-paper dark:border-gray-800 dark:bg-gray-900">

      <div className="flex h-full items-center justify-between px-6">
        {/* Left: logo */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={onToggleSidebar} className="btn-ghost h-9 w-9 !px-0 lg:hidden" aria-label="Toggle navigation">
            <Menu className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => onNavigate(PAGES.DASHBOARD)} className="flex items-center gap-2">
            <Wordmark />
          </button>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Persistent compliance badge — shown on every authenticated page */}
          <ResearchBadge className="hidden md:inline-flex" />
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search slides…"
              className="w-56 rounded-lg border border-paper-line bg-white py-1.5 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 transition-colors focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Notifications */}
          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={() => setBellOpen((o) => !o)}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-paper-line text-gray-500 transition-all hover:border-brand hover:text-brand dark:border-gray-700 dark:text-gray-400"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white ring-2 ring-paper dark:ring-gray-900">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 mt-2 w-80 origin-top-right animate-fade-in-fast rounded-xl border border-gray-200 bg-white p-2 shadow-lift dark:border-gray-700 dark:bg-gray-800">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Notifications</p>
                {notifications.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-gray-400">No new notifications</p>
                ) : (
                  notifications.map((n) => {
                    const { label, tone } = notifMeta(n.status)
                    return (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => onClearNotification?.(n.id)}
                        className="flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', tone === 'green' ? 'bg-brand' : 'bg-red-500')} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{n.filename}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{label} · {timeAgo(n.timestamp)}</p>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2.5 rounded-lg border border-transparent py-1 pl-1.5 pr-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{user.initials}</span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-tight text-gray-900 dark:text-white">{user.name}</span>
                <span className="block text-xs leading-tight text-gray-500 dark:text-gray-400">{user.institution}</span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 origin-top-right animate-fade-in-fast rounded-xl border border-gray-200 bg-white p-1.5 shadow-lift dark:border-gray-700 dark:bg-gray-800">
                <MenuItem icon={User} label="Profile" onClick={() => { setMenuOpen(false); onNavigate(PAGES.SETTINGS) }} />
                <MenuItem icon={Settings} label="Settings" onClick={() => { setMenuOpen(false); onNavigate(PAGES.SETTINGS) }} />
                <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                <MenuItem icon={LogOut} label="Logout" danger onClick={() => { setMenuOpen(false); onLogout() }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        danger ? 'text-red-500 hover:bg-red-500/10' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700/50'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
