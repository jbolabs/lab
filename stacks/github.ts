/**
 * What CI deploys with: a `production` environment (main only) holding the
 * prod deploy token, a `preview` environment holding a token without access
 * to the mail zones, and the `preview` label that asks for a PR preview.
 *
 * An operator applies it from a trusted machine, never from CI:
 *   npm run ci:deploy
 * Rotate both tokens before they expire by bumping `generation`.
 */
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as GitHub from "@alchemy.run/github";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { accountId, accountResource, mailZoneResources } from "./config.ts";

const owner = "jbolabs";
const repository = "lab";
const generation = 1;
const expiresOn = "2027-10-05T23:59:59Z";

/** What the prod stack deploys with, in the order the live token was created with. */
const productionPermissions = [
	"Account Settings Read",
	"Account Settings Write",
	"Workers Scripts Write",
	"Workers R2 Storage Write",
	"D1 Write",
	"Queues Write",
	"Workers Observability Write",
	// The Cloudflare state store.
	"Secrets Store Write",
	"Workers AI Read",
	"Images Write",
	"Email Sending Write",
	// The prod stack mints the app's own zone-scoped runtime token.
	"Account API Tokens Write",
] satisfies Cloudflare.ApiToken.PermissionGroupRef[];

/** A preview stage has no mail domains and mints no tokens. */
const prodOnly = new Set<string>([
	"Account Settings Write",
	"Email Sending Write",
	"Account API Tokens Write",
]);
const previewPermissions = productionPermissions.filter(
	(permission) => !prodOnly.has(permission)
);

/** The token and account id a CI environment deploys with. */
const deployCredentials = Effect.fn(function* deployCredentials(
	id: string,
	environment: GitHub.Environment,
	token: Cloudflare.ApiToken.AccountApiToken
) {
	yield* GitHub.Secret(`${id}CloudflareToken`, {
		environment,
		name: "CLOUDFLARE_API_TOKEN",
		owner,
		repository,
		value: token.value,
	});
	yield* GitHub.Variable(`${id}CloudflareAccount`, {
		environment,
		name: "CLOUDFLARE_ACCOUNT_ID",
		owner,
		repository,
		value: accountId,
	});
});

export default Alchemy.Stack(
	"mailflare-ci",
	{
		providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
		state: Cloudflare.state({ accountId }),
	},
	Effect.gen(function* ci() {
		if ((yield* Alchemy.Stage) !== "ci") {
			return yield* Effect.die(new Error("Deploy this stack with --stage ci"));
		}
		const environment = yield* yield* Cloudflare.CloudflareEnvironment;
		if (environment.accountId !== accountId) {
			return yield* Effect.die(
				new Error(`CI deploys only to Cloudflare account ${accountId}`)
			);
		}

		const production = yield* GitHub.Environment("ProductionEnvironment", {
			deploymentBranchPolicy: { customBranchPolicies: ["main"] },
			name: "production",
			owner,
			repository,
		});
		const productionToken = yield* Cloudflare.ApiToken.AccountApiToken(
			`ProductionDeployToken${generation}`,
			{
				accountId,
				expiresOn,
				name: `mailflare-production-deploy-g${generation}`,
				policies: [
					{
						effect: "allow",
						permissionGroups: productionPermissions,
						resources: { [accountResource]: "*" },
					},
					{
						effect: "allow",
						permissionGroups: [
							"Zone Read",
							"Zone Settings Write",
							"DNS Write",
							"Workers Routes Write",
							"Email Routing Rules Write",
						],
						resources: { [accountResource]: mailZoneResources },
					},
				],
			}
		);
		yield* deployCredentials("Production", production, productionToken);

		const preview = yield* GitHub.Environment("PreviewEnvironment", {
			name: "preview",
			owner,
			repository,
		});
		const previewToken = yield* Cloudflare.ApiToken.AccountApiToken(
			`PreviewDeployToken${generation}`,
			{
				accountId,
				expiresOn,
				name: `lab-preview-deploy-g${generation}`,
				policies: [
					{
						effect: "allow",
						permissionGroups: previewPermissions,
						resources: { [accountResource]: "*" },
					},
				],
			}
		);
		yield* deployCredentials("Preview", preview, previewToken);

		yield* GitHub.Label("PreviewLabel", {
			color: "1f6feb",
			description: "Deploy this pull request to its own pr-<number> stage",
			name: "preview",
			owner,
			repository,
		});

		return { environments: ["production", "preview"] };
	})
);
