import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#090d16',
        foreground: '#f8fafc',
        card: '#0f172a',
        border: '#1e293b',
        muted: '#1e293b',
        'muted-foreground': '#94a3b8',
        primary: '#6366f1',
        secondary: '#a855f7',
        accent: '#3b82f6',
        success: '#10b981',
        destructive: '#ef4444',
      },
    },
  },
  plugins: [],
};
export default config;
