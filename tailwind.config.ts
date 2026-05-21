import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Alpexa-MT5 inspired palette
        brand: {
          DEFAULT: "#2563eb", // header blue
          dark: "#1d4ed8",
          soft: "#3b82f6",
          ghost: "rgba(255,255,255,0.18)",
        },
        ink: {
          DEFAULT: "#0f172a", // primary text
          mid: "#475569",
          soft: "#94a3b8",
          line: "#e2e8f0",
        },
        surface: {
          DEFAULT: "#ffffff",
          soft: "#f4f6fa",
          chip: "#f1f5f9",
        },
        up: {
          DEFAULT: "#16a34a",
          soft: "#dcfce7",
        },
        down: {
          DEFAULT: "#dc2626",
          soft: "#fee2e2",
        },
        nfl: {
          DEFAULT: "#92400e",
          soft: "#fef3c7",
        },
        mlb: {
          DEFAULT: "#9f1239",
          soft: "#ffe4e6",
        },
        nba: {
          DEFAULT: "#9a3412",
          soft: "#ffedd5",
        },
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
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        slip: "0 -12px 32px rgba(15, 23, 42, 0.18)",
        card: "0 1px 0 #e2e8f0",
      },
    },
  },
  plugins: [],
};

export default config;
