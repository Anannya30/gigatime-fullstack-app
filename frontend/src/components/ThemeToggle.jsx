import { Moon, Sun } from 'lucide-react'
import { cn } from '../utils/helpers'

/** Light/dark switch, controlled by the useTheme hook via props. */
export default function ThemeToggle({ isDark, onToggle, className }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-lg',
        'border border-gray-200 text-gray-500 transition-all duration-200',
        'hover:border-brand hover:text-brand',
        'dark:border-gray-700 dark:text-gray-400 dark:hover:text-brand-light',
        className
      )}
    >
      <Sun className={cn('absolute h-[18px] w-[18px] transition-all duration-300', isDark ? 'scale-0 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100')} />
      <Moon className={cn('absolute h-[18px] w-[18px] transition-all duration-300', isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-0 rotate-90 opacity-0')} />
    </button>
  )
}
