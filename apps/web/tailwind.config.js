/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep forest green (primary brand) — from the design reference.
        brand: {
          50: '#f2f6f1',
          100: '#e0e9de',
          200: '#c3d3bf',
          300: '#9fb699',
          400: '#6f8f68',
          500: '#4c6b46',
          600: '#35502f',
          700: '#2a3f26',
          800: '#22321f',
          900: '#1c211a',
        },
        // Copper / tan (secondary accent) — from the design reference.
        copper: {
          50: '#fbf5ee',
          100: '#f5e6d5',
          200: '#eccdab',
          300: '#dfae79',
          400: '#d09455',
          500: '#c08a5a',
          600: '#ad7846',
          700: '#8f5f38',
          800: '#744d30',
          900: '#603f2a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.9rem',
      },
    },
  },
  plugins: [],
};
