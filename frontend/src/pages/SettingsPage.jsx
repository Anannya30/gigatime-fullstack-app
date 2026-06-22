import { useState } from 'react'
import { Moon, ShieldCheck, Sun } from 'lucide-react'
import { cn } from '../utils/helpers'
import { PAGES } from '../utils/constants'

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} role="switch" aria-checked={checked} className={cn('relative h-6 w-11 rounded-full transition-colors duration-200', checked ? 'bg-brand' : 'bg-gray-300 dark:bg-gray-600')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  )
}

function Row({ title, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
        {desc && <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage({ user, isDark, onToggleTheme, onNavigate }) {
  const [emailNotif, setEmailNotif] = useState(true)
  const [slideNotif, setSlideNotif] = useState(true)
  const profile = user || {}

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage your profile and preferences.</p>
      </div>

      <div className="card p-6">
        <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">Profile</h3>
        <div className="flex items-center gap-4 py-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">{profile.initials}</span>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{profile.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
            {profile.institution && <p className="text-xs text-gray-400">{profile.institution}</p>}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">Appearance</h3>
        <Row title="Theme" desc={isDark ? 'Dark mode' : 'Light mode'}>
          <button type="button" onClick={onToggleTheme} className="btn-secondary text-xs">
            {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {isDark ? 'Dark' : 'Light'}
          </button>
        </Row>
      </div>

      <div className="card divide-y divide-gray-100 p-5 dark:divide-gray-800">
        <h3 className="pb-1 font-semibold text-gray-900 dark:text-white">Notifications</h3>
        <Row title="Email notifications" desc="Slide completion summaries by email"><Toggle checked={emailNotif} onChange={setEmailNotif} /></Row>
        <Row title="In-app slide alerts" desc="Show alerts when slides change status"><Toggle checked={slideNotif} onChange={setSlideNotif} /></Row>
      </div>

      <div className="card p-6">
        <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">Privacy & Compliance</h3>
        <Row title="Research-use notice" desc="Review the privacy & research-use terms">
          <button type="button" onClick={() => onNavigate(PAGES.NOTICE)} className="btn-secondary text-xs"><ShieldCheck className="h-4 w-4" /> View</button>
        </Row>
      </div>
    </div>
  )
}
