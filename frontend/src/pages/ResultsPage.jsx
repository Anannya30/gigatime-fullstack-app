import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, FileText, Trash2 } from 'lucide-react'
import TileProgressBar from '../components/TileProgressBar'
import StatusBadge from '../components/StatusBadge'
import { getSlideResults } from '../api/slidesApi'
import { SLIDE_STATUS, PAGES } from '../utils/constants'
import { cn, isStoppable, statusLabel } from '../utils/helpers'

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5A7B72] dark:text-brand-light'

// Static reference metadata per analysis channel: cell-type label + report group.
const MARKER_META = {
  DAPI: { label: 'Nuclear marker', category: 'Structural' },
  CD11c: { label: 'Dendritic cells', category: 'Immune Cells' },
  'PD-L1': { label: 'Checkpoint ligand', category: 'Cancer Markers' },
  CK: { label: 'Epithelial lineage', category: 'Cancer Markers' },
  CD16: { label: 'NK / neutrophils', category: 'Immune Cells' },
  CD68: { label: 'Macrophages', category: 'Immune Cells' },
  CD138: { label: 'Plasma cells', category: 'Immune Cells' },
  CD4: { label: 'Helper T cells', category: 'Immune Cells' },
  'PHH3-B': { label: 'Mitotic spindle', category: 'Cell Death' },
  CD3: { label: 'All T cells', category: 'Immune Cells' },
  Ki67: { label: 'Proliferation index', category: 'Cancer Markers' },
  CD34: { label: 'Vascular / endothelium', category: 'Cancer Markers' },
  'T-bet': { label: 'NK / T-cell lineage', category: 'Other' },
  'Actin-D': { label: 'Myofibroblast', category: 'Structural' },
  CD14: { label: 'Monocytes', category: 'Immune Cells' },
  CD8: { label: 'Cytotoxic T cells', category: 'Immune Cells' },
  'Caspase3-D': { label: 'Apoptosis', category: 'Cell Death' },
  'PD-1': { label: 'Checkpoint receptor', category: 'Other' },
  Transgelin: { label: 'Fibroblast / smooth muscle', category: 'Structural' },
  Tryptase: { label: 'Mast cells', category: 'Other' },
  CD20: { label: 'B cells', category: 'Immune Cells' },
}

// Marker-channel ordering within each subsection (matches the report layout).
const GROUP_ORDER = ['Immune Cells', 'Cancer Markers', 'Cell Death', 'Structural', 'Other']
const MARKER_ORDER = ['CD3', 'CD4', 'CD8', 'CD11c', 'CD14', 'CD16', 'CD20', 'CD68', 'CD138', 'CK', 'PD-L1', 'CD34', 'Ki67', 'Caspase3-D', 'PHH3-B', 'DAPI', 'Actin-D', 'Transgelin', 'PD-1', 'T-bet', 'Tryptase']

// Bar fill + confidence-tag color by tier (green = high, gold-brown = moderate, muted = low).
const TIER_BAR = { HIGH: '#406E5E', MODERATE: '#987B37', LOW: '#C9BFA6' }
const TIER_TAG = { HIGH: 'text-[#406E5E]', MODERATE: 'text-[#B5860D]', LOW: 'text-[#C0522A]' }

/** Confidence tier from the raw sigmoid confidence score (0.0–1.0). */
function confidenceTier(score) {
  if (score == null) return 'LOW'
  if (score > 0.7) return 'HIGH'
  if (score >= 0.4) return 'MODERATE'
  return 'LOW'
}

/** Strip a file extension for use as a download stem (slide1.svs → slide1). */
function stripExt(name) {
  return (name || 'slide').replace(/\.[^.]+$/, '')
}

/**
 * Build a plain-text marker-positivity report: a header with the slide name +
 * status, then a fixed-width table of every marker and its positive-pixel %
 * (with cell type and confidence tier), ordered to match the on-screen layout.
 */
function buildMarkerReport(slide, markers) {
  const ordered = [...markers].sort(
    (a, b) => MARKER_ORDER.indexOf(a.marker) - MARKER_ORDER.indexOf(b.marker)
  )
  const COLS = [
    { head: 'Marker', width: 12, get: (m) => m.marker },
    { head: 'Cell Type', width: 26, get: (m) => m.label || '—' },
    { head: 'Positive %', width: 12, get: (m) => (m.positive_pixel_pct == null ? 'N/A' : `${m.positive_pixel_pct.toFixed(2)}%`) },
    {
      head: 'Confidence',
      width: 18,
      get: (m) =>
        `${confidenceTier(m.confidence_score)} (R${m.confidence_score != null ? m.confidence_score.toFixed(2) : '—'})`,
    },
  ]
  const row = (cells) => cells.map((c, i) => String(c).padEnd(COLS[i].width)).join('  ').trimEnd()
  const sep = COLS.map((c) => '-'.repeat(c.width)).join('  ')

  const lines = [
    'biostack-mIF — Marker Positivity Report',
    'RESEARCH USE ONLY — NOT FOR CLINICAL DIAGNOSIS',
    '',
    `Slide:     ${slide.filename}`,
    `Status:    ${statusLabel(slide.status)}`,
    `Markers:   ${ordered.length}`,
    '',
    row(COLS.map((c) => c.head)),
    sep,
    ...ordered.map((m) => row(COLS.map((c) => c.get(m)))),
    '',
    'Positive % = share of tissue pixels predicted positive for the marker.',
    'Confidence R = mean sigmoid probability over positive pixels per channel.',
  ]
  return lines.join('\n')
}

/** One predicted protein channel — the hero row. Percentage value is dominant. */
function MarkerRow({ marker }) {
  const tier = confidenceTier(marker.confidence_score)
  const value = marker.positive_pixel_pct
  const barW = value == null ? 0 : Math.min(100, value)
  return (
    <div className="grid grid-cols-[130px_minmax(60px,1fr)_92px_104px] items-center gap-x-5 border-b border-[#DDD6C6] py-3.5 dark:border-gray-800">
      <div className="min-w-0">
        <div className="font-serif text-base font-bold leading-tight text-[#42433E] dark:text-gray-100">{marker.marker}</div>
        <div className="mt-0.5 text-xs text-[#928E82]">{marker.label}</div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0EBDB] dark:bg-gray-700">
        <div className="h-full rounded-full" style={{ width: `max(${barW}%, 6px)`, backgroundColor: TIER_BAR[tier] }} />
      </div>
      <div className="text-right font-sans text-[22px] font-bold tabular-nums text-[#42433E] dark:text-white">
        {value == null ? 'N/A' : `${value.toFixed(2)}%`}
      </div>
      <div className={cn('text-right text-[11px] font-semibold uppercase tracking-wide', TIER_TAG[tier])}>
        {tier} · R{marker.confidence_score != null ? marker.confidence_score.toFixed(2) : '—'}
      </div>
    </div>
  )
}

export default function ResultsPage({ slide, onNavigate, onToast, onStop, onDelete }) {
  const [procOpen, setProcOpen] = useState(false)
  const [markerTable, setMarkerTable] = useState(null)
  const [resultsError, setResultsError] = useState(null)

  // Load the real marker table once the slide has finished inference.
  useEffect(() => {
    setMarkerTable(null)
    setResultsError(null)
    if (!slide || slide.status !== SLIDE_STATUS.SUCCEEDED) return
    let active = true
    ;(async () => {
      try {
        const data = await getSlideResults(slide.id)
        if (active) setMarkerTable(data?.marker_table || [])
      } catch (e) {
        if (active) setResultsError(e.message || 'Results unavailable')
      }
    })()
    return () => {
      active = false
    }
  }, [slide])

  // Join the marker table with static cell-type/group metadata for rendering.
  const markers = useMemo(
    () =>
      (markerTable || []).map((m) => ({
        ...m,
        label: MARKER_META[m.marker]?.label || '',
        category: MARKER_META[m.marker]?.category || 'Other',
      })),
    [markerTable]
  )

  if (!slide) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center animate-fade-in">
        <h1 className="font-serif text-2xl font-bold text-[#42433E] dark:text-white">No slide selected</h1>
        <p className="mt-2 text-sm text-[#928E82]">Choose a slide from your history to view its virtual mIF results.</p>
        <button type="button" onClick={() => onNavigate(PAGES.HISTORY)} className="btn-primary mt-5">Go to My Slides</button>
      </div>
    )
  }

  const isRunning = slide.status === SLIDE_STATUS.RUNNING
  const isDone = slide.status === SLIDE_STATUS.SUCCEEDED
  // Export the marker table as an auto-downloaded plain-text report.
  const handleExport = () => {
    if (!markers.length) {
      onToast?.('Marker results are not ready yet')
      return
    }
    const text = buildMarkerReport(slide, markers)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${stripExt(slide.filename)}_markers.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    onToast?.('Marker report — download started')
  }
  const statusLine = slide.errorMessage || slide.progress?.stage || statusLabel(slide.status)

  const histology = slide.histology || slide.notes || ''
  const proc = slide.duration ? `${Math.round(slide.duration / 60)} min` : null
  const metaParts = [slide.patientId || slide.cohortId, [slide.cancerType, histology].filter(Boolean).join(' · '), slide.tissueOrigin, proc].filter(Boolean)

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-10">
      {/* 1 — Slide Profile header */}
      <div className="border-b border-[#B8AE98] pb-5 dark:border-gray-700">
        <p className={EYEBROW}>Slide Profile</p>
        <h1 className="mt-1.5 break-words font-serif text-[34px] font-bold leading-tight text-[#42433E] dark:text-white">{slide.filename}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-1.5 text-sm text-[#928E82]">
          {metaParts.map((part, i) => <span key={i}>{part}</span>)}
          <StatusBadge status={slide.status} variant="dot" />
          {onStop && isStoppable(slide.status) && (
            <button type="button" onClick={() => onStop(slide)} className="inline-flex items-center gap-1.5 rounded-[5px] border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/5 dark:text-red-400">
              Stop processing
            </button>
          )}
        </div>
      </div>

      {/* 2 — Predicted marker channels (the hero) */}
      <div>
        <p className={EYEBROW}>Predicted Marker Channels · 21</p>
        {!isDone ? (
          isRunning && slide.progress ? (
            <div className="mt-4 max-w-md">
              <TileProgressBar progress={slide.progress} />
              <p className="mt-3 text-sm italic text-[#928E82]">Streaming inference — marker channels appear when analysis completes.</p>
            </div>
          ) : (
            <p className="mt-4 text-sm italic text-[#928E82]">Marker channels are available once analysis completes.</p>
          )
        ) : resultsError ? (
          <p className="mt-4 text-sm italic text-red-600 dark:text-red-400">{resultsError}</p>
        ) : markerTable == null ? (
          <p className="mt-4 text-sm italic text-[#928E82]">Loading marker channels…</p>
        ) : (
          <div className="mt-4">
            {GROUP_ORDER.map((group) => {
              const rows = markers
                .filter((m) => m.category === group)
                .sort((a, b) => MARKER_ORDER.indexOf(a.marker) - MARKER_ORDER.indexOf(b.marker))
              if (!rows.length) return null
              return (
                <div key={group} className="mt-7 first:mt-0">
                  <h3 className="border-t border-[#DDD6C6] pt-4 font-serif text-lg font-bold text-[#42433E] dark:border-gray-800 dark:text-gray-100">{group}</h3>
                  <div className="mt-1">
                    {rows.map((m) => <MarkerRow key={m.marker} marker={m} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 3 — Actions. Export stays disabled until inference completes. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={!isDone}
          title={isDone ? undefined : 'Available once processing completes'}
          className={cn(
            'inline-flex items-center gap-2 rounded-[5px] border border-[#4E6659] bg-transparent px-5 py-2.5 text-sm font-semibold text-[#4E6659] transition-colors dark:text-brand-light',
            isDone ? 'hover:bg-[#4E6659]/5 dark:hover:bg-brand/10' : 'cursor-not-allowed opacity-50'
          )}
        >
          <FileText className="h-4 w-4" />
          Export report
        </button>
        {onDelete && (
          <button type="button" onClick={() => onDelete(slide)} className="inline-flex items-center gap-2 rounded-[5px] border border-gray-300 bg-transparent px-5 py-2.5 text-sm font-semibold text-gray-500 transition-colors hover:border-red-400 hover:text-red-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-red-500/60 dark:hover:text-red-400">
            <Trash2 className="h-4 w-4" />
            Delete slide
          </button>
        )}
      </div>

      {/* 4 — Footer disclaimer */}
      <p className="border-t border-[#DDD6C6] pt-5 text-sm italic leading-relaxed text-[#928E82] dark:border-gray-800">
        Virtual mIF predicted from H&amp;E (NestedUNet, 21 channels). Confidence R is the mean sigmoid probability over positive pixels per channel. Research Use Only &mdash; not for clinical diagnosis. Confirm decision-relevant markers with an orthogonal clinical assay on this patient.
      </p>
    </div>
  )
}
