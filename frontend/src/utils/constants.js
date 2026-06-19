import {
  LayoutDashboard,
  UploadCloud,
  ListChecks,
  GitCompareArrows,
  Settings,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Application identity
// ---------------------------------------------------------------------------
export const APP_NAME = 'GigaTIME'
export const APP_TAGLINE = 'Virtual mIF from H&E — Population-scale tissue analysis'

export const APP_USER = {
  name: 'Anannya',
  institution: 'Research Lab',
  email: 'anannya@researchlab.org',
  initials: 'A',
}

export const THEME_STORAGE_KEY = 'gigatime-theme'
export const CONSENT_STORAGE_KEY = 'gigatime-privacy-accepted'

// ---------------------------------------------------------------------------
// Navigation — switched via app state (no router)
// ---------------------------------------------------------------------------
export const PAGES = {
  LOGIN: 'login',
  NOTICE: 'notice',
  DASHBOARD: 'dashboard',
  UPLOAD: 'upload',
  HISTORY: 'history',
  RESULTS: 'results',
  COMPARISON: 'comparison',
  SETTINGS: 'settings',
}

export const NAV_ITEMS = [
  { id: PAGES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
  { id: PAGES.UPLOAD, label: 'Upload Slide', icon: UploadCloud },
  { id: PAGES.HISTORY, label: 'My Slides', icon: ListChecks },
  { id: PAGES.COMPARISON, label: 'Compare Slides', icon: GitCompareArrows },
  { id: PAGES.SETTINGS, label: 'Settings', icon: Settings },
]

// ---------------------------------------------------------------------------
// Slide status model
// ---------------------------------------------------------------------------
export const SLIDE_STATUS = {
  CREATED: 'Created',
  UPLOADED: 'Uploaded',
  QUEUED: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  PREEMPTED: 'Preempted',
  REQUEUED: 'Requeued',
}

// Statuses a slide can still be stopped from (queued or in flight).
export const STOPPABLE_STATUSES = [
  SLIDE_STATUS.CREATED,
  SLIDE_STATUS.UPLOADED,
  SLIDE_STATUS.QUEUED,
  SLIDE_STATUS.RUNNING,
  SLIDE_STATUS.PREEMPTED,
  SLIDE_STATUS.REQUEUED,
]

// Human-facing label per status (e.g. Succeeded → "Completed").
export const STATUS_LABEL = {
  [SLIDE_STATUS.SUCCEEDED]: 'Completed',
}

/** tone families: green (done), orange (active), red (failed), gray (idle). */
export const STATUS_META = {
  [SLIDE_STATUS.CREATED]: { tone: 'gray', pulse: false },
  [SLIDE_STATUS.UPLOADED]: { tone: 'gray', pulse: false },
  [SLIDE_STATUS.QUEUED]: { tone: 'gray', pulse: false },
  [SLIDE_STATUS.RUNNING]: { tone: 'orange', pulse: true },
  [SLIDE_STATUS.SUCCEEDED]: { tone: 'green', pulse: false },
  [SLIDE_STATUS.FAILED]: { tone: 'red', pulse: false },
  [SLIDE_STATUS.CANCELLED]: { tone: 'gray', pulse: false },
  [SLIDE_STATUS.PREEMPTED]: { tone: 'orange', pulse: true },
  [SLIDE_STATUS.REQUEUED]: { tone: 'orange', pulse: true },
}

export const TIMELINE_STEPS = [
  SLIDE_STATUS.CREATED,
  SLIDE_STATUS.UPLOADED,
  SLIDE_STATUS.QUEUED,
  SLIDE_STATUS.RUNNING,
  SLIDE_STATUS.SUCCEEDED,
]

// ---------------------------------------------------------------------------
// Research metadata
// ---------------------------------------------------------------------------
export const CANCER_TYPES = ['Lung', 'Breast', 'Colon', 'Brain', 'Pancreas', 'Other']
export const SUPPORTED_FORMATS = ['PNG', 'SVS', 'TIFF', 'TIF']

export const CONSENT_ITEMS = [
  { id: 'research', label: 'I confirm this slide is for research use only' },
  { id: 'consent', label: 'I confirm patient consent has been obtained' },
  { id: 'deid', label: 'I confirm the slide has been de-identified' },
  { id: 'nonclinical', label: 'I understand outputs are not intended for clinical diagnosis' },
]

// ---------------------------------------------------------------------------
// Protein channels (21 analysis channels)
// ---------------------------------------------------------------------------
export const PROTEIN_CATEGORIES = [
  'All',
  'Immune Cells',
  'Cancer Markers',
  'Cell Death',
  'Structural',
  'Other',
]

// Fluorescence-inspired colour per channel (for the mIF overlay + accents).
export const PROTEIN_COLORS = {
  DAPI: '#3B82F6',
  CD3: '#22C55E',
  CD8: '#06B6D4',
  'PD-L1': '#A3E635',
  CK: '#D946EF',
  CD68: '#F97316',
  CD4: '#10B981',
  CD20: '#9CA3AF',
  CD16: '#EAB308',
  CD11c: '#8B5CF6',
  CD14: '#F59E0B',
  CD138: '#EC4899',
  'PD-1': '#84CC16',
  'T-bet': '#2DD4BF',
  CD34: '#0EA5E9',
  Ki67: '#EF4444',
  Tryptase: '#FB7185',
  'Actin-D': '#94A3B8',
  'Caspase3-D': '#F43F5E',
  'PHH3-B': '#A78BFA',
  Transgelin: '#34D399',
}

export const DEFAULT_PREVIEW_PROTEINS = ['DAPI', 'CD3', 'PD-L1']
export const VALIDATION_MEAN_MARKER = 4.19
export const INSUFFICIENT_SAMPLE_PROTEIN = 'CD20'
