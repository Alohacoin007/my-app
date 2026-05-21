import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Boyd Gaming–inspired palette: deep black background, red primary, gold accent
        bg: {
          DEFAULT: "#0a0a0a",
          surface: "#141414",
          elevated: "#1c1c1c",
          border: "#2a2a2a",
        },
        brand: {
          DEFAULT: "#c8102e", // Boyd red
          dark: "#8c0a20",
          light: "#e63c54",
        },
        gold: {
          DEFAULT: "#d4a64a",
          dark: "#a8842f",
        },
        muted: "#9ca3af",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
