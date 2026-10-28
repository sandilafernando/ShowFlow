/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#060708',
          900: '#090b0e',
          850: '#0d1014',
          800: '#11151a',
          750: '#161b22',
          700: '#1b212a',
        },
        line: {
          DEFAULT: '#1d242d',
          strong: '#2a333e',
          soft: '#141920',
        },
        fg: {
          DEFAULT: '#edf1f6',
          muted: '#9aa5b4',
          faint: '#6b7685',
        },
        accent: {
          DEFAULT: '#2dd4e6',
          bright: '#7cecf7',
          dim: '#0e7490',
          soft: 'rgba(45, 212, 230, 0.11)',
        },
        positive: '#4ade80',
        warning: '#fbbf24',
        danger: '#fb7185',
        violet: '#a78bfa',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['10.5px', { lineHeight: '14px', letterSpacing: '0.08em' }],
        xs: ['11.5px', { lineHeight: '16px' }],
        sm: ['12.5px', { lineHeight: '18px' }],
        base: ['13.5px', { lineHeight: '20px' }],
        md: ['14.5px', { lineHeight: '22px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['19px', { lineHeight: '26px' }],
        '2xl': ['23px', { lineHeight: '30px' }],
        '3xl': ['29px', { lineHeight: '36px' }],
        '4xl': ['38px', { lineHeight: '44px' }],
      },
      borderRadius: {
        DEFAULT: '7px',
        md: '8px',
        lg: '10px',
        xl: '13px',
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 20px 50px -30px rgba(0,0,0,0.9)',
        pop: '0 18px 50px -12px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
        glow: '0 0 0 1px rgba(45,212,230,0.28), 0 0 28px -8px rgba(45,212,230,0.35)',
      },
      transitionDuration: {
        fast: '120ms',
      },
      keyframes: {
        'live-pulse': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(251,113,133,0.45)' },
          '50%': { opacity: '0.75', boxShadow: '0 0 0 5px rgba(251,113,133,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'live-pulse': 'live-pulse 2s ease-in-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
};
