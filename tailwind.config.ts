import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        night: '#080808',
        card: '#121212',
        'card-alt': '#1A1A1A',
        spotify: '#1DB954',
        gold: '#FFD700',
        'gold-dark': '#B8860B',
      },
    },
  },
  plugins: [],
}

export default config
