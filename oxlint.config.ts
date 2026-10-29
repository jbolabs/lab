import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

// components.json discovers src/components/ui and src/app/globals.css;
// tsconfig.json resolves @/* to src/*. Custom @theme colors are read from CSS.
export default defineConfig({
	env: { ...core.env, node: true },
	extends: [core, react, next],
	ignorePatterns: [
		...(core.ignorePatterns ?? []),
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
	jsPlugins: ["@shadcn/lint"],
	overrides: [
		{
			files: ["tests/**"],
			rules: {
				// Test steps mutate shared fixtures (routing state, bindings, D1 rows) in order.
				"no-await-in-loop": "off",
				// assert.throws validators must be synchronous callbacks.
				"promise/prefer-await-to-callbacks": "off",
				// esbuild onResolve/onLoad filters are Go RE2 and reject the `u` flag.
				"require-unicode-regexp": "off",
			},
		},
		{
			files: [
				"src/lib/**",
				"src/app/api/**",
				"src/db/**",
				"worker.ts",
				"server/**",
				"scripts/**",
				"deployment/**",
				"deploy/**",
			],
			rules: {
				// Server work against D1, R2, queues and the Cloudflare/AWS APIs is ordered or rate-limited
				// by design; batching is a per-call decision, not a lint rule. The UI keeps the rule.
				"no-await-in-loop": "off",
			},
		},
		{
			files: ["src/components/ui/**"],
			rules: {
				// Design-system implementations own appearance and structural values.
				"shadcn/no-arbitrary-values": "off",
				"shadcn/no-restyle": "off",
				// Primitives forward caller className, per shadcn adoption guidance.
				"shadcn/require-static-classes": "off",
			},
		},
		{
			files: [
				"src/app/(calendar)/calendar/utils.ts",
				"src/components/message-attachment-card-utils.ts",
				"src/app/(drive)/drive-utils.ts",
			],
			rules: {
				// Data categories use a palette; undeclared tokens and SVG literals still fail.
				"shadcn/no-raw-colors": [
					"error",
					{
						allow: [
							"*-slate-*",
							"*-gray-*",
							"*-zinc-*",
							"*-neutral-*",
							"*-stone-*",
							"*-red-*",
							"*-orange-*",
							"*-amber-*",
							"*-yellow-*",
							"*-lime-*",
							"*-green-*",
							"*-emerald-*",
							"*-teal-*",
							"*-cyan-*",
							"*-sky-*",
							"*-blue-*",
							"*-indigo-*",
							"*-violet-*",
							"*-purple-*",
							"*-fuchsia-*",
							"*-pink-*",
							"*-rose-*",
						],
						scanAllStrings: true,
					},
				],
			},
		},
	],
	rules: {
		// The codebase writes functions and components as declarations; enforce that instead of
		// Ultracite's arrow-function default (same strictness, no 3,000-file rewrite).
		"func-style": ["error", "declaration", { allowArrowFunctions: true }],
		"react/function-component-definition": [
			"error",
			{
				namedComponents: "function-declaration",
				unnamedComponents: "arrow-function",
			},
		],
		"shadcn/no-arbitrary-values": ["error", { allow: ["layout"] }],
		"shadcn/no-inline-styles": "error",
		"shadcn/no-raw-colors": ["error", { scanAllStrings: true }],
		"shadcn/no-restyle": [
			"error",
			{
				allow: ["layout"],
				contracts: [
					// Loading placeholders mirror the dimensions and silhouette of the content they replace.
					{
						allow: [
							"layout",
							"w-*",
							"h-*",
							"min-h-*",
							"max-h-*",
							"size-*",
							"rounded*",
						],
						deny: [],
						pattern: "^Skeleton$",
					},
					// Avatars fit their caller's identity layout while keeping their own surface and fallback.
					{
						allow: ["layout", "w-*", "h-*", "size-*"],
						deny: [],
						pattern: "^Avatar$",
					},
					// Gaps and padding arrange children inside layout containers; controls keep their own padding.
					{
						allow: ["layout", "gap-*", "p-*", "px-*", "py-*", "pr-*", "pl-*"],
						pattern:
							"^(CardHeader|CardFooter|AlertDescription|Field|PageHeaderText|ItemGroup)$",
					},
					// Text editors inset their content; fill, border and radius stay with the primitive.
					{
						allow: [
							"layout",
							"p-*",
							"px-*",
							"py-*",
							"pr-*",
							"pl-*",
							"pt-*",
							"pb-*",
						],
						pattern: "^Textarea$",
					},
					// Field labels must remain easy to tap when they wrap a checkbox or radio control.
					{ allow: ["layout", "min-h-*"], deny: [], pattern: "^FieldLabel$" },
					// Select text truncation prevents long mailbox names from widening the surrounding form.
					{ allow: ["layout", "truncate"], pattern: "^NativeSelect$" },
					// Viewport bounds constrain scrollable overlays; their surfaces stay owned by the primitives.
					{
						allow: ["layout", "h-*", "max-h-*"],
						deny: [],
						pattern: "^(DialogContent|AlertDialogContent|SheetContent)$",
					},
					// A progress bar's thickness follows the surrounding loading layout.
					{ allow: ["layout", "h-*"], deny: [], pattern: "^Progress$" },
					// Contracts match component names, not props: these text colors also
					// pass on non-ghost Buttons. All other appearance remains primitive-owned.
					{
						allow: ["layout", "text-muted-foreground", "text-destructive"],
						pattern: "^Button$",
					},
					{
						allow: ["layout", "text-muted-foreground", "text-destructive"],
						pattern:
							"^(Label|CardDescription|DialogDescription|SheetDescription|DrawerDescription)$",
					},
					{ allow: ["layout", "spacing"], pattern: "^CardContent$" },
					// Card title gaps place optional icons next to text; type scale remains caller-selectable.
					{ allow: ["layout", "font-size", "gap-*"], pattern: "^CardTitle$" },
				],
				// Height belongs to primitives, although shadcn classifies it as layout.
				deny: ["h-*", "min-h-*", "max-h-*", "size-*"],
			},
		],
		"shadcn/no-unknown-classes": "error",
		"shadcn/require-static-classes": "error",
	},
	settings: { shadcn: { ui: "@/components/ui" } },
});
