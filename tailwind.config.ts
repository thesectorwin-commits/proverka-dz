import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FFFEFB',
        gridLine: '#CFE0EC',
        marginRed: '#E2596B',
        ink: '#26364F',
        inkSoft: '#5C7089',
        redPen: '#D6394B',
        redPenSoft: '#F6DADD',
        greenCheck: '#2E9E63',
        greenSoft: '#DFF3E7',
        pencilOrange: '#EE9B3D',
        accent: '#3E7CB1',
        tape: '#F6E4A8',
        goldChalk: '#C9962E',
        // Отдельный, более светлый золотой — именно для кнопки "Войти через
        // Яндекс ID" (в артефакте это НЕ var(--gold)/#C9962E, а отдельный
        // хардкод #E8C468 — два разных золотых цвета в одном макете).
        goldButton: '#E8C468'
      },
      fontFamily: {
        heading: ['Trebuchet MS', '"Segoe UI Rounded"', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', '"SFMono-Regular"', 'Menlo', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
};

export default config;
