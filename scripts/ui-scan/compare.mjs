// Hard gate for a hill-climb step: exits 1 if the candidate capture regressed any objective
// metric against the baseline. The rubric score decides whether a step helped; this decides
// whether it is allowed at all.
//
//   node scripts/ui-scan/compare.mjs --group mail --base before --head after

import { readFileSync } from "node:fs";
import nodePath from "node:path";
import { parseArgs } from "node:util";

import { GROUPS } from "./pages.mjs";

const { join } = nodePath;

const { values: args } = parseArgs({
	options: {
		base: { type: "string" },
		group: { type: "string" },
		head: { type: "string" },
	},
});

const ROOT = new URL("../..", import.meta.url).pathname;
const load = (label) =>
	JSON.parse(
		readFileSync(
			join(ROOT, ".ui-scan", label, args.group, "metrics.json"),
			"utf-8"
		)
	);
const base = load(args.base);
const head = load(args.head);

const SERIOUS = new Set(["serious", "critical"]);
const serious = (m) =>
	m.axe.filter((v) => SERIOUS.has(v.impact)).reduce((n, v) => n + v.nodes, 0);

const failures = [];
const notes = [];

if (base.git?.dirty !== false) {
	failures.push(
		`baseline "${args.base}" was captured with uncommitted changes under src/ (or before captures recorded git state); recapture it from a clean tree`
	);
}

// Pages dropped from the manifest since the baseline (see UNSCANNED) are not regressions.
const scanned = new Set(GROUPS[args.group].pages.map((page) => page.name));

for (const [key, b] of Object.entries(base.pages)) {
	if (!scanned.has(key.split("@")[0])) {
		continue;
	}
	const h = head.pages[key];
	if (!h) {
		failures.push(`${key}: missing from head capture`);
		continue;
	}
	if (serious(h) > serious(b)) {
		failures.push(`${key}: serious axe nodes ${serious(b)} → ${serious(h)}`);
	}
	if (h.cls > b.cls + 0.02) {
		failures.push(`${key}: CLS ${b.cls} → ${h.cls}`);
	}
	if (h.horizontalOverflow && !b.horizontalOverflow) {
		failures.push(`${key}: now overflows horizontally`);
	}
	if (h.consoleErrors.length > b.consoleErrors.length) {
		failures.push(
			`${key}: console errors ${b.consoleErrors.length} → ${h.consoleErrors.length}: ${h.consoleErrors.at(-1)}`
		);
	}
	if (serious(h) < serious(b)) {
		notes.push(`${key}: serious axe nodes ${serious(b)} → ${serious(h)}`);
	}
}

for (const [key, b] of Object.entries(base.interactions)) {
	const h = head.interactions[key];
	if (!h) {
		failures.push(`${key}: interaction missing from head capture`);
		continue;
	}
	if (h.error && !b.error) {
		failures.push(`${key}: interaction now fails: ${h.error}`);
	}
	// Headless frame timing is noisy; only flag a clear jump.
	if (h.longFrames > b.longFrames + 3) {
		failures.push(`${key}: long frames ${b.longFrames} → ${h.longFrames}`);
	}
	if (h.reducedMotion.length > b.reducedMotion.length) {
		failures.push(
			`${key}: ${h.reducedMotion.length} transform animations still run under reduced motion`
		);
	}
}

for (const n of notes) {
	console.log(`improved  ${n}`);
}
for (const f of failures) {
	console.log(`REGRESSED ${f}`);
}
console.log(failures.length ? "gate: FAIL" : "gate: PASS");
process.exit(failures.length ? 1 : 0);
