/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Concept 3 notebook style: serif (Amiri) for headings, clean sans (Inter) for body.
        serif: ['"Amiri"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      // Concept 3 notebook palette: warm off-white paper + forest-green CTAs.
      // A muted amber replaces the old orange accent for a warmer, academic tone.
      colors: {
        brand: {
          DEFAULT: '#2D6A4F', // forest green
          dark: '#1B4332', // deep forest (hover / active)
          light: '#40916C', // light forest
        },
        accent: {
          DEFAULT: '#B45309', // amber-700
          dark: '#92400E', // amber-800
        },
        paper: {
          DEFAULT: '#F7F3EA', // warm cream page background
          card: '#FBFAF6', // slightly lifted card surface
          line: '#E6DFD1', // hairline borders / dividers
        },
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(17, 24, 39, 0.05)',
        card: '0 1px 3px 0 rgba(17, 24, 39, 0.07), 0 1px 2px -1px rgba(17, 24, 39, 0.04)',
        lift: '0 10px 24px -10px rgba(17, 24, 39, 0.18)',
        'glow-green': '0 0 0 1px rgba(5, 150, 105, 0.35), 0 8px 24px -6px rgba(5, 150, 105, 0.35)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-fast': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(180, 83, 9, 0.5)' },
          '70%': { boxShadow: '0 0 0 6px rgba(180, 83, 9, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(180, 83, 9, 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        'fade-in-fast': 'fade-in-fast 0.2s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
