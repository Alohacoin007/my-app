import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Boyd Sports palette
        navy: {
          DEFAULT: "#0a2545", // header/footer/banner deep navy
          dark: "#061a33",
          tile: "#1c4587", // sport icon tile background
        },
        orange: {
          DEFAULT: "#f5a623", // primary CTA / login / place bet
          dark: "#d18d12",
          light: "#fbbe50",
        },
        link: {
          DEFAULT: "#1d6fb8", // bright blue used for times / "More Bets"
        },
        chip: {
          DEFAULT: "#eceff3", // odds card grey
          border: "#d6dae0",
        },
        page: "#ffffff",
        soft: "#f4f6f8",
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
      boxShadow: {
        slip: "0 -8px 24px rgba(0,0,0,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
