import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, User } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { cn } from '../utils/helpers'
import { APP_NAME, PAGES } from '../utils/constants'
import biostackLogo from '../data/biostack-logo.jpeg'

/** Brand mark: BioStack DNA logo. */
export function Logo({ className }) {
  return <img src={biostackLogo} alt={`${APP_NAME} logo`} className={cn('object-contain', className)} />
}

const MOCK_NOTIFICATIONS = [
  { id: 1, title: 'LUAD-cohortA-0781 is running', detail: 'Inference batch 15 · ETA ~4 min', tone: 'orange' },
  { id: 2, title: 'TCGA-44-2665-01A completed', detail: 'Immune phenotype resolved · 21 channels', tone: 'green' },
  { id: 3, title: 'BRCA-Slide-0192 failed', detail: 'Worker preempted — requeuing', tone: 'red' },
]

export default function Navbar({ user, isDark, onToggleTheme, onToggleSidebar, onNavigate, onLogout, scrolled }) {
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
    <header className="sticky top-0 z-30 h-14 border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">

      <div className="flex h-full items-center justify-between px-6">
        {/* Left: logo */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={onToggleSidebar} className="btn-ghost h-9 w-9 !px-0 lg:hidden" aria-label="Toggle navigation">
            <Menu className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => onNavigate(PAGES.DASHBOARD)} className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-base font-bold tracking-tight text-gray-900 dark:text-white">{APP_NAME}</span>
          </button>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search slides…"
              className="w-56 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 transition-colors focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Notifications */}
          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={() => setBellOpen((o) => !o)}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-all hover:border-brand hover:text-brand dark:border-gray-700 dark:text-gray-400"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-white dark:ring-gray-900" />
            </button>
            {bellOpen && (
              <div className="absolute right-0 mt-2 w-80 origin-top-right animate-fade-in-fast rounded-xl border border-gray-200 bg-white p-2 shadow-lift dark:border-gray-700 dark:bg-gray-800">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Notifications</p>
                {MOCK_NOTIFICATIONS.map((n) => (
                  <div key={n.id} className="flex gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.tone === 'green' && 'bg-brand', n.tone === 'orange' && 'bg-accent', n.tone === 'red' && 'bg-red-500')} />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{n.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{n.detail}</p>
                    </div>
                  </div>
                ))}
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
