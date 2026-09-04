// Tailwind CLI config — this REPLACES the inline `window.tailwindConfig` +
// `cdn.tailwindcss.com` runtime setup that used to be in index.html.
// ⚠️ Keep this in sync with the theme if you ever add new brand colors —
// this file is now the single source of truth (the inline config in
// index.html has been removed).
module.exports = {
  content: [
    './index.html',
    './blog/**/*.html',
    './js/**/*.js',
    './privacy.html',
    './terms.html',
    './refund-policy.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['IBM Plex Sans Arabic', 'IBM Plex Sans', 'sans-serif'],
        display: ['Amiri', 'Fraunces', 'serif'],
        mono:    ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        // "برنس" — أخضر زمردي عميق: الثقة والمال المحجوز بأمان
        brand: {
          50: '#EAF5F0', 100: '#CFE9DD', 200: '#9ED0BB', 300: '#6BB699',
          400: '#3D9C7B', 500: '#1F8564', 600: '#12734F', 700: '#0E5C40',
          800: '#0B4732', 900: '#083527',
        },
        // "الختم" — ذهبي نحاسي: قيمة، أمانة، خاتم الضمان
        accent: {
          50: '#FBF3E4', 100: '#F5E3C0', 200: '#ECCB8C', 300: '#E1AF5C',
          400: '#D3993E', 500: '#C08A2E', 600: '#A06F22', 700: '#7D561B',
          800: '#5C3F14', 900: '#3E2A0D',
        },
        // "المحضر" — حبر أخضر داكن يكاد يكون أسود: خلفية القبو/الهيرو
        ink: { 700: '#233B32', 800: '#1A2D26', 900: '#12201B' },
        // Reference-image palette (home page hero/products) — navy + turquoise
        navy: {
          50: '#EEF2F8', 100: '#DCE3F0', 200: '#B3C1DC', 300: '#8A9FC8',
          400: '#4F6293', 500: '#2E4166', 600: '#223355', 700: '#1B2A4A',
          800: '#16213E', 900: '#0F1830',
        },
        turquoise: {
          50: '#E7FBF8', 100: '#C7F5EE', 200: '#93EBDE', 300: '#5CDBC9',
          400: '#2DC7B4', 500: '#14B8A6', 600: '#0D9488', 700: '#0B7A70',
        },
      },
    },
  },
  safelist: [
    // Classes only ever assembled dynamically in JS template strings (e.g.
    // `bg-${color}-600`) won't be picked up by the content scanner's regex
    // matching in every case — list any you notice missing after a build
    // here rather than fighting the JIT scanner.
  ],
};
