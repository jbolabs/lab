// Captures one page group for the UI hill-climb: screenshots per viewport and colour scheme,
// slowed-down filmstrips of interactions with the animations they ran, and hard metrics
// (axe violations, layout shift, long frames, console errors) that compare.mjs gates on.
//
//   node scripts/ui-scan/capture.mjs --group mail --label before [--base http://localhost:3017]
//     [--only pages|interactions]
//
// Output: .ui-scan/<label>/<group>/{<viewport>-<scheme>/*.png, interactions/**, metrics.json}

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { parseArgs } from "node:util";

import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "playwright";

import { GROUPS, SCHEMES, VIEWPORTS } from "./pages.mjs";

const { join } = nodePath;
// Best-effort CDP calls and the filmstrip's racing trigger may fail without consequence.
const ignore = () => null;

const { values: args } = parseArgs({
	options: {
		base: { default: "http://localhost:3017", type: "string" },
		email: { default: "admin@example.com", type: "string" },
		group: { type: "string" },
		label: { default: "current", type: "string" },
		only: { type: "string" },
		password: { default: "demo-password-change-me", type: "string" },
	},
});

const group = GROUPS[args.group];
if (!group) {
	console.error(`--group must be one of: ${Object.keys(GROUPS).join(", ")}`);
	process.exit(1);
}

const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = join(ROOT, ".ui-scan", args.label, args.group);
mkdirSync(OUT, { recursive: true });

// Slow animations 10x so stills taken ~100ms apart land ~10ms of animation time apart.
const PLAYBACK_RATE = 0.1;
const FILMSTRIP_FRAMES = 10;
const FILMSTRIP_GAP_MS = 120;

// Installed before any page script runs: collects layout shifts and frame durations.
const INSTRUMENT = () => {
	window.__uiScan = { cls: 0, frames: [] };
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			if (!entry.hadRecentInput) {
				window.__uiScan.cls += entry.value;
			}
		}
	}).observe({ buffered: true, type: "layout-shift" });
	let last = performance.now();
	const tick = (now) => {
		window.__uiScan.frames.push(now - last);
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
};

const ANIMATIONS = () =>
	document.getAnimations().map((a) => {
		const { effect } = a;
		const timing = effect?.getComputedTiming?.() ?? {};
		const keyframes = effect?.getKeyframes?.() ?? [];
		const target = effect?.target;
		return {
			delay: timing.delay,
			duration: timing.duration,
			easing: timing.easing ?? keyframes[0]?.easing,
			name: a.animationName ?? a.transitionProperty ?? a.id ?? "",
			properties: [
				...new Set(
					keyframes.flatMap((k) =>
						Object.keys(k).filter(
							(p) =>
								!["offset", "easing", "composite", "computedOffset"].includes(p)
						)
					)
				),
			],
			target: target
				? `${target.tagName.toLowerCase()}${target.dataset?.slot ? `[data-slot=${target.dataset.slot}]` : ""}${target.className && typeof target.className === "string" ? `.${target.className.split(/\s+/u).slice(0, 3).join(".")}` : ""}`
				: "",
			type: a.constructor.name,
		};
	});

async function newContext(
	browser,
	viewportName,
	scheme,
	storageState,
	reducedMotion = "no-preference"
) {
	const { safeArea, ...options } = VIEWPORTS[viewportName];
	const context = await browser.newContext({
		...options,
		colorScheme: scheme,
		reducedMotion,
		storageState,
	});
	await context.addInitScript(INSTRUMENT);
	return { context, safeArea };
}

async function emulateStandalone(page, safeArea) {
	const cdp = await page.context().newCDPSession(page);
	await cdp
		.send("Emulation.setEmulatedMedia", {
			features: [{ name: "display-mode", value: "standalone" }],
		})
		.catch(ignore);
	if (safeArea) {
		await cdp
			.send("Emulation.setSafeAreaInsetsOverride", { insets: safeArea })
			.catch(ignore);
	}
	return cdp;
}

// One image per filmstrip so a judge reads the motion in a single look. Needs ffmpeg.
function contactSheet(dir, viewportName) {
	const tile =
		viewportName === "phone"
			? "scale=iw/4:-1,tile=6x2"
			: "scale=iw/3:-1,tile=4x3";
	const result = spawnSync(
		"ffmpeg",
		[
			"-y",
			"-loglevel",
			"error",
			"-pattern_type",
			"glob",
			"-i",
			join(dir, "frame-*.png"),
			"-vf",
			tile,
			"-frames:v",
			"1",
			join(dir, "sheet.png"),
		],
		{ stdio: "inherit" }
	);
	if (result.error) {
		console.warn("ffmpeg not found; skipping contact sheet");
	}
}

async function settle(page) {
	await page.waitForLoadState("networkidle").catch(ignore);
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(400);
}

async function login(browser) {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${args.base}/login`);
	// Filling before hydration posts nothing.
	await page.waitForLoadState("networkidle");
	await page.fill("#email", args.email);
	await page.fill("#password", args.password);
	await page.click('button[type="submit"]');
	await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
		timeout: 30_000,
	});
	const state = await context.storageState();
	await context.close();
	return state;
}

async function measure(page) {
	const axe = await new AxeBuilder({ page })
		.disableRules(["region"])
		.analyze()
		.catch((error) => ({ error: String(error), violations: [] }));
	const scan = await page.evaluate(() => window.__uiScan);
	const frames = scan?.frames.slice(5) ?? [];
	return {
		axe: axe.violations.map((v) => ({
			id: v.id,
			impact: v.impact,
			nodes: v.nodes.length,
		})),
		cls: Number((scan?.cls ?? 0).toFixed(4)),
		horizontalOverflow: await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth + 1
		),
		longFrames: frames.filter((f) => f > 34).length,
	};
}

async function capturePages(browser, storageState, metrics) {
	for (const viewportName of Object.keys(VIEWPORTS)) {
		for (const scheme of SCHEMES) {
			const dir = join(OUT, `${viewportName}-${scheme}`);
			mkdirSync(dir, { recursive: true });
			const { context, safeArea } = await newContext(
				browser,
				viewportName,
				scheme,
				storageState
			);
			for (const spec of group.pages) {
				const page = await context.newPage();
				const errors = [];
				page.on("pageerror", (e) => errors.push(String(e.message)));
				page.on("console", (m) => {
					// Failed loads are recorded with their URL by the response listener.
					if (
						m.type() === "error" &&
						!m.text().startsWith("Failed to load resource")
					) {
						errors.push(m.text().slice(0, 300));
					}
				});
				page.on("response", (r) => {
					if (r.status() >= 400) {
						errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
					}
				});
				await emulateStandalone(page, safeArea);
				await page.goto(`${args.base}${spec.path}`);
				await settle(page);
				if (spec.open) {
					await spec.open(page);
					await settle(page);
				}
				await page.screenshot({ path: join(dir, `${spec.name}.png`) });
				metrics.pages[`${spec.name}@${viewportName}-${scheme}`] = {
					...(await measure(page)),
					consoleErrors: errors,
					url: new URL(page.url()).pathname,
				};
				await page.close();
			}
			await context.close();
		}
	}
}

async function openAt(
	browser,
	viewportName,
	storageState,
	spec,
	reducedMotion
) {
	const { context, safeArea } = await newContext(
		browser,
		viewportName,
		"light",
		storageState,
		reducedMotion
	);
	const page = await context.newPage();
	const cdp = await emulateStandalone(page, safeArea);
	await page.goto(`${args.base}${spec.path}`);
	await settle(page);
	if (spec.setup) {
		await spec.setup(page);
		await settle(page);
	}
	return { cdp, context, page };
}

async function captureInteraction(browser, storageState, spec, viewportName) {
	const dir = join(OUT, "interactions", `${spec.name}@${viewportName}`);
	mkdirSync(dir, { recursive: true });

	// Real-speed pass: frame timing and what animated.
	let { cdp, context, page } = await openAt(
		browser,
		viewportName,
		storageState,
		spec
	);
	await page.evaluate(() => {
		window.__uiScan.frames = [];
	});
	await spec.trigger(page);
	await page.waitForTimeout(50);
	const animations = await page.evaluate(ANIMATIONS);
	await page.waitForTimeout(800);
	const { longFrames } = await measure(page);
	await context.close();

	// Slow-motion pass for the filmstrip.
	({ cdp, context, page } = await openAt(
		browser,
		viewportName,
		storageState,
		spec
	));
	await cdp.send("Animation.enable");
	await cdp.send("Animation.setPlaybackRate", { playbackRate: PLAYBACK_RATE });
	await page.screenshot({ path: join(dir, "frame-00.png") });
	const trigger = spec.trigger(page);
	for (let i = 1; i <= FILMSTRIP_FRAMES; i += 1) {
		await page.waitForTimeout(FILMSTRIP_GAP_MS);
		await page.screenshot({
			path: join(dir, `frame-${String(i).padStart(2, "0")}.png`),
		});
	}
	await trigger.catch(ignore);
	await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
	await page.waitForTimeout(300);
	await page.screenshot({ path: join(dir, "frame-end.png") });
	await context.close();
	contactSheet(dir, viewportName);

	// Reduced motion: the same trigger should not move or scale things across the screen.
	({ context, page } = await openAt(
		browser,
		viewportName,
		storageState,
		spec,
		"reduce"
	));
	await spec.trigger(page);
	await page.waitForTimeout(50);
	const reducedAnimations = await page.evaluate(ANIMATIONS);
	const reducedMotion = reducedAnimations.filter((a) =>
		a.properties.some((p) => ["transform", "translate", "scale"].includes(p))
	);
	await context.close();

	return { animations, longFrames, reducedMotion };
}

async function captureInteractions(browser, storageState, metrics) {
	for (const spec of group.interactions) {
		for (const viewportName of spec.viewports ?? Object.keys(VIEWPORTS)) {
			const key = `${spec.name}@${viewportName}`;
			try {
				metrics.interactions[key] = await captureInteraction(
					browser,
					storageState,
					spec,
					viewportName
				);
			} catch (error) {
				// A broken interaction is a finding, not a reason to lose the whole capture.
				metrics.interactions[key] = {
					animations: [],
					error: String(error.message).split("\n")[0],
					longFrames: 0,
					reducedMotion: [],
				};
				console.warn(
					`interaction ${key} failed: ${metrics.interactions[key].error}`
				);
			}
		}
	}
}

const browser = await chromium.launch();
try {
	const storageState = group.auth === false ? undefined : await login(browser);
	const metrics = {
		base: args.base,
		capturedAt: new Date().toISOString(),
		group: args.group,
		interactions: {},
		pages: {},
	};
	if (args.only !== "interactions") {
		await capturePages(browser, storageState, metrics);
	}
	if (args.only !== "pages") {
		await captureInteractions(browser, storageState, metrics);
	}
	writeFileSync(
		join(OUT, "metrics.json"),
		`${JSON.stringify(metrics, null, "\t")}\n`
	);
	console.log(`captured ${args.group} → ${OUT}`);
} finally {
	await browser.close();
}
