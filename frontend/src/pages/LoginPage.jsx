import { useState } from 'react'
import { Wordmark } from '../components/Navbar'
import ThemeToggle from '../components/ThemeToggle'
import { APP_USER } from '../utils/constants'

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
    <div className="relative flex min-h-screen items-center justify-center bg-paper px-4 dark:bg-gray-900">
      <div className="absolute right-5 top-5">
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>

      {/* Single card: header · form · RUO strip */}
      <div className="w-full max-w-md animate-fade-in overflow-hidden rounded-xl border border-paper-line bg-white shadow-lift dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="border-b border-paper-line px-8 pb-5 pt-8 text-center dark:border-gray-700">
          <Wordmark className="text-5xl" accentTime />
          <p className="mt-2 text-sm tracking-wide text-gray-500 dark:text-gray-400">Virtual mIF · Research Notebook</p>
        </div>

        {/* Form */}
        <div className="px-8 py-7">
          <form onSubmit={(e) => { e.preventDefault(); onLogin() }} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input bg-white dark:bg-gray-900/60" placeholder="you@institution.org" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input bg-white dark:bg-gray-900/60" placeholder="••••••••" />
            </div>
            <button type="submit" className="btn-primary w-full">Sign in</button>
          </form>

          <p className="my-4 text-center text-xs font-semibold uppercase tracking-widest text-gray-400">or</p>

          <button type="button" onClick={onLogin} className="btn w-full border border-paper-line bg-white text-gray-700 hover:border-brand hover:text-brand dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-brand dark:hover:text-brand-light">
            <GoogleIcon className="h-4 w-4" />
            Continue with Google
          </button>
        </div>

        {/* Research Use Only strip */}
        <div className="border-t border-paper-line bg-[#EFE7D6] px-8 py-3 text-center dark:border-gray-700 dark:bg-gray-900/40">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-accent-dark/70 dark:text-gray-400">
            Research Use Only — Not for Clinical Diagnosis
          </span>
        </div>
      </div>
    </div>
  )
}
