/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "'Segoe UI'", "system-ui", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
