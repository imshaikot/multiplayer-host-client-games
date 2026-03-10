import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        bangla: ["var(--font-bangla)", "Hind Siliguri", "sans-serif"],
        display: ["var(--font-display)", "Inter", "sans-serif"],
      },
      colors: {
        ink: "#0a0a0a",
        paper: "#fafaf7",
      },
      boxShadow: {
        card: "0 12px 30px -8px rgba(0,0,0,0.4), 0 4px 8px -2px rgba(0,0,0,0.2)",
      },
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "rotate(-1deg)" },
          "50%": { transform: "rotate(1deg)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
