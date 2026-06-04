import { useState } from 'react'
import { Lock, Mail } from 'lucide-react'
import { Logo } from '../components/Navbar'
import ThemeToggle from '../components/ThemeToggle'
import { APP_NAME, APP_TAGLINE, APP_USER } from '../utils/constants'

function GoogleIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.75 12 4.75z" />
    </svg>
  )
}

export default function LoginPage({ onLogin, isDark, onToggleTheme }) {
  const [email, setEmail] = useState(APP_USER.email)
  const [password, setPassword] = useState('••••••••')

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="absolute right-5 top-5">
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>

      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="h-14 w-14" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{APP_NAME}</h1>
          <p className="mt-1.5 max-w-xs text-sm text-gray-500 dark:text-gray-400">{APP_TAGLINE}</p>
        </div>

        <div className="card p-7">
          <form onSubmit={(e) => { e.preventDefault(); onLogin() }} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-9" placeholder="you@institution.org" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input pl-9" placeholder="••••••••" />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">Sign In</button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs font-medium text-gray-400">or</span>
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          </div>

          <button type="button" onClick={onLogin} className="btn-secondary w-full">
            <GoogleIcon className="h-4 w-4" />
            Continue with Google
          </button>
        </div>

        <div className="mt-6 text-center">
          <span className="inline-block rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-dark dark:text-accent">Research Use Only</span>
          <p className="mt-2 text-xs text-gray-400">Not intended for clinical diagnosis.</p>
        </div>
      </div>
    </div>
  )
}
