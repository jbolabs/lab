import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AlchemyContext } from "alchemy/AlchemyContext";
import { Context, Effect, Layer } from "effect";

import { mailDomains, mailflare } from "../config.ts";
import { publishesDmarc } from "../mail-domain-flags.ts";
import { assertReleaseEnvironment } from "../release-policy.mjs";
import { sharedStateContext } from "../shared-state.ts";

const release = {
	CI: "true",
	CLOUDFLARE_ACCOUNT_ID: "984b82870acd18daf8bda97bad966b38",
	CLOUDFLARE_API_TOKEN: "fixture-not-a-credential",
	DEPLOYS_ENABLED: "true",
	GITHUB_EVENT_NAME: "push",
	GITHUB_REF: "refs/heads/main",
	GITHUB_REPOSITORY: "jbolabs/lab",
};
test("only an enabled main release with the correct production account is accepted", () => {
	assert.doesNotThrow(() => assertReleaseEnvironment(release));
	for (const change of [
		{ CI: "false" },
		{ GITHUB_REPOSITORY: "someone/fork" },
		{ GITHUB_REF: "refs/pull/4/merge" },
		{ GITHUB_EVENT_NAME: "pull_request" },
		{ DEPLOYS_ENABLED: "false" },
		{ CLOUDFLARE_ACCOUNT_ID: "another-account" },
		{ CLOUDFLARE_API_TOKEN: "" },
	]) {
		assert.throws(() => assertReleaseEnvironment({ ...release, ...change }));
	}
});
test("the actual deploy entry refuses an unconfigured shell before building or invoking Alchemy", () => {
	const result = spawnSync(
		process.execPath,
		[
			fileURLToPath(
				new URL("../../scripts/deploy-production.mjs", import.meta.url)
			),
		],
		{ encoding: "utf-8", env: { PATH: process.env.PATH } }
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Production releases run only/u);
});
test("Lab retains the existing delivery worker during the hostname cutover", () => {
	assert.equal(mailflare.host, "lab.jbolabs.com");
	assert.equal(mailflare.workerName, "mailflare");
	assert.throws(() =>
		assertReleaseEnvironment({
			...release,
			GITHUB_REPOSITORY: "jbolabs/mailflare",
		})
	);
});
test("the imported mail domains preserve externally owned DMARC and studio routing", () => {
	const shoulder = mailDomains.find(
		(domain) => domain.name === "shouldertap.app"
	);
	assert.equal(shoulder.ownsDmarc, false);
	assert.equal(publishesDmarc(shoulder), false);
	assert.equal(shoulder.zoneId, "67ca54dc8d4b36bf46486ad14875914d");
	assert.equal(
		mailDomains.find((domain) => domain.name === "jbolabs.com").ownsRouting,
		false
	);
	assert.equal(
		mailDomains.find((domain) => domain.name === "pcobooster.com").ownsDmarc,
		true
	);
});

test("the retired version-upload entry cannot publish a release", () => {
	const result = spawnSync(
		process.execPath,
		[
			fileURLToPath(
				new URL("../../scripts/upload-disabled.mjs", import.meta.url)
			),
		],
		{ encoding: "utf-8", env: { PATH: process.env.PATH } }
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Version uploads are retired/u);
});

test("application --yes cannot enable updates of the shared state store", async () => {
	const cli = {
		adopt: true,
		dev: false,
		dotAlchemy: ".alchemy",
		updateStateStore: true,
	};
	const result = await Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* result() {
				const scoped = yield* Layer.build(sharedStateContext);
				return {
					cli: yield* AlchemyContext,
					state: Context.get(scoped, AlchemyContext),
				};
			}).pipe(Effect.provideService(AlchemyContext, cli))
		)
	);
	assert.equal(result.state.updateStateStore, false);
	assert.equal(result.state.adopt, true);
	assert.equal(result.state.dotAlchemy, ".alchemy");
	assert.equal(result.cli.updateStateStore, true);
});
