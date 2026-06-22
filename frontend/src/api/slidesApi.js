/**
 * Data layer — the ONLY place that talks to the Django REST backend for slides.
 *
 * Every authenticated request goes through `authFetch`, which attaches
 * `Authorization: Bearer <token>` (access JWT from localStorage under
 * `gigatime_access_token`) and, on a 401, transparently refreshes the token
 * once and retries — so an expired access token self-heals instead of silently
 * emptying the UI. Non-2xx responses are turned into thrown Errors carrying
 * Django's error message.
 */

// Base URL is read from env so the same code works in dev / staging / prod.
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export const ACCESS_TOKEN_KEY = 'gigatime_access_token'
// Kept local (not imported from authApi) to avoid a circular import — authApi
// already depends on this module.
const REFRESH_TOKEN_KEY = 'gigatime_refresh_token'

/** Authorization header (+ any extra headers) for an authenticated request. */
export function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  const headers = { ...extra }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

// Single-flight refresh: concurrent 401s collapse into one /auth/refresh/ call.
let refreshInFlight = null

async function refreshAccessToken() {
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refresh) return null
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
      .then(async (r) => {
        if (!r.ok) return null
        const data = await r.json().catch(() => null)
        if (data?.access) {
          localStorage.setItem(ACCESS_TOKEN_KEY, data.access)
          return data.access
        }
        return null
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

/**
 * Authenticated fetch against the API. Prepends API_BASE, attaches the bearer
 * token, and on a 401 refreshes the access token once and retries the request.
 */
export async function authFetch(path, opts = {}, _retried = false) {
  const { headers, ...rest } = opts
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: getAuthHeaders(headers || {}),
  })
  if (res.status === 401 && !_retried) {
    const fresh = await refreshAccessToken()
    if (fresh) return authFetch(path, opts, true)
  }
  return res
}

/** Resolve a fetch Response, throwing the Django error message on non-2xx. */
export async function handleResponse(res) {
  if (res.status === 204) return null
  const text = await res.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    let message = res.statusText || 'Request failed'
    if (body && typeof body === 'object') {
      // DRF errors come back as {detail: ...} or {field: [..]} maps.
      message =
        body.detail ||
        Object.values(body)
          .flat()
          .filter(Boolean)
          .join(' ') ||
        message
    } else if (typeof body === 'string' && body) {
      message = body
    }
    throw new Error(message)
  }
  return body
}

/** GET /api/slides/ */
export async function listSlides() {
  return handleResponse(await authFetch('/slides/'))
}

/** GET /api/slides/<id>/ */
export async function getSlide(id) {
  return handleResponse(await authFetch(`/slides/${id}/`))
}

/** POST /api/slides/upload/ — multipart form data (file + metadata). */
export async function uploadSlide(formData) {
  // Note: do NOT set Content-Type — the browser sets the multipart boundary.
  return handleResponse(
    await authFetch('/slides/upload/', { method: 'POST', body: formData })
  )
}

/** POST /api/slides/batch/ — multipart form data (multiple files + metadata). */
export async function uploadSlideBatch(formData) {
  return handleResponse(
    await authFetch('/slides/batch/', { method: 'POST', body: formData })
  )
}

/** PATCH /api/slides/<id>/ — partial metadata update. */
export async function updateSlide(id, patch) {
  return handleResponse(
    await authFetch(`/slides/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  )
}

/** DELETE /api/slides/<id>/ — soft delete. */
export async function deleteSlide(id) {
  return handleResponse(await authFetch(`/slides/${id}/`, { method: 'DELETE' }))
}

/** POST /api/slides/<id>/stop/ — cancel an in-flight (queued/running) slide. */
export async function stopSlide(id) {
  return handleResponse(
    await authFetch(`/slides/${id}/stop/`, { method: 'POST' })
  )
}

/** GET /api/slides/<id>/results/ — marker table once inference is done. */
export async function getSlideResults(id) {
  return handleResponse(await authFetch(`/slides/${id}/results/`))
}

/** POST /api/inference/batch/ — queue a batch inference run for slide ids. */
export async function submitBatchInference(slideIds) {
  return handleResponse(
    await authFetch('/inference/batch/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: slideIds }),
    })
  )
}

/** GET /api/inference/batch/<id>/ — batch + per-slide status. */
export async function getBatchStatus(batchId) {
  return handleResponse(await authFetch(`/inference/batch/${batchId}/`))
}
