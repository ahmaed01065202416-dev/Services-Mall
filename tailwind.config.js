// Tailwind CLI config — this REPLACES the inline `window.tailwindConfig` +
// `cdn.tailwindcss.com` runtime setup that used to be in index.html.
// ⚠️ Keep this in sync with the theme if you ever add new brand colors —
// this file is now the single source of truth (the inline config in
// index.html has been removed).
module.exports = {
  content: [
    './index.html',
    './about/**/*.html',
    './contact/**/*.html',
    './blog/**/*.html',
    './js/**/*.js',
    './privacy.html',
    './terms.html',
    './refund-policy.html',
    './privacy/**/*.html',
    './terms/**/*.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['IBM Plex Sans Arabic', 'IBM Plex Sans', 'sans-serif'],
        display: ['IBM Plex Sans Arabic', 'IBM Plex Sans', 'sans-serif'],
        mono:    ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
      },
      // ── Design System: "Corporate Modern / High-Trust Precision" ──
      // Ported 1:1 from the Stitch design spec (fintech-grade slate-navy +
      // indigo CTA + emerald/teal escrow trust accents). `navy` and
      // `turquoise` are kept as the names already used everywhere across
      // index.html/js/*.js so the whole app re-themes just by changing the
      // hex values here — no need to touch every template.
      colors: {
        // Slate-navy — structural chrome, dark headers, headline ink
        navy: {
          50: '#F1F5F9', 100: '#E2E8F0', 200: '#CBD5E1', 300: '#94A3B8',
          400: '#64748B', 500: '#475569', 600: '#334155', 700: '#1E293B',
          800: '#131B2E', 900: '#0B1220',
        },
        // Escrow trust — teal/emerald (was turquoise)
        turquoise: {
          50: '#ECFDF5', 100: '#D1FAE5', 200: '#A7F3D0', 300: '#6EE7B7',
          400: '#34D399', 500: '#10B981', 600: '#0D9488', 700: '#0F766E',
        },
        // Primary conversion CTA — indigo
        secondary: {
          DEFAULT: '#4F46E5', 50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE',
          400: '#6366F1', 500: '#4F46E5', 600: '#4338CA', 700: '#3730A3',
        },
        accentblue: '#2563EB',
        // Neutral text / surfaces per DESIGN.md
        surfacecanvas: '#F8FAFC',
        textprimary: '#0F172A',
        textsecondary: '#475569',
        textmuted: '#94A3B8',
        borderline: '#E2E8F0',
        borderstrong: '#CBD5E1',
        // Status
        warn: { DEFAULT: '#F59E0B', subtle: '#FFFBEB' },
        danger: { DEFAULT: '#EF4444', subtle: '#FEF2F2' },
        // legacy aliases kept so nothing referencing them breaks (unused elsewhere)
        brand: {
          50: '#ECFDF5', 100: '#D1FAE5', 200: '#A7F3D0', 300: '#6EE7B7',
          400: '#34D399', 500: '#10B981', 600: '#0D9488', 700: '#0F766E',
          800: '#115E59', 900: '#134E4A',
        },
        accent: {
          50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC',
          400: '#818CF8', 500: '#4F46E5', 600: '#4338CA', 700: '#3730A3',
          800: '#312E81', 900: '#1E1B4B',
        },
        ink: { 700: '#1E293B', 800: '#131B2E', 900: '#0B1220' },
      },
      borderRadius: {
        sm: '0.375rem', DEFAULT: '0.5rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', '2xl': '1rem',
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
