import { useCallback, useEffect, useState } from 'react'
import {
  googleLogin,
  emailLogin,
  verifyOtp,
  register as authRegister,
  forgotPassword as authForgotPassword,
  verifyForgotOtp as authVerifyForgotOtp,
  resetPassword as authResetPassword,
  getMe,
  logout as authLogout,
} from '../api/authApi'
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
  // Forgot-password flow tokens (kept internal so callers pass only otp/password).
  const [forgotSession, setForgotSession] = useState('')
  const [resetToken, setResetToken] = useState('')

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

  // Forgot-password step 1: request a reset code; stores the session token.
  const forgotPassword = useCallback(async (email) => {
    const data = await authForgotPassword(email)
    setForgotSession(data?.session_token || '')
    return data
  }, [])

  // Forgot-password step 2: verify the reset OTP; stores the reset token.
  const verifyForgotOtp = useCallback(async (otp) => {
    const data = await authVerifyForgotOtp(forgotSession, otp)
    setResetToken(data?.reset_token || '')
    return data
  }, [forgotSession])

  // Forgot-password step 3: set the new password, then clear the flow tokens.
  const resetPassword = useCallback(async (newPassword) => {
    const data = await authResetPassword(resetToken, newPassword)
    setForgotSession('')
    setResetToken('')
    return data
  }, [resetToken])

  const logout = useCallback(() => {
    authLogout()
    setUser(null)
    setOtpRequired(false)
    setSessionToken('')
    setForgotSession('')
    setResetToken('')
  }, [])

  return {
    user,
    loading,
    otpRequired,
    sessionToken,
    login,
    loginWithEmail,
    submitOtp,
    register,
    forgotPassword,
    verifyForgotOtp,
    resetPassword,
    logout,
  }
}
