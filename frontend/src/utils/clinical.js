/**
 * Clinical interpretation logic for the Slide Results page.
 *
 * The unique value of virtual mIF is SPATIAL immune context — where cytotoxic
 * T cells sit relative to the tumor — not raw protein abundance. These helpers
 * encode that principle and, critically, degrade honestly when the spatial data
 * needed to make a confident call is not available.
 */

// --- Thresholds (marker %, 0–100 scale) ------------------------------------
const CD8_HIGH = 5 // robust cytotoxic T-cell infiltration
const CD8_PRESENT = 1 // a detectable cytotoxic T-cell signal
export const PDL1_POSITIVE_THRESHOLD = 5 // PD-L1 % considered positive

// --- TME phenotype catalogue -----------------------------------------------
export const PHENOTYPE_META = {
  inflamed: {
    key: 'inflamed',
    label: 'Immune Hot',
    short: 'Immune Hot',
    tone: 'green',
    definition: 'Cytotoxic T cells have infiltrated the tumor core — an immunologically active “hot” tumor.',
  },
  excluded: {
    key: 'excluded',
    label: 'Immune Excluded',
    short: 'Immune Excluded',
    tone: 'orange',
    definition: 'T cells are present in the surrounding stroma but largely shut out of the tumor core.',
  },
  desert: {
    key: 'desert',
    label: 'Immune Desert',
    short: 'Immune Desert',
    tone: 'grey',
    definition: 'Few cytotoxic T cells anywhere — an immunologically “cold” tumor.',
  },
  indeterminate: {
    key: 'indeterminate',
    label: 'Low immune infiltration (spatial subtype indeterminate)',
    short: 'Low infiltration',
    tone: 'grey',
    definition:
      'Overall cytotoxic T-cell signal is low, but immune-excluded vs immune-desert cannot be distinguished without spatial data.',
  },
}

// Tailwind class maps (reuse the existing color system).
export const PHENOTYPE_BANNER = {
  green: 'border-brand/30 bg-brand/10 text-brand-dark dark:text-brand-light',
  orange: 'border-accent/30 bg-accent/10 text-accent-dark dark:text-accent',
  grey: 'border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-200',
}
export const PHENOTYPE_PILL = {
  green: 'bg-brand/10 text-brand-dark dark:text-brand-light',
  orange: 'bg-accent/10 text-accent-dark dark:text-accent',
  grey: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

// Evidence-confidence styling (Established / Suggestive / Hypothesis).
export const EVIDENCE_META = {
  Established: 'border border-brand/20 bg-brand/10 text-brand-dark dark:text-brand-light',
  Suggestive: 'border border-accent/25 bg-accent/10 text-accent-dark dark:text-accent',
  Hypothesis: 'border border-gray-300 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

/**
 * Derive the tumor immune phenotype from the CD8 spatial distribution.
 *
 * The clinically meaningful axis is WHERE cytotoxic T cells sit, not how many
 * exist overall. Telling "excluded" (T cells stuck in stroma) apart from
 * "desert" (T cells absent everywhere) REQUIRES tumor-core vs stromal CD8.
 * When only a whole-slide number is available we refuse to guess between the
 * two — surfacing that limitation is a credibility feature for clinicians.
 *
 * @param {number|null} cd8_intratumoral CD8 % inside the tumor core (null if not measured)
 * @param {number|null} cd8_stromal      CD8 % in the surrounding stroma (null if not measured)
 * @param {number|null} cd8_total        whole-slide CD8 % (fallback)
 * @returns {object} a PHENOTYPE_META entry extended with
 *   { spatial: boolean, note?: string, cd8_intratumoral, cd8_stromal, cd8_total }
 */
export function deriveImmunePhenotype(cd8_intratumoral, cd8_stromal, cd8_total) {
  const hasSpatial = cd8_intratumoral != null && cd8_stromal != null

  if (hasSpatial) {
    let pheno
    if (cd8_intratumoral >= CD8_HIGH) pheno = PHENOTYPE_META.inflamed
    else if (cd8_stromal >= CD8_PRESENT) pheno = PHENOTYPE_META.excluded
    else pheno = PHENOTYPE_META.desert
    return { ...pheno, spatial: true, cd8_intratumoral, cd8_stromal, cd8_total }
  }

  // Only a single whole-slide value: a clearly high signal can still be called
  // "hot", but a low signal must NOT be forced into excluded vs desert.
  if (cd8_total != null && cd8_total >= CD8_HIGH) {
    return { ...PHENOTYPE_META.inflamed, spatial: false, cd8_intratumoral: null, cd8_stromal: null, cd8_total }
  }
  return {
    ...PHENOTYPE_META.indeterminate,
    spatial: false,
    note:
      'Distinguishing immune-excluded from immune-desert requires tumor-core vs stromal CD8 quantification, not yet available for this slide.',
    cd8_intratumoral: null,
    cd8_stromal: null,
    cd8_total,
  }
}

/**
 * Reconcile PD-L1 positivity with spatial immune context.
 *
 * Clinical reference: immune-excluded / desert tumors predict REDUCED
 * checkpoint-blockade response even when PD-L1 is positive, because cytotoxic
 * T cells cannot reach the tumor. So PD-L1+ on its own must never yield a
 * confident "candidate" — that would be the treatment-logic contradiction this
 * function exists to prevent.
 *
 * @param {object}  phenotype        result of deriveImmunePhenotype
 * @param {boolean} pdl1_positive
 * @param {number|null} cd8_intratumoral
 * @returns {{ status, title, tone, detail, confidence }}
 */
export function deriveCheckpointSignal(phenotype, pdl1_positive, cd8_intratumoral) {
  const isHot = phenotype.key === 'inflamed'
  const intratumoralCd8Present = cd8_intratumoral != null && cd8_intratumoral >= CD8_PRESENT

  if (!pdl1_positive) {
    return {
      status: 'unlikely',
      title: 'Checkpoint Inhibitor — Unlikely',
      tone: 'gray',
      confidence: 'Suggestive',
      detail: 'PD-L1 expression is below the positivity threshold, offering limited rationale for checkpoint blockade.',
    }
  }

  // Confident candidate ONLY with hot phenotype + PD-L1+ + CD8 inside the tumor.
  if (isHot && intratumoralCd8Present) {
    return {
      status: 'candidate',
      title: 'Checkpoint Inhibitor Candidate',
      tone: 'green',
      confidence: 'Suggestive',
      detail:
        'PD-L1 is positive and cytotoxic T cells are present within the tumor core — the spatial context supports the PD-L1 signal.',
    }
  }

  // PD-L1+ but phenotype is excluded / desert / indeterminate → temper the call.
  return {
    status: 'equivocal',
    title: 'Checkpoint Inhibitor — Equivocal',
    tone: 'orange',
    confidence: 'Suggestive',
    detail:
      'PD-L1 is positive, but the immune phenotype suggests cytotoxic T cells may not be reaching the tumor, which is associated with reduced checkpoint-blockade response. Spatial context tempers the PD-L1 signal.',
  }
}
