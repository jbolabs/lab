import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
	...ultracite,
	ignorePatterns: [
		...(ultracite.ignorePatterns ?? []),
		"cloudflare-env.d.ts",
		"next-env.d.ts",
		"drizzle/**",
		".next*/**",
		"dist/**",
		"**/node_modules/**",
		"src/lib/migrations/bundle.json",
		"public/**",
		"data/**",
	],
	// App-code majority: tabs, double quotes, semicolons (including UI primitives).
	semi: true,
	singleQuote: false,
	// Load Tailwind v4 tokens and utilities for class sorting.
	sortTailwindcss: {
		functions: ["clsx", "cva", "tw", "twMerge", "cn", "twJoin", "tv"],
		stylesheet: "src/app/globals.css",
	},
	useTabs: true,
});
