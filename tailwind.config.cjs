/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./public/**/*.{html,js}",
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            colors: {
                fantasy: {
                    dark: '#0a0f14',
                    bg: '#111827',
                    stone: '#1f2937',
                    moss: '#374151',
                    gold: '#d4af37',
                    'gold-hover': '#b5952f',
                    magic: '#4f46e5',
                    text: '#e5e7eb',
                    muted: '#9ca3af',
                }
            },
            fontFamily: {
                sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
