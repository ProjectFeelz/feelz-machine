/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      backdropBlur: {
        '2xl': '40px',
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.5)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.5)',
        'glow-green': '0 0 20px rgba(16, 185, 129, 0.3)',
      },
      fontSize: {
        // Mobile-first overrides — used with the `base` screen (default)
        // These slot in between Tailwind's defaults so existing classes still work
        // Usage: text-sm stays text-sm, but renders slightly larger on mobile
        // via the html font-size scale below
      },
    },
    screens: {
      // Keep Tailwind's defaults but expose them explicitly
      // so the fontSize plugin can target them
      'sm':  '640px',
      'md':  '768px',
      'lg':  '1024px',
      'xl':  '1280px',
      '2xl': '1536px',
    },
  },
  plugins: [
    // Scale the root font size on mobile only.
    // All rem-based Tailwind sizes (text-sm, text-xs, text-base etc.)
    // inherit from this automatically — no !important, no overrides needed.
    function({ addBase }) {
      addBase({
        // Mobile default: 17px base (Tailwind default is 16px)
        // This makes every rem-based size ~6% larger on mobile
        'html': { fontSize: '17px' },

        // At md breakpoint and above, restore to standard 16px
        '@media (min-width: 768px)': {
          'html': { fontSize: '16px' },
        },
      });
    },
  ],
}
