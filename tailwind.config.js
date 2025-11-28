/** @type {import('tailwindcss').Config} */
export default {
  // Цей розділ вказує Tailwind, які файли потрібно сканувати на наявність класів
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Включає ваш App.jsx
  ],
  theme: {
    // Тут можна додавати власні кольори, шрифти тощо
    extend: {},
  },
  plugins: [],
}