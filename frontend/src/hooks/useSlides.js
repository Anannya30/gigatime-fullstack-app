import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listSlides,
  getSlide,
  updateSlide,
  uploadSlide,
  submitBatchInference,
} from '../api/slidesApi'
import { SLIDE_STATUS } from '../utils/constants'

// Backend status (CREATED/QUEUED/RUNNING/COMPLETED/FAILED) → frontend label so
// the existing components (StatusBadge, filters, comparisons) keep working.
const STATUS_MAP = {
  CREATED: SLIDE_STATUS.CREATED,
  QUEUED: SLIDE_STATUS.QUEUED,
  RUNNING: SLIDE_STATUS.RUNNING,
  COMPLETED: SLIDE_STATUS.SUCCEEDED,
  FAILED: SLIDE_STATUS.FAILED,
}

// Statuses still in flight on the backend — poll these.
const ACTIVE_BACKEND = new Set(['CREATED', 'QUEUED', 'RUNNING'])

function durationSeconds(started, completed) {
  if (!started || !completed) return null
  const secs = (new Date(completed).getTime() - new Date(started).getTime()) / 1000
  return Number.isFinite(secs) && secs >= 0 ? Math.round(secs) : null
}

function formatOf(filename) {
  const ext = filename?.split('.').pop()?.toUpperCase()
  return ext || null
}

/** Map a backend Slide payload to the camelCase shape the UI components expect. */
function normalizeSlide(raw) {
  return {
    id: raw.id,
    filename: raw.filename,
    originalFilename: raw.original_filename,
    format: formatOf(raw.filename),
    fileSize: raw.file_size ?? null,
    cancerType: raw.cancer_type || 'Other',
    tissueOrigin: raw.tissue_origin || '',
    cohortId: raw.cohort_id || '',
    notes: raw.notes || '',
    tags: raw.tags || [],
    // Keep the raw backend status around for polling decisions.
    backendStatus: raw.status,
    status: STATUS_MAP[raw.status] || raw.status,
    submittedAt: raw.submitted_at,
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
    duration: durationSeconds(raw.started_at, raw.completed_at),
    errorMessage: raw.error_message || '',
    meanPearson: null,
    progress: null,
  }
}

/**
 * Loads and manages slides through the real Django API (src/api/slidesApi).
 * Polls in-flight slides and refetches when one finishes.
 */
export function useSlides() {
  const [slides, setSlides] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const slidesRef = useRef([])

  const refetch = useCallback(async () => {
    setError(null)
    try {
      const data = await listSlides()
      const normalized = (Array.isArray(data) ? data : []).map(normalizeSlide)
      setSlides(normalized)
      slidesRef.current = normalized
      return normalized
    } catch (e) {
      setError(e.message || 'Failed to load slides')
      return null
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const data = await listSlides()
        if (!active) return
        const normalized = (Array.isArray(data) ? data : []).map(normalizeSlide)
        setSlides(normalized)
        slidesRef.current = normalized
      } catch (e) {
        if (active) setError(e.message || 'Failed to load slides')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // Poll in-flight slides every 5s; when one reaches a terminal state, refetch.
  useEffect(() => {
    const interval = setInterval(async () => {
      const activeIds = slidesRef.current
        .filter((s) => ACTIVE_BACKEND.has(s.backendStatus))
        .map((s) => s.id)
      if (activeIds.length === 0) return

      let anyTerminal = false
      await Promise.all(
        activeIds.map(async (id) => {
          try {
            const updated = normalizeSlide(await getSlide(id))
            if (!ACTIVE_BACKEND.has(updated.backendStatus)) anyTerminal = true
            setSlides((prev) => {
              const next = prev.map((s) =>
                s.id === id && s.backendStatus !== updated.backendStatus ? updated : s
              )
              slidesRef.current = next
              return next
            })
          } catch {
            /* transient poll error — try again next tick */
          }
        })
      )
      if (anyTerminal) refetch()
    }, 5000)
    return () => clearInterval(interval)
  }, [refetch])

  const getSlideById = useCallback(
    (id) => slides.find((s) => s.id === id) || null,
    [slides]
  )

  const updateSlideMeta = useCallback(async (id, patch) => {
    // Optimistic update, then reconcile with the server response.
    setSlides((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      slidesRef.current = next
      return next
    })
    try {
      const updated = normalizeSlide(await updateSlide(id, patch))
      setSlides((prev) => {
        const next = prev.map((s) => (s.id === id ? updated : s))
        slidesRef.current = next
        return next
      })
      return updated
    } catch (e) {
      setError(e.message)
      return null
    }
  }, [])

  const createSlide = useCallback(async (formData) => {
    const created = normalizeSlide(await uploadSlide(formData))
    setSlides((prev) => {
      const next = [created, ...prev]
      slidesRef.current = next
      return next
    })
    // Automatically queue inference for the freshly uploaded slide.
    try {
      await submitBatchInference([created.id])
    } catch (e) {
      setError(e.message)
    }
    return created
  }, [])

  return {
    slides,
    loading,
    error,
    refetch,
    getSlideById,
    updateSlideMeta,
    createSlide,
  }
}
