/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{jsx,tsx,js,ts}', './index.html'],
  theme: {
    extend: {
      colors: {
        navy:      '#1C2333',
        sand:      '#D6B58A',
        slate:     '#5F667A',
        steel:     '#8A90A2',
        offwhite:  '#EDEBE7',
        lightgray: '#E6E6E6',
      },
    },
  },
  plugins: [],
}
