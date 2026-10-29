import { accountId } from "./config.ts";

/** The normal release command is CI-only, main-only, and opt-in after the handoff plan. */
export function assertReleaseEnvironment(env) {
	if (
		env.CI !== "true" ||
		env.GITHUB_REPOSITORY !== "jbolabs/lab" ||
		env.GITHUB_REF !== "refs/heads/main" ||
		!["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)
	) {
		throw new Error(
			"Production releases run only from jbolabs/lab main in GitHub Actions"
		);
	}
	if (env.DEPLOYS_ENABLED !== "true") {
		throw new Error(
			"Production deployment is disabled until the ownership handoff is authorized"
		);
	}
	if (env.CLOUDFLARE_ACCOUNT_ID !== accountId || !env.CLOUDFLARE_API_TOKEN) {
		throw new Error(
			"Production requires the installation account and its environment-scoped deploy token"
		);
	}
}
