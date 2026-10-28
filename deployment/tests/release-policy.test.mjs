import { AlchemyContext } from "alchemy/AlchemyContext";
import { Context, Effect, Layer } from "effect";
import { sharedStateContext } from "../shared-state.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertReleaseEnvironment } from "../release-policy.mjs";
import { publishesDmarc } from "../mail-domain-flags.ts";
import { mailDomains } from "../config.ts";

const release = { CI: "true", GITHUB_REPOSITORY: "jbolabs/mailflare", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "push", DEPLOYS_ENABLED: "true", CLOUDFLARE_ACCOUNT_ID: "984b82870acd18daf8bda97bad966b38", CLOUDFLARE_API_TOKEN: "fixture-not-a-credential" };
test("only an enabled main release with the correct production account is accepted", () => {
 assert.doesNotThrow(() => assertReleaseEnvironment(release));
 for (const change of [{ CI: "false" }, { GITHUB_REPOSITORY: "someone/fork" }, { GITHUB_REF: "refs/pull/4/merge" }, { GITHUB_EVENT_NAME: "pull_request" }, { DEPLOYS_ENABLED: "false" }, { CLOUDFLARE_ACCOUNT_ID: "another-account" }, { CLOUDFLARE_API_TOKEN: "" }]) assert.throws(() => assertReleaseEnvironment({ ...release, ...change }));
});
test("the actual deploy entry refuses an unconfigured shell before building or invoking Alchemy", () => {
 const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../scripts/deploy-production.mjs", import.meta.url))], { env: { PATH: process.env.PATH }, encoding: "utf8" });
 assert.equal(result.status, 1); assert.match(result.stderr, /Production releases run only/);
});
test("the imported mail domains preserve externally owned DMARC and studio routing", () => {
 const shoulder = mailDomains.find(domain => domain.name === "shouldertap.app");
 assert.equal(shoulder.ownsDmarc, false);
 assert.equal(publishesDmarc(shoulder), false);
 assert.equal(shoulder.zoneId, "67ca54dc8d4b36bf46486ad14875914d");
 assert.equal(mailDomains.find(domain => domain.name === "jbolabs.com").ownsRouting, false);
 assert.equal(mailDomains.find(domain => domain.name === "pcobooster.com").ownsDmarc, true);
});

test("the retired version-upload entry cannot publish a release", () => {
 const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../scripts/upload-disabled.mjs", import.meta.url))], { env: { PATH: process.env.PATH }, encoding: "utf8" });
 assert.equal(result.status, 1); assert.match(result.stderr, /Version uploads are retired/);
});

test("application --yes cannot enable updates of the shared state store", async () => {
 const cli = { dotAlchemy: '.alchemy', dev: false, adopt: true, updateStateStore: true };
 const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const scoped = yield* Layer.build(sharedStateContext);
  return { state: Context.get(scoped, AlchemyContext), cli: yield* AlchemyContext };
 }).pipe(Effect.provideService(AlchemyContext, cli))));
 assert.equal(result.state.updateStateStore, false);
 assert.equal(result.state.adopt, true);
 assert.equal(result.state.dotAlchemy, '.alchemy');
 assert.equal(result.cli.updateStateStore, true);
});
