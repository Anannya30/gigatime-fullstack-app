/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Amiri"', 'ui-serif', 'Georgia', 'serif'],
      },
      // Palette is built on Tailwind's emerald / orange / gray scales, which map
      // 1:1 to the brand spec: emerald-600 #059669, orange-500 #F97316,
      // gray-900 #111827, gray-800 #1F2937, gray-50 #F9FAFB, gray-200 #E5E7EB.
      colors: {
        brand: {
          DEFAULT: '#059669', // emerald-600
          dark: '#047857', // emerald-700
          light: '#10B981', // emerald-500
        },
        accent: {
          DEFAULT: '#F97316', // orange-500
          dark: '#EA580C', // orange-600
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
          '0%': { boxShadow: '0 0 0 0 rgba(249, 115, 22, 0.5)' },
          '70%': { boxShadow: '0 0 0 6px rgba(249, 115, 22, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(249, 115, 22, 0)' },
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
