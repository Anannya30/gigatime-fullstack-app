/**
 * Auth data layer — Google sign-in + JWT lifecycle against the Django backend.
 *
 * Tokens live in localStorage:
 *   gigatime_access_token  — short-lived access JWT (Bearer header)
 *   gigatime_refresh_token — refresh JWT
 */
import { API_BASE, ACCESS_TOKEN_KEY, getAuthHeaders, handleResponse } from './slidesApi'

export const REFRESH_TOKEN_KEY = 'gigatime_refresh_token'

/**
 * POST /api/auth/google/ — exchange a Google ID token (credential) for GigaTIME
 * JWTs. Persists the access + refresh tokens and returns {access, refresh, user}.
 */
export async function googleLogin(credential) {
  const res = await fetch(`${API_BASE}/auth/google/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  const data = await handleResponse(res)
  if (data?.access) localStorage.setItem(ACCESS_TOKEN_KEY, data.access)
  if (data?.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh)
  return data
}

/**
 * POST /api/auth/register/ — create an account. Returns {message} on success
 * (no auto-login); throws the backend error message otherwise.
 */
export async function register(email, password, firstName, lastName, labName) {
  const res = await fetch(`${API_BASE}/auth/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      lab_name: labName,
    }),
  })
  return handleResponse(res)
}

/**
 * POST /api/auth/login/ — verify email + password. On success the backend
 * emails a 6-digit OTP and returns {otp_required, session_token}.
 */
export async function emailLogin(email, password) {
  const res = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handleResponse(res)
}

/**
 * POST /api/auth/verify-otp/ — exchange a session token + OTP for GigaTIME JWTs.
 * Persists the access + refresh tokens and returns {access, refresh, user}.
 */
export async function verifyOtp(session_token, otp) {
  const res = await fetch(`${API_BASE}/auth/verify-otp/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_token, otp }),
  })
  const data = await handleResponse(res)
  if (data?.access) localStorage.setItem(ACCESS_TOKEN_KEY, data.access)
  if (data?.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh)
  return data
}

/** GET /api/auth/me/ — the currently authenticated user. */
export async function getMe() {
  const res = await fetch(`${API_BASE}/auth/me/`, { headers: getAuthHeaders() })
  return handleResponse(res)
}

/**
 * POST /api/auth/refresh/ — swap the stored refresh token for a fresh access
 * token, persisting the new access token.
 */
export async function refreshToken() {
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY)
  const res = await fetch(`${API_BASE}/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  const data = await handleResponse(res)
  if (data?.access) localStorage.setItem(ACCESS_TOKEN_KEY, data.access)
  return data
}

/** Clear both tokens from localStorage. */
export function logout() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}
