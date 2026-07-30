/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ----- Typography -----
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },

      // ----- Color tokens (all from the design system) -----
      // Tokens that should be swappable from Settings (display → color-blind
      // safe palette) are exposed as CSS variables in :root, with the same
      // variable name as the Tailwind key. This lets index.css override them
      // under `html[data-cb-safe='true']` and have existing `bg-accent-secondary`
      // / `text-status-success` etc. pick up the new value automatically.
      colors: {
        bg: {
          base:     '#0A0A0F',
          surface:  '#0F0F1A',
          card:     '#13131F',
          elevated: '#1A1A2E',
        },
        accent: {
          DEFAULT: 'var(--accent)',         // violet — brand, never swaps
          glow:    'var(--accent-glow)',
          secondary:    'var(--accent-secondary)',         // gold, swappable
          'secondary-glow': 'var(--accent-secondary-glow)',
        },
        text: {
          primary:   '#F8F8FF',
          secondary: '#A0A0C0',
          muted:     '#5A5A7A',
          disabled:  '#2E2E4A',
        },
        status: {
          success: 'var(--status-success)',
          error:   'var(--status-error)',
          warning: 'var(--status-warning)',
          info:    '#3B82F6',
        },
        border: {
          subtle: '#1E1E35',
          DEFAULT: '#2A2A45',
          active: '#7C3AED',
        },
        // Light input surface — high-contrast fields on dark cards (API keys, etc.)
        input: {
          surface:     'var(--input-surface)',
          'surface-hover': 'var(--input-surface-hover)',
          text:        'var(--input-text)',
          placeholder: 'var(--input-placeholder)',
          border:      'var(--input-border)',
        },
      },

      // ----- Spacing & radii (from spec) -----
      borderRadius: {
        card:   '20px',
        button: '14px',
        input:  '14px',
        badge:  '8px',
        pill:   '999px',
      },
      spacing: {
        '4.5': '18px',
      },

      // ----- Shadows (color-tinted, never grey) -----
      boxShadow: {
        'card':    '0 8px 32px rgba(0,0,0,0.4)',
        'card-hover': '0 12px 40px rgba(124,58,237,0.25)',
        'glow-violet': '0 0 20px rgba(124,58,237,0.6)',
        'glow-violet-soft': '0 0 20px rgba(124,58,237,0.35)',
        'glow-gold': '0 0 16px rgba(245,158,11,0.45)',
      },

      // ----- Backgrounds (gradients as utility classes) -----
      backgroundImage: {
        'hero':     'linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 50%, #0D0D1F 100%)',
        'card-grad':'linear-gradient(145deg, #13131F 0%, #1A1A2E 100%)',
        'violet':   'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
        'gold':     'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
        'shimmer':  'linear-gradient(90deg, transparent, rgba(124,58,237,0.15), transparent)',
      },

      // ----- Easings -----
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      // ----- Keyframes -----
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'shimmer-sweep': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'shimmer-bg': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%':      { opacity: '1',   transform: 'scale(1.05)' },
        },
        'ping-slow': {
          '0%':   { transform: 'scale(1)',   opacity: '0.75' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        'aurora-drift': {
          '0%':   { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
          '50%':  { transform: 'translate(2%, -3%) rotate(8deg) scale(1.05)' },
          '100%': { transform: 'translate(-2%, 1%) rotate(-6deg) scale(1.02)' },
        },
        'spin-slow': {
          'from': { transform: 'rotate(0deg)' },
          'to':   { transform: 'rotate(360deg)' },
        },
        'toast-in': {
          '0%':   { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'reveal-spring': {
          '0%':   { opacity: '0', transform: 'scale(0.95)', filter: 'blur(4px)' },
          '100%': { opacity: '1', transform: 'scale(1)',    filter: 'blur(0)' },
        },
        'progress-pulse': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(124,58,237,0.6)' },
          '50%':      { boxShadow: '0 0 20px rgba(124,58,237,1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'fade-in': 'fade-in 0.2s ease-out both',
        'shimmer-sweep': 'shimmer-sweep 0.6s ease-out',
        'shimmer-bg': 'shimmer-bg 2s linear infinite',
        'pulse-soft': 'pulse-soft 3s ease-in-out infinite',
        'ping-slow': 'ping-slow 2.4s cubic-bezier(0,0,0.2,1) infinite',
        'aurora-drift': 'aurora-drift 20s ease-in-out infinite',
        'spin-slow': 'spin-slow 20s linear infinite',
        'toast-in': 'toast-in 0.3s cubic-bezier(0.16,1,0.3,1) both',
        'reveal-spring': 'reveal-spring 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'progress-pulse': 'progress-pulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
