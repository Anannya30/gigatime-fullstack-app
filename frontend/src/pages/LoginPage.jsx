import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Wordmark } from '../components/Navbar'
import ThemeToggle from '../components/ThemeToggle'

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

/** Password input with an inline eye toggle (same `input` styling + right icon). */
function PasswordInput({ id, value, onChange, placeholder, show, onToggle }) {
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        required
        value={value}
        onChange={onChange}
        className="input bg-white pr-10 dark:bg-gray-900/60"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default function LoginPage({ isDark, onToggleTheme, otpRequired, loginWithEmail, submitOtp, register, forgotPassword, verifyForgotOtp, resetPassword }) {
  // 'signin' | 'signup' | 'forgot' | 'forgot-otp' | 'reset-password'
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [labName, setLabName] = useState('')
  const [otp, setOtp] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  function showSignin() {
    setMode('signin')
    setError(null)
    setSuccess(null)
  }
  function showSignup() {
    setMode('signup')
    setError(null)
    setSuccess(null)
  }
  function showForgot() {
    setMode('forgot')
    setError(null)
    setSuccess(null)
  }

  async function handleForgotRequest(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await forgotPassword(email)
      setMode('forgot-otp')
    } catch (err) {
      setError(err.message || 'Could not send reset code')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotVerify(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await verifyForgotOtp(forgotOtp)
      setMode('reset-password')
    } catch (err) {
      setError(err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await resetPassword(newPassword)
      setSuccess('Password reset! Please sign in.')
      setMode('signin')
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setForgotOtp('')
    } catch (err) {
      setError(err.message || 'Could not reset password')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      await register(email, password, firstName, lastName, labName)
      setSuccess('Account created! Please sign in.')
      setMode('signin')
      setPassword('')
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await loginWithEmail(email, password)
    } catch (err) {
      setError(err.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await submitOtp(otp)
    } catch (err) {
      setError(err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError(null)
    setLoading(true)
    try {
      await loginWithEmail(email, password)
    } catch (err) {
      setError(err.message || 'Could not resend code')
    } finally {
      setLoading(false)
    }
  }

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

        {/* Sign-in */}
        <div className="px-8 py-7">
          {otpRequired ? (
            <>
              <h2 className="text-center font-serif text-xl font-bold text-gray-900 dark:text-white">Check your email</h2>
              <p className="mt-1.5 text-center text-sm text-gray-500 dark:text-gray-400">Enter the 6-digit code sent to {email}</p>
              <form onSubmit={handleVerify} className="mt-5 space-y-4">
                <div>
                  <label className="label" htmlFor="otp">Verification code</label>
                  <input id="otp" type="text" inputMode="numeric" maxLength={6} required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input bg-white dark:bg-gray-900/60" placeholder="123456" />
                </div>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
              </form>
              <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
                Didn&rsquo;t get it?{' '}
                <button type="button" onClick={handleResend} disabled={loading} className="font-semibold text-brand hover:text-brand-dark disabled:opacity-60 dark:text-brand-light">
                  Resend code
                </button>
              </p>
            </>
          ) : mode === 'signup' ? (
            <>
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="label" htmlFor="reg-email">Email</label>
                  <input id="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input bg-white dark:bg-gray-900/60" placeholder="you@institution.org" />
                </div>
                <div>
                  <label className="label" htmlFor="reg-password">Password</label>
                  <PasswordInput id="reg-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" show={showPassword} onToggle={() => setShowPassword((s) => !s)} />
                </div>
                <div>
                  <label className="label" htmlFor="reg-first-name">First Name</label>
                  <input id="reg-first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input bg-white dark:bg-gray-900/60" placeholder="Ada" />
                </div>
                <div>
                  <label className="label" htmlFor="reg-last-name">Last Name</label>
                  <input id="reg-last-name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="input bg-white dark:bg-gray-900/60" placeholder="Lovelace" />
                </div>
                <div>
                  <label className="label" htmlFor="reg-lab-name">Lab Name</label>
                  <input id="reg-lab-name" type="text" value={labName} onChange={(e) => setLabName(e.target.value)} className="input bg-white dark:bg-gray-900/60" placeholder="Research Lab" />
                </div>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
                Already have an account?{' '}
                <button type="button" onClick={showSignin} className="font-semibold text-brand hover:text-brand-dark dark:text-brand-light">
                  Sign in
                </button>
              </p>
            </>
          ) : mode === 'forgot' ? (
            <>
              <h2 className="text-center font-serif text-xl font-bold text-gray-900 dark:text-white">Reset your password</h2>
              <p className="mt-1.5 text-center text-sm text-gray-500 dark:text-gray-400">Enter your email and we&rsquo;ll send you a reset code</p>
              <form onSubmit={handleForgotRequest} className="mt-5 space-y-4">
                <div>
                  <label className="label" htmlFor="forgot-email">Email</label>
                  <input id="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input bg-white dark:bg-gray-900/60" placeholder="you@institution.org" />
                </div>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? 'Sending…' : 'Send reset code'}
                </button>
              </form>
              <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
                <button type="button" onClick={showSignin} className="font-semibold text-brand hover:text-brand-dark dark:text-brand-light">
                  Back to sign in
                </button>
              </p>
            </>
          ) : mode === 'forgot-otp' ? (
            <>
              <h2 className="text-center font-serif text-xl font-bold text-gray-900 dark:text-white">Check your email</h2>
              <p className="mt-1.5 text-center text-sm text-gray-500 dark:text-gray-400">Enter the 6-digit reset code sent to {email}</p>
              <form onSubmit={handleForgotVerify} className="mt-5 space-y-4">
                <div>
                  <label className="label" htmlFor="forgot-otp">Reset code</label>
                  <input id="forgot-otp" type="text" inputMode="numeric" maxLength={6} required value={forgotOtp} onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input bg-white dark:bg-gray-900/60" placeholder="123456" />
                </div>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? 'Verifying…' : 'Verify code'}
                </button>
              </form>
              <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
                <button type="button" onClick={() => { setMode('forgot'); setError(null) }} className="font-semibold text-brand hover:text-brand-dark dark:text-brand-light">
                  Back
                </button>
              </p>
            </>
          ) : mode === 'reset-password' ? (
            <>
              <h2 className="text-center font-serif text-xl font-bold text-gray-900 dark:text-white">Set new password</h2>
              <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
                <div>
                  <label className="label" htmlFor="new-password">New password</label>
                  <PasswordInput id="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" show={showNewPassword} onToggle={() => setShowNewPassword((s) => !s)} />
                </div>
                <div>
                  <label className="label" htmlFor="confirm-password">Confirm password</label>
                  <PasswordInput id="confirm-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" show={showConfirmPassword} onToggle={() => setShowConfirmPassword((s) => !s)} />
                </div>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? 'Resetting…' : 'Reset password'}
                </button>
              </form>
            </>
          ) : (
            <>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input bg-white dark:bg-gray-900/60" placeholder="you@institution.org" />
                </div>
                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" show={showPassword} onToggle={() => setShowPassword((s) => !s)} />
                  <p className="mt-1.5 text-right text-xs">
                    <button type="button" onClick={showForgot} className="font-semibold text-brand hover:text-brand-dark dark:text-brand-light">
                      Forgot password?
                    </button>
                  </p>
                </div>
                {success && <p className="text-sm text-brand dark:text-brand-light">{success}</p>}
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                Don&rsquo;t have an account?{' '}
                <button type="button" onClick={showSignup} className="font-semibold text-brand hover:text-brand-dark dark:text-brand-light">
                  Sign up
                </button>
              </p>

              <p className="my-4 text-center text-xs font-semibold uppercase tracking-widest text-gray-400">or</p>

              <button
                type="button"
                disabled
                aria-disabled="true"
                className="btn w-full cursor-not-allowed border border-paper-line bg-white text-gray-400 opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
              >
                <GoogleIcon className="h-4 w-4" />
                Continue with Google
                <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                  Coming Soon
                </span>
              </button>
              <p className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
                Google sign-in setup in progress
              </p>
            </>
          )}
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
