/**
 * Data layer — the ONLY place that talks to the Django REST backend for slides.
 *
 * Every request carries `Authorization: Bearer <token>`, where the JWT access
 * token is read from localStorage under `gigatime_access_token`. Non-2xx
 * responses are turned into thrown Errors carrying Django's error message.
 */

// Base URL is read from env so the same code works in dev / staging / prod.
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export const ACCESS_TOKEN_KEY = 'gigatime_access_token'

/** Authorization header (+ any extra headers) for an authenticated request. */
export function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  const headers = { ...extra }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
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
  const res = await fetch(`${API_BASE}/slides/`, { headers: getAuthHeaders() })
  return handleResponse(res)
}

/** GET /api/slides/<id>/ */
export async function getSlide(id) {
  const res = await fetch(`${API_BASE}/slides/${id}/`, { headers: getAuthHeaders() })
  return handleResponse(res)
}

/** POST /api/slides/upload/ — multipart form data (file + metadata). */
export async function uploadSlide(formData) {
  // Note: do NOT set Content-Type — the browser sets the multipart boundary.
  const res = await fetch(`${API_BASE}/slides/upload/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  })
  return handleResponse(res)
}

/** POST /api/slides/batch/ — multipart form data (multiple files + metadata). */
export async function uploadSlideBatch(formData) {
  const res = await fetch(`${API_BASE}/slides/batch/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  })
  return handleResponse(res)
}

/** PATCH /api/slides/<id>/ — partial metadata update. */
export async function updateSlide(id, patch) {
  const res = await fetch(`${API_BASE}/slides/${id}/`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  })
  return handleResponse(res)
}

/** DELETE /api/slides/<id>/ — soft delete. */
export async function deleteSlide(id) {
  const res = await fetch(`${API_BASE}/slides/${id}/`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  return handleResponse(res)
}

/** GET /api/slides/<id>/results/ — marker table once inference is done. */
export async function getSlideResults(id) {
  const res = await fetch(`${API_BASE}/slides/${id}/results/`, {
    headers: getAuthHeaders(),
  })
  return handleResponse(res)
}

/**
 * GET /api/slides/<id>/download-tiff/ — fetch the OME-TIFF as a blob and
 * trigger a browser download via a temporary anchor element.
 */
export async function downloadTiff(id) {
  const res = await fetch(`${API_BASE}/slides/${id}/download-tiff/`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    // Reuse the JSON error handling for non-2xx (e.g. 404 not ready yet).
    return handleResponse(res)
  }
  const blob = await res.blob()
  // Try to honor the server-provided filename, else fall back to a sane default.
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : `${id}_pred.ome.tiff`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return blob
}

/** POST /api/inference/batch/ — queue a batch inference run for slide ids. */
export async function submitBatchInference(slideIds) {
  const res = await fetch(`${API_BASE}/inference/batch/`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ slides: slideIds }),
  })
  return handleResponse(res)
}

/** GET /api/inference/batch/<id>/ — batch + per-slide status. */
export async function getBatchStatus(batchId) {
  const res = await fetch(`${API_BASE}/inference/batch/${batchId}/`, {
    headers: getAuthHeaders(),
  })
  return handleResponse(res)
}
