/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
      extend: {
        fontFamily: {
          sans: ['Inter', 'sans-serif'],
          cinzel: ['Cinzel', 'serif'],
        },
        colors: {
          // Оставляем стандартные настройки
          border: "hsl(var(--border))",
          input: "hsl(var(--input))",
          ring: "hsl(var(--ring))",
          background: "hsl(var(--background))",
          foreground: "hsl(var(--foreground))",
          primary: {
            DEFAULT: "hsl(var(--primary))",
            foreground: "hsl(var(--primary-foreground))",
          },
          // === ГЛАВНЫЙ ФОКУС ===
          // Подменяем оранжевую палитру на ТВОЮ ФИОЛЕТОВУЮ.
          // Все старые файлы теперь станут фиолетовыми сами собой.
          orange: {
            50: '#faf5ff',
            100: '#f3e8ff',
            200: '#e9d5ff',
            300: '#d8b4fe',
            400: '#c084fc',
            500: '#a855f7', // <-- Основной фиолетовый
            600: '#9333ea', 
            700: '#7e22ce',
            800: '#6b21a8',
            900: '#581c87',
            950: '#3b0764',
          }
        },
        keyframes: {
          "accordion-down": {
            from: { height: "0" },
            to: { height: "var(--radix-accordion-content-height)" },
          },
          "accordion-up": {
            from: { height: "var(--radix-accordion-content-height)" },
            to: { height: "0" },
          },
          float: {
            '0%, 100%': { transform: 'translateY(0px)' },
            '50%': { transform: 'translateY(-10px)' }
          },
          "pulse-glow": {
             // Свечение тоже делаем фиолетовым
            '0%, 100%': { boxShadow: '0 0 20px rgba(147, 51, 234, 0.5), 0 0 40px rgba(147, 51, 234, 0.3)' },
            '50%': { boxShadow: '0 0 10px rgba(147, 51, 234, 0.2), 0 0 20px rgba(147, 51, 234, 0.1)' }
          }
        },
        animation: {
          "accordion-down": "accordion-down 0.2s ease-out",
          "accordion-up": "accordion-up 0.2s ease-out",
          "float": "float 6s ease-in-out infinite",
          "pulse-glow": "pulse-glow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          "spin-slow": "spin 8s linear infinite",
        },
      },
    },
    plugins: [require("tailwindcss-animate")],
}