/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'pulse-purple': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(168, 85, 247, 0.7)', borderColor: 'rgb(168,85,247)' },
          '50%': { boxShadow: '0 0 18px 4px rgba(168, 85, 247, 0.55)', borderColor: 'rgb(216,180,254)' },
        },
        'pulse-emerald': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.7)', borderColor: 'rgb(16,185,129)' },
          '50%': { boxShadow: '0 0 18px 4px rgba(16, 185, 129, 0.55)', borderColor: 'rgb(110,231,183)' },
        },
        'pulse-active': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(56, 189, 248, 0.0)' },
          '50%': { boxShadow: '0 0 22px 6px rgba(56, 189, 248, 0.45)' },
        },
        'dash-flow': {
          to: { strokeDashoffset: '-100' },
        },
        'btn-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.6)' },
          '50%': { boxShadow: '0 0 0 8px rgba(34, 197, 94, 0)' },
        },
      },
      animation: {
        'pulse-purple': 'pulse-purple 1.6s ease-in-out infinite',
        'pulse-emerald': 'pulse-emerald 1.6s ease-in-out infinite',
        'pulse-active': 'pulse-active 1.2s ease-in-out infinite',
        'dash-flow': 'dash-flow 1s linear infinite',
        'btn-pulse': 'btn-pulse 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
