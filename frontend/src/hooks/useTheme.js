import { useCallback, useEffect, useState } from 'react'
import { THEME_STORAGE_KEY } from '../utils/constants'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'light'
  } catch {
    return 'light'
  }
}

/**
 * Theme controller. Default is dark; the choice is persisted to localStorage
 * and reflected on <html> via the `dark` class (Tailwind darkMode: 'class').
 */
export function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* ignore persistence errors */
    }
  }, [theme])

  const setTheme = useCallback((next) => setThemeState(next), [])
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  )

  return { theme, isDark: theme === 'dark', toggleTheme, setTheme }
}
