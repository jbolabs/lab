import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertReleaseEnvironment } from "../deployment/release-policy.mjs";

assertReleaseEnvironment(process.env);
const root = fileURLToPath(new URL("..", import.meta.url));
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
execFileSync("bun", ["node_modules/alchemy/bin/cli.js", "deploy", "alchemy.run.ts", "--stage", "prod", "--yes", "--no-input"], { cwd: fileURLToPath(new URL("../deployment", import.meta.url)), stdio: "inherit" });
