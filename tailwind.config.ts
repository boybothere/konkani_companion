import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    // @ts-ignore
    safelist: [
        "bg-amber-500/15",
        "bg-amber-500/20",
        "bg-amber-400/25",
        "border-amber-500/50",
        "border-amber-500/40",
        "border-amber-400",
        "text-amber-300",
        "text-amber-100",
        "bg-amber-500",
        "bg-amber-400",
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};

export default config;