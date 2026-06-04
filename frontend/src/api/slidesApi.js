/**
 * Data layer — the ONLY place that knows where slide data comes from.
 *
 * Today it resolves against in-memory mock data. To go live, replace the bodies
 * of these functions with `fetch(...)` calls to the Django backend; the exported
 * signatures (and the shapes they resolve to) are designed to stay identical, so
 * no page or component needs to change.
 *
 * Planned backend endpoints:
 *   POST   /api/upload        -> uploadSlide(payload)
 *   GET    /api/slides          -> listSlides()
 *   GET    /api/slides/:id      -> getSlide(id)
 *   PATCH  /api/slides/:id      -> updateSlide(id, patch)
 *   DELETE /api/slides/:id      -> deleteSlide(id)
 */
import { MOCK_SLIDES } from '../data/mockSlides'
import { SLIDE_STATUS } from '../utils/constants'

// Base URL is read from env so the same code works in dev / staging / prod.
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// Simulated network latency so loading/skeleton states are exercised.
const LATENCY = 450
const delay = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms))

// In-memory store (clone so mutations don't leak into the source module).
let store = MOCK_SLIDES.map((j) => ({ ...j }))

function clone(slide) {
  return slide ? JSON.parse(JSON.stringify(slide)) : slide
}

/** GET /api/slides */
export async function listSlides() {
  await delay()
  return store.map(clone)
}

/** GET /api/slides/:id */
export async function getSlide(id) {
  await delay(250)
  const slide = store.find((j) => j.id === id)
  if (!slide) throw new Error(`Slide ${id} not found`)
  return clone(slide)
}

/** PATCH /api/slides/:id — partial update (e.g. metadata / tags). */
export async function updateSlide(id, patch) {
  await delay(250)
  const idx = store.findIndex((j) => j.id === id)
  if (idx === -1) throw new Error(`Slide ${id} not found`)
  store[idx] = { ...store[idx], ...patch }
  return clone(store[idx])
}

/** DELETE /api/slides/:id */
export async function deleteSlide(id) {
  await delay(250)
  store = store.filter((j) => j.id !== id)
  return { ok: true }
}

/**
 * POST /api/upload — create a new slide from an upload payload.
 * Returns the created slide in a `Created` state.
 */
export async function uploadSlide(payload) {
  await delay(600)
  const id = `slide_${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const slide = {
    id,
    filename: payload.filename,
    format: payload.format,
    fileSize: payload.fileSize ?? null,
    cancerType: payload.cancerType ?? 'Other',
    tissueOrigin: payload.tissueOrigin ?? '',
    cohortId: payload.cohortId ?? '',
    notes: payload.notes ?? '',
    tags: payload.tags ?? [],
    status: SLIDE_STATUS.CREATED,
    meanPearson: null,
    submittedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    duration: null,
    quality: payload.quality ?? null,
    progress: { tilesProcessed: 0, totalTiles: 0, stage: 'Created', etaMinutes: null, gpuUtil: 0, tilesPerSec: 0 },
  }
  store = [slide, ...store]
  return clone(slide)
}
