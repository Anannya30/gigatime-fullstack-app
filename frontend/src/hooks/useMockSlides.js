import { useCallback, useEffect, useMemo, useState } from 'react'
import { listSlides, updateSlide, deleteSlide, uploadSlide } from '../api/slidesApi'
import { SLIDE_STATUS } from '../utils/constants'

/**
 * Loads and manages slides through the data layer (src/api/slidesApi).
 * Components never touch the API directly — they use this hook, so swapping
 * mock data for live endpoints is a one-file change.
 */
export function useMockSlides() {
  const [slides, setSlides] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listSlides()
      setSlides(data)
    } catch (e) {
      setError(e.message || 'Failed to load slides')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const data = await listSlides()
        if (active) setSlides(data)
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

  const getSlideById = useCallback((id) => slides.find((j) => j.id === id) || null, [slides])

  const updateSlideMeta = useCallback(async (id, patch) => {
    // optimistic update
    setSlides((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
    try {
      const updated = await updateSlide(id, patch)
      setSlides((prev) => prev.map((j) => (j.id === id ? updated : j)))
      return updated
    } catch (e) {
      setError(e.message)
      return null
    }
  }, [])

  const removeSlide = useCallback(async (id) => {
    setSlides((prev) => prev.filter((j) => j.id !== id))
    await deleteSlide(id)
  }, [])

  const createSlide = useCallback(async (payload) => {
    const created = await uploadSlide(payload)
    setSlides((prev) => [created, ...prev])
    return created
  }, [])

  const stats = useMemo(() => {
    const count = (s) => slides.filter((j) => j.status === s).length
    return {
      total: slides.length,
      completed: count(SLIDE_STATUS.SUCCEEDED),
      running: count(SLIDE_STATUS.RUNNING) + count(SLIDE_STATUS.REQUEUED),
      failed: count(SLIDE_STATUS.FAILED) + count(SLIDE_STATUS.PREEMPTED),
    }
  }, [slides])

  return {
    slides,
    loading,
    error,
    stats,
    refresh,
    getSlideById,
    updateSlideMeta,
    removeSlide,
    createSlide,
  }
}
