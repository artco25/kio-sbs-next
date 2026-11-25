import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        border: "var(--border)",
        ring: "var(--ring)",
        brand: {
          25: "#f5fdff",
          50: "#ecfbfe",
          100: "#cff6fd",
          200: "#a2eeff",
          300: "#6fe4f8",
          400: "#2fd9f4",
          500: "#14bfdb",
          600: "#0e9bb5",
          700: "#0b7285",
          800: "#0d5b6b",
          900: "#0f4a57",
          950: "#08313a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "1.25rem",
        pill: "9999px",
      },
      boxShadow: {
        card: "0px 4px 6px -1px rgba(0,0,0,0.08), 0px 2px 4px -2px rgba(0,0,0,0.04)",
        float: "0px 12px 24px -8px rgba(0,0,0,0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
