import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Atlassian-inspired color palette
        'atlassian-blue': '#0052CC',
        'status-todo': '#DFE1E6',
        'status-in-progress': '#0052CC',
        'status-done': '#00875A',
        'priority-highest': '#DE350B',
        'priority-high': '#FF5630',
        'priority-medium': '#FFAB00',
        'priority-low': '#0052CC',
        'priority-lowest': '#6554C0',
        'surface-raised': '#F4F5F7',
        'text-subtle': '#5E6C84',
      },
    },
  },
  plugins: [],
};
export default config;
