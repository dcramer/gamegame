/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tailwind v4 uses CSS-first configuration via @theme in globals.css
  // This config file is mostly for compatibility with tools that expect it
  content: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
};
