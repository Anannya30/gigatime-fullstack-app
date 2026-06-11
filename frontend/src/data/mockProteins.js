import { PROTEIN_COLORS, INSUFFICIENT_SAMPLE_PROTEIN } from '../utils/constants'
import { seededRandom, roundTo } from '../utils/helpers'

/**
 * The 21 analysis protein channels GigaTIME predicts (TRITC / Cy5 background
 * channels excluded). `baseline` holds the representative Positive Marker
 * Percentage (0–100 scale) — the share of tissue pixels testing positive for
 * each protein. Per-slide scores jitter around it (see generateProteinScores).
 */
// `r` is the held-out validation correlation per channel (identical across
// patients) — it drives the HIGH / MODERATE / LOW / VERY LOW confidence tier.
export const PROTEINS = [
  { name: 'DAPI', category: 'Structural', baseline: 10.21, description: 'Nuclear marker', r: 0.98 },
  { name: 'CD11c', category: 'Immune Cells', baseline: 1.45, description: 'Dendritic cells', r: 0.47 },
  { name: 'PD-L1', category: 'Cancer Markers', baseline: 10.46, description: 'Checkpoint ligand', r: 0.74 },
  { name: 'CK', category: 'Cancer Markers', baseline: 17.45, description: 'Epithelial lineage', r: 0.96 },
  { name: 'CD16', category: 'Immune Cells', baseline: 1.23, description: 'NK / neutrophils', r: 0.56 },
  { name: 'CD68', category: 'Immune Cells', baseline: 6.26, description: 'Macrophages', r: 0.54 },
  { name: 'CD138', category: 'Immune Cells', baseline: 5.94, description: 'Plasma cells', r: 0.59 },
  { name: 'CD4', category: 'Immune Cells', baseline: 0.97, description: 'Helper T cells', r: 0.86 },
  { name: 'PHH3-B', category: 'Cell Death', baseline: 0.92, description: 'Mitotic spindle', r: 0.13 },
  { name: 'CD3', category: 'Immune Cells', baseline: 0.21, description: 'All T cells', r: 0.89 },
  { name: 'Ki67', category: 'Cancer Markers', baseline: 2.42, description: 'Proliferation index', r: 0.16 },
  { name: 'CD34', category: 'Cancer Markers', baseline: 0.0, description: 'Vascular / endothelium', r: 0.18 },
  { name: 'T-bet', category: 'Other', baseline: 0.37, description: 'NK / T-cell lineage', r: 0.20 },
  { name: 'Actin-D', category: 'Structural', baseline: 1.36, description: 'Myofibroblast', r: 0.32 },
  { name: 'CD14', category: 'Immune Cells', baseline: 1.93, description: 'Monocytes', r: 0.51 },
  { name: 'CD8', category: 'Immune Cells', baseline: 1.38, description: 'Cytotoxic T cells', r: 0.30 },
  { name: 'Caspase3-D', category: 'Cell Death', baseline: 18.46, description: 'Apoptosis', r: 0.64 },
  { name: 'PD-1', category: 'Other', baseline: 6.11, description: 'Checkpoint receptor', r: 0.47 },
  { name: 'Transgelin', category: 'Structural', baseline: 0.81, description: 'Fibroblast / smooth muscle', r: 0.36 },
  { name: 'Tryptase', category: 'Other', baseline: 0.0, description: 'Mast cells', r: 0.49 },
  {
    name: INSUFFICIENT_SAMPLE_PROTEIN, // CD20
    category: 'Immune Cells',
    baseline: 0.0,
    description: 'B cells',
    r: 0.88,
    insufficient: true,
  },
].map((p) => ({ ...p, color: PROTEIN_COLORS[p.name] || '#9CA3AF' }))

export const PROTEIN_NAMES = PROTEINS.map((p) => p.name)

/**
 * Exact per-slide Positive Marker Percentage values (0–100 scale). When a slide
 * id is present here generateProteinScores returns these numbers verbatim;
 * other slides jitter around the canonical baseline.
 */
export const SLIDE_MARKER_OVERRIDES = {
  slide_093737: {
    'Caspase3-D': 18.46,
    CK: 17.45,
    'PD-L1': 10.46,
    DAPI: 10.21,
    CD68: 6.26,
    'PD-1': 6.11,
    CD138: 5.94,
    Ki67: 2.42,
    CD14: 1.93,
    CD11c: 1.45,
    CD8: 1.38,
    'Actin-D': 1.36,
    CD16: 1.23,
    CD4: 0.97,
    'PHH3-B': 0.92,
    Transgelin: 0.81,
    'T-bet': 0.37,
    CD3: 0.21,
    CD20: 0.0,
    CD34: 0.0,
    Tryptase: 0.0,
  },
  slide_093906: {
    DAPI: 48.2,
    'PD-1': 42.02,
    'Caspase3-D': 33.5,
    CD4: 33.45,
    'PD-L1': 30.38,
    CD3: 24.92,
    CD14: 15.48,
    CD68: 14.82,
    Tryptase: 10.62,
    CK: 4.57,
    CD11c: 4.38,
    CD16: 3.18,
    CD20: 1.47,
    CD138: 1.31,
    CD34: 1.0,
    'PHH3-B': 0.12,
    Ki67: 0.04,
    CD8: 0.01,
    'Actin-D': 0.0,
    'T-bet': 0.0,
    Transgelin: 0.0,
  },
}

/**
 * Canonical "latest run" values — the exact Positive Marker Percentages, sorted
 * high→low, used by the dashboard Positive Marker % overview chart. CD20 is
 * shown as 0 / N/A.
 */
export function getLatestRunScores() {
  return PROTEINS.map((p) => ({
    name: p.name,
    category: p.category,
    color: p.color,
    score: p.insufficient ? 0 : p.baseline,
    insufficient: !!p.insufficient,
  })).sort((a, b) => b.score - a.score)
}

/** Per-slide protein results (exact overrides, else deterministic jitter on a 0–100 scale). */
export function generateProteinScores(slideId = 'demo') {
  const override = SLIDE_MARKER_OVERRIDES[slideId]
  return PROTEINS.map((p) => {
    if (override) {
      const value = override[p.name] ?? 0
      const insufficient = p.name === INSUFFICIENT_SAMPLE_PROTEIN && value === 0
      return { ...p, score: value, insufficient }
    }
    if (p.insufficient) return { ...p, score: 0, insufficient: true }
    const jitter = seededRandom(`${slideId}:${p.name}`, -1.5, 1.5)
    const score = roundTo(Math.min(100, Math.max(0, p.baseline + jitter)), 2)
    return { ...p, score, insufficient: false }
  })
}

/** Mean Positive Marker % across all 21 protein channels. */
export function meanMarker(proteinScores) {
  if (!proteinScores.length) return 0
  const sum = proteinScores.reduce((s, p) => s + (p.score ?? 0), 0)
  return roundTo(sum / proteinScores.length, 2)
}
