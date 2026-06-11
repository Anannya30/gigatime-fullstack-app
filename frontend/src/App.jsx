import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import LoginPage from './pages/LoginPage'
import NoticePage from './pages/NoticePage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import ResultsPage from './pages/ResultsPage'
import ComparisonPage from './pages/ComparisonPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import { useTheme } from './hooks/useTheme'
import { useMockSlides } from './hooks/useMockSlides'
import { APP_USER, CONSENT_STORAGE_KEY, SLIDE_STATUS, PAGES } from './utils/constants'

function readConsent() {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export default function App() {
  const { isDark, toggleTheme } = useTheme()
  const { slides, loading, stats, getSlideById, updateSlideMeta, createSlide } = useMockSlides()

  const [authed, setAuthed] = useState(false)
  const [consented, setConsented] = useState(readConsent)
  const [page, setPage] = useState(PAGES.DASHBOARD)

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const [activeSlideId, setActiveSlideId] = useState(null)
  const [comparisonSelection, setComparisonSelection] = useState([])
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  // Recent slides for the sidebar (latest 5, reflects live slide list).
  const recentSlides = useMemo(
    () =>
      [...slides]
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
        .slice(0, 5)
        .map((j) => ({ id: j.id, filename: j.filename, status: j.status, meanPearson: j.meanPearson })),
    [slides]
  )

  function navigate(target) {
    if (target === PAGES.RESULTS && !activeSlideId && slides.length) {
      const running = slides.find((j) => j.status === SLIDE_STATUS.RUNNING)
      setActiveSlideId((running || slides[0]).id)
    }
    setPage(target)
    setMobileOpen(false)
  }

  function handleLogin() {
    setAuthed(true)
    setPage(consented ? PAGES.DASHBOARD : PAGES.NOTICE)
  }
  function acceptNotice() {
    setConsented(true)
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, 'true')
    } catch {
      /* ignore */
    }
    setPage(PAGES.DASHBOARD)
  }
  function handleLogout() {
    setAuthed(false)
    setPage(PAGES.DASHBOARD)
  }
  function viewSlide(slide) {
    setActiveSlideId(typeof slide === 'string' ? slide : slide.id)
    setPage(PAGES.RESULTS)
    setMobileOpen(false)
  }
  function compareSelected(ids) {
    setComparisonSelection(ids)
    setPage(PAGES.COMPARISON)
  }

  if (!authed) {
    return <LoginPage onLogin={handleLogin} isDark={isDark} onToggleTheme={toggleTheme} />
  }
  if (!consented) {
    return (
      <div className="min-h-screen bg-paper px-4 py-12 dark:bg-gray-900">
        <NoticePage firstView onAccept={acceptNotice} />
      </div>
    )
  }

  const activeSlide = getSlideById(activeSlideId)

  function renderPage() {
    switch (page) {
      case PAGES.DASHBOARD:
        return <DashboardPage slides={slides} loading={loading} stats={stats} onNavigate={navigate} onViewSlide={viewSlide} />
      case PAGES.UPLOAD:
        return <UploadPage createSlide={createSlide} onNavigate={navigate} onSlideCreated={(slide) => { setToast('Slide uploaded — analysis started'); viewSlide(slide) }} />
      case PAGES.RESULTS:
        return <ResultsPage slide={activeSlide} onNavigate={navigate} onUpdateMeta={updateSlideMeta} onToast={setToast} />
      case PAGES.COMPARISON:
        return <ComparisonPage slides={slides} initialSelection={comparisonSelection} onToast={setToast} />
      case PAGES.HISTORY:
        return <HistoryPage slides={slides} loading={loading} onView={viewSlide} onCompareSelected={compareSelected} />
      case PAGES.SETTINGS:
        return <SettingsPage isDark={isDark} onToggleTheme={toggleTheme} onNavigate={navigate} />
      case PAGES.NOTICE:
        return <NoticePage onAccept={() => setToast('Acknowledgement saved')} />
      default:
        return null
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-paper dark:bg-gray-900">
      <Sidebar
        current={page}
        onNavigate={navigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        recentSlides={recentSlides}
        onSelectSlide={viewSlide}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          user={APP_USER}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onToggleSidebar={() => setMobileOpen((o) => !o)}
          onNavigate={navigate}
          onLogout={handleLogout}
          scrolled={scrolled}
        />

        <main className="flex-1 overflow-y-auto px-5 py-8 sm:px-8" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
          <div key={page} className="animate-fade-in">{renderPage()}</div>
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-fade-in rounded-lg border border-brand/30 bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lift dark:bg-gray-800">
          {toast}
        </div>
      )}
    </div>
  )
}
