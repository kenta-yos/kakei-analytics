import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ground: "#F4F3EF",
        card: "#FFFFFF",
        line: "#E3E1DB",
        line2: "#EEECE6",
        field: "#D4D1C9",
        ink: "#1B1C1E",
        ink2: "#3A3C40",
        sub: "#5D6066",
        mute: "#8A8D93",
        accent: "#1F5F8B",
        "accent-deep": "#164766",
        "accent-soft": "#E6EEF5",
        "accent-line": "#BCD2E4",
        invest: "#8FB8D8",
        over: "#B4530A",
        "over-fill": "#C8661C",
        "over-soft": "#FBEBDD",
        band: "#8A8D93",
        faint: "#B9BBBF",
        panel: "#F7F6F2",
        seg: "#E8E6E0",
      },
      fontFamily: {
        sans: ["var(--font-plex)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
