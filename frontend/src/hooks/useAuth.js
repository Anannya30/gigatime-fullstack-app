import { useCallback, useEffect, useState } from 'react'
import { googleLogin, emailLogin, verifyOtp, register as authRegister, getMe, logout as authLogout } from '../api/authApi'
import { ACCESS_TOKEN_KEY } from '../api/slidesApi'

/**
 * Authentication state. On mount, if an access token is present, verify it via
 * GET /api/auth/me/ and hydrate the user; otherwise the app stays logged out.
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Email+password → OTP two-step login state.
  const [otpRequired, setOtpRequired] = useState(false)
  const [sessionToken, setSessionToken] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY)
      if (!token) {
        if (active) setLoading(false)
        return
      }
      try {
        const me = await getMe()
        if (active) setUser(me)
      } catch {
        // Token invalid/expired — drop it and stay logged out.
        authLogout()
        if (active) setUser(null)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (credential) => {
    const data = await googleLogin(credential)
    setUser(data.user)
    return data.user
  }, [])

  // Step 1: verify email+password; on success the backend sends an OTP email.
  const loginWithEmail = useCallback(async (email, password) => {
    const data = await emailLogin(email, password)
    if (data?.otp_required) {
      setOtpRequired(true)
      setSessionToken(data.session_token)
    }
    return data
  }, [])

  // Step 2: verify the OTP for the active session, completing the login.
  const submitOtp = useCallback(async (otp) => {
    const data = await verifyOtp(sessionToken, otp)
    setUser(data.user)
    setOtpRequired(false)
    setSessionToken('')
    return data.user
  }, [sessionToken])

  // Create an account (no auto-login); returns the backend success message.
  const register = useCallback(async (email, password, firstName, lastName, labName) => {
    const data = await authRegister(email, password, firstName, lastName, labName)
    return data?.message
  }, [])

  const logout = useCallback(() => {
    authLogout()
    setUser(null)
    setOtpRequired(false)
    setSessionToken('')
  }, [])

  return { user, loading, otpRequired, sessionToken, login, loginWithEmail, submitOtp, register, logout }
}
