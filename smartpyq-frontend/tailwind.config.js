/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0EDFF',
          100: '#E0D9FF',
          200: '#C7B8FF',
          300: '#A891FF',
          400: '#8B6AFF',
          500: '#6C4EF6',
          600: '#5A3CE0',
          700: '#4A2BC7',
          800: '#3B1FA3',
          900: '#2D1580',
        },
        accent: {
          50: '#FAF5FF',
          100: '#F3E8FF',
          200: '#E9D5FF',
          300: '#D8B4FE',
          400: '#C084FC',
          500: '#9333EA',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
        },
        bg: {
          dark: '#0a0618',
          light: '#F8FAFF',
          nebula: '#0d0825',
        },
        muted: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
        success: {
          50: '#ECFDF5',
          500: '#10B981',
          600: '#059669',
        },
        warning: {
          50: '#FFFBEB',
          500: '#F59E0B',
          600: '#D97706',
        },
        error: {
          50: '#FEF2F2',
          500: '#EF4444',
          600: '#DC2626'
        },
        nebula: {
          50: 'rgba(255,255,255,0.05)',
          100: 'rgba(255,255,255,0.08)',
          200: 'rgba(255,255,255,0.12)',
          300: 'rgba(255,255,255,0.18)',
          400: 'rgba(255,255,255,0.25)',
        }
      },
      boxShadow: {
        'md': '0 10px 20px rgba(16,24,40,0.08)',
        'glow': '0 6px 30px rgba(108,78,246,0.18)',
      },
      animation: {
        'fade-in': 'fadeIn var(--anim-medium) ease-out',
        'slide-up': 'slideUp var(--anim-medium) ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 6px 30px rgba(108,78,246,0.18)' },
          '50%': { boxShadow: '0 6px 30px rgba(108,78,246,0.35)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionDuration: {
        'fast': '150ms',
        'medium': '300ms',
        'slow': '600ms',
      },
    },
  },
  plugins: [],
  future: {
    hoverOnlyWhenSupported: true,
  },
}