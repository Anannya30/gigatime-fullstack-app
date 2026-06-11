import { useEffect, useMemo, useState } from 'react'
import { Check, Download, X, ShieldCheck, Dna, Pill } from 'lucide-react'
import ComparisonChart from '../components/ComparisonChart'
import { getSlideResults } from '../api/slidesApi'
import { SLIDE_STATUS } from '../utils/constants'
import { cn } from '../utils/helpers'

// --- Comparative-insight helpers -------------------------------------------
const valOf = (c, name) => {
  const s = c.scores.find((x) => x.name === name)
  return s ? (s.score ?? 0) : 0
}

const BADGE_TONE = {
  green: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

/** Treatment-signal pills for a single slide, shown/hidden by its marker values. */
function slideBadges(c) {
  const pdl1 = valOf(c, 'PD-L1')
  const pd1 = valOf(c, 'PD-1')
  const cd8 = valOf(c, 'CD8')
  const ki67 = valOf(c, 'Ki67')
  const cd34 = valOf(c, 'CD34')
  const out = []
  if (pdl1 > 5 && pd1 > 0) out.push({ label: 'Checkpoint Inhibitor — Evaluate', tone: 'green' })
  if (pdl1 > 5 && cd8 < 2) out.push({ label: 'Immune Excluded Pattern', tone: 'orange' })
  if (ki67 < 5) out.push({ label: 'Low Chemo Sensitivity', tone: 'red' })
  if (cd34 < 1) out.push({ label: 'Anti-angiogenic — Low Signal', tone: 'gray' })
  return out
}

/**
 * Rule-based clinical narrative comparing the selected slides. Each bullet
 * follows pattern → meaning → treatment implication and never restates numbers.
 */
function buildInsights(compareSlides) {
  const two = compareSlides.length === 2
  const groupWord = two ? 'both slides' : 'the selected slides'
  const groupCap = two ? 'Both slides' : 'The selected slides'
  const eitherWord = two ? "either tumor's" : "these tumors'"

  const immuneScore = (c) =>
    valOf(c, 'CD3') + valOf(c, 'CD4') + valOf(c, 'CD8') + valOf(c, 'CD68') + valOf(c, 'CD14') + valOf(c, 'CD11c')

  const byImmune = [...compareSlides].sort((a, b) => immuneScore(b) - immuneScore(a))
  const topImmune = byImmune[0]
  const lowImmune = byImmune[byImmune.length - 1]
  const immuneGap = immuneScore(topImmune) - immuneScore(lowImmune)

  const byApop = [...compareSlides].sort((a, b) => valOf(b, 'Caspase3-D') - valOf(a, 'Caspase3-D'))
  const topApop = byApop[0]
  const apopGap = valOf(byApop[0], 'Caspase3-D') - valOf(byApop[byApop.length - 1], 'Caspase3-D')

  const topEpith = [...compareSlides].sort((a, b) => valOf(b, 'CK') - valOf(a, 'CK'))[0]
  const topMast = [...compareSlides].sort((a, b) => valOf(b, 'Tryptase') - valOf(a, 'Tryptase'))[0]
  const isExcluded = (c) => valOf(c, 'PD-L1') > 5 && valOf(c, 'CD8') < 2
  const excluded = isExcluded(lowImmune) ? lowImmune : compareSlides.find(isExcluded)

  const immune = []
  if (immuneGap > 12)
    immune.push(
      `${topImmune.label} shows markedly stronger T-cell and macrophage infiltration compared to ${lowImmune.label}, suggesting a more immunologically active microenvironment — this profile may be more responsive to checkpoint inhibitor monotherapy.`
    )
  if (excluded)
    immune.push(
      `${excluded.label}'s sparse cytotoxic T-cell presence despite detectable PD-L1 is characteristic of an immune-excluded tumor — single-agent immunotherapy may have limited efficacy, and combination strategies to promote immune cell recruitment should be considered.`
    )
  if (valOf(topMast, 'Tryptase') > 5)
    immune.push(
      `Elevated mast cell markers in ${topMast.label} suggest an inflammatory stromal component that may influence immune checkpoint therapy response.`
    )
  if (compareSlides.every((c) => valOf(c, 'CD20') < 5))
    immune.push(
      `Minimal B-cell presence across ${groupWord} suggests humoral immunity may play a limited role in ${eitherWord} microenvironment.`
    )

  const tumor = []
  if (apopGap > 8)
    tumor.push(
      `${topApop.label}'s substantially higher apoptosis marker expression suggests widespread programmed cell death — this may indicate the tumor is under active immune or therapeutic stress, or undergoing stress-induced apoptosis independent of treatment.`
    )
  if (valOf(topEpith, 'CK') > 8 && valOf(topEpith, 'Ki67') < 5)
    tumor.push(
      `${topEpith.label}'s stronger epithelial marker expression with low proliferative activity is consistent with a slow-growing carcinoma — aggressive cytotoxic chemotherapy is unlikely to provide meaningful benefit given the low cell division rate.`
    )
  if (compareSlides.every((c) => valOf(c, 'CD34') < 2))
    tumor.push(
      `Negligible new blood vessel formation markers across ${groupWord} suggest anti-angiogenic agents such as Bevacizumab are unlikely to provide meaningful benefit for ${two ? 'either tumor' : 'these tumors'}.`
    )
  if (two && apopGap > 8)
    tumor.push(
      `The contrast in cell death activity between the slides may reflect fundamentally different tumor stress responses and should be considered when selecting therapeutic strategy.`
    )

  const treatment = []
  if (immuneGap > 12)
    treatment.push(
      `${topImmune.label}'s immune-active profile presents a stronger case for immunotherapy evaluation compared to ${lowImmune.label}'s excluded pattern.`
    )
  if (compareSlides.every((c) => valOf(c, 'Ki67') < 5))
    treatment.push(
      `${groupCap} show low proliferative activity, suggesting limited chemotherapy sensitivity — targeted or immunological approaches warrant priority consideration.`
    )
  if (two)
    treatment.push(
      `The divergent immune environments between these slides may reflect different cancer subtypes or disease stages despite similar tissue origins.`
    )

  return { immune, tumor, treatment }
}

function InsightBullet({ tone, children }) {
  const dot = { blue: 'bg-blue-500', orange: 'bg-orange-500', green: 'bg-brand' }[tone]
  return (
    <li className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
      <span>{children}</span>
    </li>
  )
}

export default function ComparisonPage({ slides, initialSelection = [], onToast }) {
  const available = slides.filter((j) => j.status === SLIDE_STATUS.SUCCEEDED)
  const [selected, setSelected] = useState(initialSelection.slice(0, 3))
  // Real marker tables keyed by slide id, fetched on demand.
  const [resultsMap, setResultsMap] = useState({})

  function toggle(id) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]))
  }

  // Fetch the marker table for any newly selected slide via getSlideResults().
  useEffect(() => {
    selected.forEach((id) => {
      if (resultsMap[id] !== undefined) return
      getSlideResults(id)
        .then((res) => setResultsMap((prev) => ({ ...prev, [id]: res?.marker_table || [] })))
        .catch(() => setResultsMap((prev) => ({ ...prev, [id]: [] })))
    })
  }, [selected, resultsMap])

  const compareSlides = useMemo(
    () =>
      selected
        .map((id) => available.find((j) => j.id === id))
        .filter(Boolean)
        .filter((j) => resultsMap[j.id] !== undefined)
        .map((j) => ({
          id: j.id,
          label: j.filename.replace(/\.[^.]+$/, '').slice(0, 18),
          slide: j,
          scores: (resultsMap[j.id] || []).map((m) => ({ name: m.marker, score: m.positive_pixel_pct })),
        })),
    [selected, available, resultsMap]
  )
  const proteinNames = compareSlides[0]?.scores.map((s) => s.name) || []
  const insights = useMemo(() => (compareSlides.length >= 2 ? buildInsights(compareSlides) : null), [compareSlides])

  function exportCsv() {
    const header = ['Protein', ...compareSlides.map((c) => c.label)]
    const lines = proteinNames.map((name) => {
      const cells = compareSlides.map((c) => {
        const s = c.scores.find((x) => x.name === name)
        return s?.insufficient ? 'N/A' : (s?.score ?? '')
      })
      return [name, ...cells].join(',')
    })
    const csv = [header.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'gigatime-comparison.csv'
    a.click()
    URL.revokeObjectURL(url)
    onToast?.('Comparison CSV exported')
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Compare Slides</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Select 2–3 completed slides to compare protein expression patterns</p>
      </div>

      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">Select slides <span className="text-gray-400">({selected.length}/3)</span></h3>
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])} className="btn-ghost text-xs"><X className="h-3.5 w-3.5" /> Clear Selection</button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {available.map((j) => {
            const active = selected.includes(j.id)
            const disabled = !active && selected.length >= 3
            return (
              <button key={j.id} type="button" onClick={() => toggle(j.id)} disabled={disabled} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150', active ? 'border-brand bg-brand/10 text-brand-dark dark:text-brand-light' : 'border-gray-200 text-gray-500 hover:border-brand dark:border-gray-700 dark:text-gray-300', disabled && 'cursor-not-allowed opacity-40')}>
                <span className={cn('flex h-4 w-4 items-center justify-center rounded border', active ? 'border-brand bg-brand text-white' : 'border-gray-400')}>{active && <Check className="h-3 w-3" />}</span>
                <span className="max-w-[180px] truncate">{j.filename}</span>
              </button>
            )
          })}
        </div>
      </div>

      {compareSlides.length < 2 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Select at least two completed slides to see a comparison.</p>
        </div>
      ) : (
        <>
          <ComparisonChart
            slides={compareSlides}
            action={
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 dark:text-brand-light"
              >
                <Download className="h-3.5 w-3.5" /> Export Comparison CSV
              </button>
            }
          />
        </>
      )}
    </div>
  )
}
