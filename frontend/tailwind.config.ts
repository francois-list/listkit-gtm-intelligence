import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // ListKit Primary Palette (Blue)
        primary: {
          DEFAULT: '#5273FF',
          50: '#EEF4FF',
          100: '#DCE6FF',
          200: '#B9CDFF',
          300: '#8AADFF',
          400: '#6B91FF',
          500: '#5273FF',
          600: '#3A5AE6',
          700: '#2D47C0',
          800: '#253A99',
          900: '#1E2F7A',
        },
        // ListKit Secondary Palette (Violet)
        secondary: {
          DEFAULT: '#660CFB',
          50: '#F5EDFF',
          100: '#E8D6FF',
          200: '#D2B7FE',
          300: '#B88CFE',
          400: '#9B5DFD',
          500: '#7B2EFC',
          600: '#660CFB',
          700: '#5209C8',
          800: '#420799',
          900: '#32057A',
        },
        // Neutrals (Light Mode)
        neutral: {
          bg: '#F8FAFC',
          surface: '#FFFFFF',
          'surface-muted': '#F1F5F9',
          border: '#E5E7EB',
          'border-strong': '#D1D5DB',
          text: '#0F172A',
          'text-muted': '#64748B',
          'text-subtle': '#94A3B8',
        },
        // Accent Colors for Tags/Pills
        accent: {
          success: {
            bg: '#C2EAD5',
            text: '#2BB76C',
            border: 'rgba(43, 183, 108, 0.25)',
          },
          warning: {
            bg: '#EBD6AC',
            text: '#C58D17',
            border: 'rgba(197, 141, 23, 0.25)',
          },
          info: {
            bg: '#EEF4FF',
            text: '#5273FF',
            border: 'rgba(82, 115, 255, 0.25)',
          },
          violet: {
            bg: '#D2B7FE',
            text: '#660CFB',
            border: 'rgba(102, 12, 251, 0.25)',
          },
        },
        // Dark mode overrides
        dark: {
          bg: '#0B1220',
          surface: '#0F172A',
          'surface-muted': '#111C30',
          border: 'rgba(148, 163, 184, 0.18)',
          'border-strong': 'rgba(148, 163, 184, 0.28)',
          text: '#E2E8F0',
          'text-muted': '#94A3B8',
          'text-subtle': '#64748B',
          primary: '#6D86FF',
          secondary: '#9B7CFF',
        },
      },
      // Typography - ListKit spec
      fontSize: {
        'title': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'section-label': ['12px', { lineHeight: '16px', fontWeight: '600', letterSpacing: '0.01em' }],
        'body': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'body-strong': ['13px', { lineHeight: '18px', fontWeight: '600' }],
        'caption': ['12px', { lineHeight: '16px', fontWeight: '400' }],
      },
      // Border Radius - ListKit spec
      borderRadius: {
        'xs': '6px',
        'sm': '8px',
        'md': '10px',
        'lg': '12px',
        'pill': '999px',
      },
      // Spacing - ListKit spec
      spacing: {
        'app-x': '16px',
        'app-y': '12px',
        'panel': '12px',
        'row-table': '36px',
        'gap-sm': '8px',
        'gap-md': '12px',
        'gap-lg': '16px',
      },
      // Box Shadows - ListKit spec
      boxShadow: {
        'sm': '0 1px 2px rgba(15, 23, 42, 0.06)',
        'md': '0 6px 16px rgba(15, 23, 42, 0.08)',
        'focus': '0 0 0 3px rgba(82, 115, 255, 0.25)',
        // Dark mode shadows
        'dark-sm': '0 1px 2px rgba(0, 0, 0, 0.35)',
        'dark-md': '0 10px 24px rgba(0, 0, 0, 0.45)',
        'dark-focus': '0 0 0 3px rgba(109, 134, 255, 0.30)',
      },
      // Sidebar widths
      width: {
        'sidebar': '240px',
        'sidebar-collapsed': '64px',
        'filters': '300px',
      },
      // Transition
      transitionDuration: {
        'layout': '300ms',
      },
    },
  },
  plugins: [],
}
export default config
