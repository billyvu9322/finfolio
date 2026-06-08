/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // FinFolio brand placeholders — tune in Sprint 1.
        brand: {
          DEFAULT: '#10b981',
          dark: '#059669',
        },
        profit: '#16a34a',
        loss: '#dc2626',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
