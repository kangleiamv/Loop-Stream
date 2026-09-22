/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#000000',
        foreground: '#ffffff',
        card: '#0a0a0a',
        'card-foreground': '#ffffff',
        primary: '#ffffff',
        'primary-foreground': '#000000',
        secondary: '#171717',
        'secondary-foreground': '#ededed',
        muted: '#171717',
        'muted-foreground': '#a1a1aa',
        accent: '#ffffff',
        'accent-foreground': '#000000',
        destructive: '#ef4444',
        'destructive-foreground': '#ffffff',
        border: 'rgba(255, 255, 255, 0.1)',
        input: 'rgba(255, 255, 255, 0.05)',
        ring: 'rgba(255, 255, 255, 0.5)',
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
        '3xl': '64px',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.6)',
        'glass-glow': '0 0 25px rgba(255, 255, 255, 0.15)',
        'glass-glow-lg': '0 0 40px rgba(255, 255, 255, 0.22)',
      },
    },
  },
  plugins: [],
}