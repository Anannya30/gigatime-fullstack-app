import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listSlides,
  getSlide,
  updateSlide,
  uploadSlide,
  submitBatchInference,
  stopSlide as apiStopSlide,
  deleteSlide as apiDeleteSlide,
} from '../api/slidesApi'
import { SLIDE_STATUS } from '../utils/constants'

// Backend status (CREATED/QUEUED/RUNNING/COMPLETED/FAILED/CANCELLED) → frontend
// label so the existing components (StatusBadge, filters, comparisons) keep
// working.
const STATUS_MAP = {
  CREATED: SLIDE_STATUS.CREATED,
  QUEUED: SLIDE_STATUS.QUEUED,
  RUNNING: SLIDE_STATUS.RUNNING,
  COMPLETED: SLIDE_STATUS.SUCCEEDED,
  FAILED: SLIDE_STATUS.FAILED,
  CANCELLED: SLIDE_STATUS.CANCELLED,
}

// How many times the initial load retries a failed fetch before surfacing an
// error — covers the backend still booting right after `docker compose up`.
const INITIAL_LOAD_RETRIES = 3

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

/** Build the live tiles-processed progress object from a backend Slide payload,
 *  or null when the slide hasn't been planned yet (tiles_total unknown). */
function progressFrom(raw) {
  const total = raw.tiles_total
  if (!total || total <= 0) return null
  const done = raw.tiles_done ?? 0
  return {
    tilesDone: done,
    tilesTotal: total,
    pct: Math.min(100, Math.round((done / total) * 100)),
  }
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
    progress: progressFrom(raw),
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

  // Initial load with bounded retry+backoff: a single failed fetch on mount
  // (e.g. the backend still booting after a restart) used to leave the list
  // permanently empty. Retry a few times before surfacing an error so it
  // self-heals instead of showing a misleading "No slides yet".
  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      for (let attempt = 0; active; attempt++) {
        try {
          const data = await listSlides()
          if (!active) return
          const normalized = (Array.isArray(data) ? data : []).map(normalizeSlide)
          setSlides(normalized)
          slidesRef.current = normalized
          setError(null)
          break
        } catch (e) {
          if (attempt >= INITIAL_LOAD_RETRIES) {
            if (active) setError(e.message || 'Failed to load slides')
            break
          }
          // 0.5s, 1s, 2s backoff.
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
        }
      }
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  // Re-pull the list when the tab regains focus, so a stale view (e.g. after a
  // backend restart or sleep) reconciles without a manual reload. refetch keeps
  // the existing slides on a transient failure, so this never blanks the UI.
  useEffect(() => {
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refetch])

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
              const next = prev.map((s) => {
                if (s.id !== id) return s
                // Swap in the fresh row when the status changed OR the
                // tiles-processed progress advanced, so the bar keeps moving
                // even while the slide stays RUNNING.
                const changed =
                  s.backendStatus !== updated.backendStatus ||
                  s.progress?.tilesDone !== updated.progress?.tilesDone ||
                  s.progress?.tilesTotal !== updated.progress?.tilesTotal
                return changed ? updated : s
              })
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

  // Live progress push from the WebSocket (slide.progress events). Merges the
  // tiles-processed counts onto the matching slide without a network round-trip.
  const applyProgress = useCallback((slideId, progress) => {
    setSlides((prev) => {
      let touched = false
      const next = prev.map((s) => {
        if (s.id !== slideId) return s
        touched = true
        return { ...s, progress }
      })
      if (!touched) return prev
      slidesRef.current = next
      return next
    })
  }, [])

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

  // Request cancellation of an in-flight slide. The backend flips it to
  // CANCELLED immediately (and signals any running worker to abort), so we
  // swap the returned row straight into state.
  const stopSlide = useCallback(async (id) => {
    try {
      const updated = normalizeSlide(await apiStopSlide(id))
      setSlides((prev) => {
        const next = prev.map((s) => (s.id === id ? updated : s))
        slidesRef.current = next
        return next
      })
      return updated
    } catch (e) {
      setError(e.message || 'Failed to stop slide')
      return null
    }
  }, [])

  // Soft-delete: the backend keeps the row, source file and results and only
  // sets is_deleted=True, so the slide just stops appearing in the list. We
  // drop it from local state so it disappears without a refetch.
  const deleteSlide = useCallback(async (id) => {
    try {
      await apiDeleteSlide(id)
      setSlides((prev) => {
        const next = prev.filter((s) => s.id !== id)
        slidesRef.current = next
        return next
      })
      return true
    } catch (e) {
      setError(e.message || 'Failed to remove slide')
      return false
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
    stopSlide,
    deleteSlide,
    applyProgress,
  }
}
