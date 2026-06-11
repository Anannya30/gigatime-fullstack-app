import { useMemo, useState } from 'react'
import { ChevronDown, Download, FileText } from 'lucide-react'
import ProgressCard from '../components/ProgressCard'
import StatusBadge from '../components/StatusBadge'
import { generateProteinScores } from '../data/mockProteins'
import { SLIDE_STATUS, PAGES } from '../utils/constants'
import { cn, statusLabel, markerConfidence } from '../utils/helpers'

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5A7B72] dark:text-brand-light'

// Marker-channel ordering within each subsection (matches the report layout).
const GROUP_ORDER = ['Immune Cells', 'Cancer Markers', 'Cell Death', 'Structural', 'Other']
const MARKER_ORDER = ['CD3', 'CD4', 'CD8', 'CD11c', 'CD14', 'CD16', 'CD20', 'CD68', 'CD138', 'CK', 'PD-L1', 'CD34', 'Ki67', 'Caspase3-D', 'PHH3-B', 'DAPI', 'Actin-D', 'Transgelin', 'PD-1', 'T-bet', 'Tryptase']

// Bar fill + confidence-tag color by tier (green = high, gold-brown = moderate, muted = low).
const TIER_BAR = { HIGH: '#406E5E', MODERATE: '#987B37', LOW: '#C9BFA6', 'VERY LOW': '#C9BFA6' }
const TIER_TAG = { HIGH: 'text-[#406E5E]', MODERATE: 'text-[#987B37]', LOW: 'text-[#9C854F]', 'VERY LOW': 'text-[#A89F8D]' }
const BADGE = {
  evaluate: 'bg-[#B0C7BF] text-[#2D4A40]',
  suggestive: 'bg-[#E3D8C0] text-[#8A7B5C]',
  hypothesis: 'bg-[#E2DED2] text-[#928E82] dark:bg-gray-700 dark:text-gray-300',
}

const pct1 = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)
const fmtSpatial = (v) => (v == null ? '—' : v < 0.1 ? `${v.toFixed(2)}%` : `${v.toFixed(1)}%`)

/** One predicted protein channel — the hero row. Percentage value is dominant. */
function MarkerRow({ p }) {
  const tier = markerConfidence(p.r)
  const faded = tier === 'VERY LOW' || p.insufficient
  const value = p.insufficient ? null : p.score
  const barW = value == null ? 0 : Math.min(100, value)
  return (
    <div className={cn('grid grid-cols-[130px_minmax(60px,1fr)_92px_104px] items-center gap-x-5 border-b border-[#DDD6C6] py-3.5 dark:border-gray-800', faded && 'opacity-45')}>
      <div className="min-w-0">
        <div className="font-serif text-base font-bold leading-tight text-[#42433E] dark:text-gray-100">{p.name}</div>
        <div className="mt-0.5 text-xs text-[#928E82]">{p.description}</div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0EBDB] dark:bg-gray-700">
        <div className="h-full rounded-full" style={{ width: `max(${barW}%, 6px)`, backgroundColor: TIER_BAR[tier] }} />
      </div>
      <div className="text-right font-sans text-[22px] font-bold tabular-nums text-[#42433E] dark:text-white">
        {value == null ? 'N/A' : `${value.toFixed(2)}%`}
      </div>
      <div className={cn('text-right text-[11px] font-semibold uppercase tracking-wide', TIER_TAG[tier])}>
        {tier} · R{p.r != null ? p.r.toFixed(2) : '—'}
      </div>
    </div>
  )
}

export default function ResultsPage({ slide, onNavigate, onToast }) {
  const [procOpen, setProcOpen] = useState(false)
  const proteins = useMemo(() => (slide ? generateProteinScores(slide.id) : []), [slide])

  // --- Confidence-aware clinical interpretation ----------------------------
  const interp = useMemo(() => {
    const pv = (n) => {
      const p = proteins.find((x) => x.name === n)
      return p && !p.insufficient ? (p.score ?? null) : null
    }
    const rv = (n) => proteins.find((x) => x.name === n)?.r ?? null

    const cd3 = pv('CD3'), cd4 = pv('CD4'), cd8 = pv('CD8'), pdl1 = pv('PD-L1')
    const cd68 = pv('CD68'), casp = pv('Caspase3-D')
    const cd8Conf = markerConfidence(rv('CD8'))
    const pdl1Conf = markerConfidence(rv('PD-L1'))

    const pdl1High = pdl1 != null && pdl1 >= 20
    const pdl1Detected = pdl1 != null && pdl1 >= 5
    const tcellPresent = (cd3 != null && cd3 >= 5) || (cd4 != null && cd4 >= 5)
    const cytotoxicReliable = cd8 != null && cd8 >= 1 && (cd8Conf === 'HIGH' || cd8Conf === 'MODERATE')
    const proliferationAssessable = markerConfidence(rv('Ki67')) !== 'VERY LOW' || markerConfidence(rv('PHH3-B')) !== 'VERY LOW'
    const apoptosisElevated = casp != null && casp >= 10

    const heading = `${cytotoxicReliable ? 'Active immune infiltration' : 'Low immune infiltration'}, ${pdl1High ? 'PD-L1 high' : pdl1Detected ? 'PD-L1 detected' : 'PD-L1 low'}`
    const body = `Whole-slide PD-L1 activation is ${pdl1High ? 'high' : pdl1Detected ? 'present' : 'low'} while cytotoxic T-cell signal is ${cytotoxicReliable ? 'detected' : 'not reliably detected'}. ${apoptosisElevated ? 'Apoptosis elevated' : 'Apoptosis within baseline'}; proliferation ${proliferationAssessable ? 'detectable' : 'not assessable'}.`
    const caveat = 'Whole-slide densities only. Immune-excluded vs immune-desert is not separable without tumour-core vs stromal data, which this model does not produce.'

    const findings = []
    if (pdl1 != null && pdl1High) findings.push(`PD-L1 activation high (${pct1(pdl1)}) on a ${pdl1Conf.toLowerCase()}-confidence channel — relevant to checkpoint pathway, confirm by IHC.`)
    else if (pdl1 != null) findings.push(`PD-L1 ${pdl1Detected ? 'detected' : 'low'} (${pct1(pdl1)}) on a ${pdl1Conf.toLowerCase()}-confidence channel.`)
    if (tcellPresent) findings.push(`T-cell infiltrate present (CD3 ${pct1(cd3)}, CD4 ${pct1(cd4)}) on high-confidence channels.`)
    if (cd8 != null && cd8 < 1) findings.push(`Cytotoxic CD8 reads near-zero but on the model's weakest channel (r=${(rv('CD8') ?? 0).toFixed(2)}) — absence of usable signal, not confirmed absence.`)
    if (!proliferationAssessable) findings.push('Proliferation (Ki67, PHH3) not assessable — lowest-confidence channels in the model.')
    if (apoptosisElevated) findings.push(`Apoptotic activity elevated (Caspase3 ${pct1(casp)}).`)

    const spatial = [
      { label: 'T-cell (CD3)', value: cd3 },
      { label: 'Helper T (CD4)', value: cd4 },
      { label: 'Cytotoxic (CD8)', value: cd8, low: cd8 == null || cd8 < 1 || cd8Conf === 'LOW' || cd8Conf === 'VERY LOW' },
      { label: 'Checkpoint (PD-L1)', value: pdl1 },
      { label: 'Macrophage (CD68)', value: cd68 },
    ]

    const signals = [
      { title: 'Checkpoint Inhibitor candidacy', badge: pdl1High ? 'EVALUATE' : 'HYPOTHESIS', tone: pdl1High ? 'evaluate' : 'hypothesis', note: `PD-L1 activation ${pdl1High ? 'high' : 'low'} (${pct1(pdl1)}); confirm by clinical PD-L1 IHC before acting.` },
      { title: 'Immune Excluded Pattern', badge: 'SUGGESTIVE', tone: 'suggestive', note: `T-cells present (CD3 ${pct1(cd3)}) but cytotoxic CD8 not reliably detected — pattern only, not localisable.` },
      { title: 'Chemo Sensitivity', badge: 'HYPOTHESIS', tone: 'hypothesis', note: 'Proliferation markers (Ki67, PHH3) below reliability floor — cannot be assessed from this slide.' },
      { title: 'Anti-angiogenic Signal', badge: 'HYPOTHESIS', tone: 'hypothesis', note: 'Vascular CD34 low and low-confidence; insufficient basis for an angiogenic read.' },
    ]

    return { heading, body, caveat, findings, spatial, signals }
  }, [proteins])

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
  const mockDownload = (what) => onToast?.(`${what} — download started (mock)`)
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

      {/* 2 — Two-column interpretation */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.55fr_1fr]">
        {/* Left — phenotype + key findings */}
        <div>
          <p className={EYEBROW}>Tumour Immune Phenotype</p>
          <h2 className="mt-2 font-serif text-[24px] font-bold leading-snug text-[#42433E] dark:text-white">{interp.heading}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#42433E] dark:text-gray-300">{interp.body}</p>
          <p className="mt-3 text-sm italic leading-relaxed text-[#928E82]">{interp.caveat}</p>

          <p className={cn(EYEBROW, 'mt-8')}>Key Findings</p>
          <div className="mt-2">
            {interp.findings.map((f, i) => (
              <div key={i} className="flex gap-2.5 border-b border-[#DDD6C6] py-3.5 text-[15px] leading-relaxed text-[#42433E] dark:border-gray-800 dark:text-gray-300">
                <span className="text-[#928E82]">—</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — spatial readout + treatment signals */}
        <div>
          <h3 className="font-serif text-lg font-bold text-[#42433E] dark:text-white">Spatial immune readout</h3>
          <div className="mt-2">
            {interp.spatial.map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-[#DDD6C6] py-3 dark:border-gray-800">
                <span className="text-sm text-[#42433E] dark:text-gray-300">
                  {row.label}{row.low && <span className="text-[#928E82]"> · low</span>}
                </span>
                <span className="text-base font-bold tabular-nums text-[#406E5E] dark:text-brand-light">{fmtSpatial(row.value)}</span>
              </div>
            ))}
          </div>

          <h3 className="mt-8 font-serif text-lg font-bold text-[#42433E] dark:text-white">Treatment pathway signals</h3>
          <div className="mt-1 divide-y divide-[#DDD6C6] dark:divide-gray-800">
            {interp.signals.map((s) => (
              <div key={s.title} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-serif text-base font-bold leading-snug text-[#42433E] dark:text-white">{s.title}</h4>
                  <span className={cn('mt-0.5 shrink-0 rounded-[4px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', BADGE[s.tone])}>{s.badge}</span>
                </div>
                <p className="mt-1.5 text-sm italic leading-relaxed text-[#928E82]">{s.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3 — Predicted marker channels (the hero) */}
      <div>
        <p className={EYEBROW}>Predicted Marker Channels · 21</p>
        <div className="mt-4">
          {GROUP_ORDER.map((group) => {
            const rows = proteins
              .filter((p) => p.category === group)
              .sort((a, b) => MARKER_ORDER.indexOf(a.name) - MARKER_ORDER.indexOf(b.name))
            if (!rows.length) return null
            return (
              <div key={group} className="mt-7 first:mt-0">
                <h3 className="border-t border-[#DDD6C6] pt-4 font-serif text-lg font-bold text-[#42433E] dark:border-gray-800 dark:text-gray-100">{group}</h3>
                <div className="mt-1">
                  {rows.map((p) => <MarkerRow key={p.name} p={p} />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 4 — Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => mockDownload('OME-TIFF')} className="inline-flex items-center gap-2 rounded-[5px] bg-[#3E6B5C] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33594d]">
          <Download className="h-4 w-4" />
          Download OME-TIFF
        </button>
        <button type="button" onClick={() => mockDownload('PDF')} className="inline-flex items-center gap-2 rounded-[5px] border border-[#4E6659] bg-transparent px-5 py-2.5 text-sm font-semibold text-[#4E6659] transition-colors hover:bg-[#4E6659]/5 dark:text-brand-light dark:hover:bg-brand/10">
          <FileText className="h-4 w-4" />
          Export PDF
        </button>
      </div>

      {/* 5 — Footer disclaimer */}
      <p className="border-t border-[#DDD6C6] pt-5 text-sm italic leading-relaxed text-[#928E82] dark:border-gray-800">
        Virtual mIF predicted from H&amp;E (NestedUNet, 21 channels). Confidence r is the held-out validation correlation per channel, identical across patients. Research Use Only &mdash; not for clinical diagnosis. Confirm decision-relevant markers with an orthogonal clinical assay on this patient.
      </p>

      {/* 6 — Processing details */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <StatusBadge status={slide.status} variant="dot" />
            <span className={cn('truncate text-sm', slide.errorMessage ? 'text-red-600 dark:text-red-400' : 'text-[#928E82]')}>{statusLine}</span>
          </div>
          <button type="button" onClick={() => setProcOpen((o) => !o)} aria-expanded={procOpen} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:text-brand-dark">
            Processing details
            <ChevronDown className={cn('h-4 w-4 transition-transform', procOpen && 'rotate-180')} />
          </button>
        </div>
        {procOpen && (
          <div className="border-t border-paper-line p-5 dark:border-gray-800">
            <ProgressCard progress={slide.progress} live={isRunning} />
          </div>
        )}
      </div>
    </div>
  )
}
