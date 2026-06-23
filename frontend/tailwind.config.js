/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pine: {
          950: '#0E1F17',
          900: '#16291F',
          800: '#1F3A2C',
          700: '#2C4F3C',
        },
        sprout: {
          400: '#9FD66B',
          500: '#86C454',
        },
        harvest: {
          400: '#E8B865',
        },
        mist: '#EEF3EC',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'serif'],
        body: ['var(--font-ibm-plex-sans)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
