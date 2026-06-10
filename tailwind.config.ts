import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
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
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        display: ['Syne', 'Arial Black', 'sans-serif'],
      },
      borderRadius: { card: '8px' },
    },
  },
  plugins: [],
}

export default config
