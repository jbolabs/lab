// Renders the iOS launch images (public/startup/*.png) from src/lib/launch/startup-screens.json:
// the jbo tile's ink filling the screen with its mark centred at `markSize` points, so the static
// image iOS shows while the app starts matches the first frame of the launch splash exactly.
// Run after changing the icon or the screen list: node scripts/generate-startup-images.mjs (needs ffmpeg).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { background, markSize, screens } = JSON.parse(readFileSync(join(root, "src/lib/launch/startup-screens.json"), "utf8"));
const outDir = join(root, "public/startup");
mkdirSync(outDir, { recursive: true });

for (const { width, height, ratio } of screens) {
	const w = width * ratio;
	const h = height * ratio;
	const mark = markSize * ratio;
	execFileSync("ffmpeg", [
		"-loglevel", "error", "-y",
		"-f", "lavfi", "-i", `color=c=${background.replace("#", "0x")}:s=${w}x${h}`,
		"-i", join(root, "public/icon-512.png"),
		"-filter_complex", `[1:v]scale=${mark}:${mark}:flags=lanczos[m];[0:v][m]overlay=(W-w)/2:(H-h)/2`,
		"-frames:v", "1",
		join(outDir, `${w}x${h}.png`),
	]);
}
console.log(`Wrote ${screens.length} launch images to public/startup`);
