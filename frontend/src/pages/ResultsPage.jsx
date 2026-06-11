import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Download, FileText } from 'lucide-react'
import ProgressCard from '../components/ProgressCard'
import StatusBadge from '../components/StatusBadge'
import { getSlideResults, downloadTiff } from '../api/slidesApi'
import { SLIDE_STATUS, PAGES } from '../utils/constants'
import { cn, statusLabel } from '../utils/helpers'

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

export default function ResultsPage({ slide, onNavigate, onToast }) {
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
  const mockDownload = (what) => onToast?.(`${what} — download started (mock)`)
  const handleDownloadTiff = async () => {
    try {
      await downloadTiff(slide.id)
      onToast?.('OME-TIFF — download started')
    } catch (e) {
      onToast?.(e.message || 'OME-TIFF not ready yet')
    }
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
        </div>
      </div>

      {/* 2 — Predicted marker channels (the hero) */}
      <div>
        <p className={EYEBROW}>Predicted Marker Channels · 21</p>
        {!isDone ? (
          <p className="mt-4 text-sm italic text-[#928E82]">Marker channels are available once analysis completes.</p>
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

      {/* 3 — Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleDownloadTiff} className="inline-flex items-center gap-2 rounded-[5px] bg-[#3E6B5C] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33594d]">
          <Download className="h-4 w-4" />
          Download OME-TIFF
        </button>
        <button type="button" onClick={() => mockDownload('PDF')} className="inline-flex items-center gap-2 rounded-[5px] border border-[#4E6659] bg-transparent px-5 py-2.5 text-sm font-semibold text-[#4E6659] transition-colors hover:bg-[#4E6659]/5 dark:text-brand-light dark:hover:bg-brand/10">
          <FileText className="h-4 w-4" />
          Export PDF
        </button>
      </div>

      {/* 4 — Footer disclaimer */}
      <p className="border-t border-[#DDD6C6] pt-5 text-sm italic leading-relaxed text-[#928E82] dark:border-gray-800">
        Virtual mIF predicted from H&amp;E (NestedUNet, 21 channels). Confidence R is the mean sigmoid probability over positive pixels per channel. Research Use Only &mdash; not for clinical diagnosis. Confirm decision-relevant markers with an orthogonal clinical assay on this patient.
      </p>
    </div>
  )
}
