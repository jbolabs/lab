import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
// shadcn lint owns colour vocabulary, arbitrary appearance values and primitive overrides.
// These checks cover app composition, semantic dark-mode styling and the single stylesheet boundary.
import { test } from "node:test";

const { readdirSync, readFileSync, statSync } = fs;
const { join, relative, sep } = nodePath;

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const UI_DIR = join(SRC, "components", "ui") + sep;

const EXCEPTIONS = {
	heading: new Map([
		["src/app/page.tsx", "home wordmark uses the display face"],
		[
			"src/app/(dashboard)/inbox/[messageId]/page.tsx",
			"the message subject is content, not a page title",
		],
	]),
};

const DARK_RE = /(?<![\w-])dark:[\w[\]/.-]+/gu;
const BW_RE =
	/(?<![\w-])(?:[a-z-]+:)*(?:bg-white|text-black|bg-black(?!\/))\b/gu;
const INPUT_LOOK_RE = /(?<![\w-])border-input\b/gu;
const H1_RE = /<h1\b(?![^>]*className="sr-only")/gu;
const RAW_CONTROL_RE =
	/<(?<capture1>button|select|textarea)\b|<input\b(?![^>]*type="(?:hidden|file)")/gu;

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			walk(path, out);
		} else if (
			/\.(?<capture1>tsx?|jsx?)$/u.test(name) &&
			!name.endsWith(".d.ts")
		) {
			out.push(path);
		}
	}
	return out;
}

const FILES = walk(SRC).filter((path) => !path.startsWith(UI_DIR));
const rel = (path) => relative(ROOT, path).split(sep).join("/");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

function scan(
	re,
	{ skip = () => false, filter = () => true, jsx = false } = {}
) {
	const hits = [];
	for (const path of FILES) {
		const file = rel(path);
		if (skip(file) || (jsx && !/\.[jt]sx$/u.test(file))) {
			continue;
		}
		const text = readFileSync(path, "utf-8");
		for (const match of text.matchAll(re)) {
			if (filter(match, text)) {
				hits.push(`${file}:${lineOf(text, match.index)}  ${match[0]}`);
			}
		}
	}
	return hits;
}

function report(hits, advice) {
	assert.equal(hits.length, 0, `${advice}\n\n${hits.join("\n")}\n`);
}

test("no dark: overrides outside the primitives", () => {
	report(
		scan(DARK_RE),
		"Semantic tokens already switch with the theme; drop the dark: class or add a token in globals.css."
	);
});

test("no white backgrounds, bg-black or text-black", () => {
	report(
		scan(BW_RE),
		"Use bg-background bg-card bg-popover or text-foreground so the dark theme works."
	);
});

test("controls are primitives, not hand-styled elements", () => {
	report(
		scan(RAW_CONTROL_RE, { jsx: true }),
		"Use Button, Input, Textarea, Select/NativeSelect, Checkbox or Item from src/components/ui (asChild for custom triggers)."
	);
	report(
		scan(INPUT_LOOK_RE),
		"border-input is the primitives' field border; use Input, Textarea, InputGroup or NativeSelect instead of restyling a div."
	);
});

test("page titles use PageTitle", () => {
	report(
		scan(H1_RE, { jsx: true, skip: (file) => EXCEPTIONS.heading.has(file) }),
		"Use PageHeader/PageTitle/PageDescription from src/components/ui/page-header.tsx (or an sr-only h1)."
	);
});

test("globals.css is the only stylesheet under src", () => {
	const hits = [];
	function visit(dir) {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) {
				visit(path);
			} else if (
				/\.(?:css|scss|sass|less)$/u.test(name) &&
				rel(path) !== "src/app/globals.css"
			) {
				hits.push(rel(path));
			}
		}
	}
	visit(SRC);
	report(
		hits,
		"Keep all app CSS and named utilities in src/app/globals.css; CSS modules hide design-system and layout drift."
	);
});
