/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens semánticos que cambian con el tema (definidos en index.css)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',

        // Marca JDDeveloper (valores fijos extraídos de la web)
        brand: {
          crema: '#fdf5ef',
          cremaSoft: '#fef6f0',
          dark: '#161616',
          coral: '#ff7448',
          mandarina: '#f38744',
          quemado: '#ef6820',
          violeta: '#6248ff',
        },
        // Acento principal (mapea a coral) con escala
        primary: {
          DEFAULT: '#ff7448',
          50: '#fff3ef',
          100: '#ffe4d8',
          200: '#ffc6b0',
          300: '#ffa17d',
          400: '#ff7448',
          500: '#f38744',
          600: '#ef6820',
          700: '#c5510f',
          800: '#9c4212',
          900: '#7e3813',
        },
      },
      fontFamily: {
        sans: ['Relative', 'Inter', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        heading: ['Relative', 'Inter', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,16,16,0.04), 0 4px 16px rgba(16,16,16,0.06)',
        'card-hover': '0 2px 4px rgba(16,16,16,0.06), 0 8px 28px rgba(16,16,16,0.10)',
        glow: '0 0 0 3px rgba(255,116,72,0.20)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [],
}
