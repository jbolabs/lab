import { hasAdminAccount } from "@/lib/auth/setup";
import { getEnv } from "@/lib/cloudflare";
import { getSetupRequirementChecks } from "@/lib/setup/configuration";

export async function POST() {
	const env = getEnv();
	if (await hasAdminAccount(env)) {
		return Response.json(
			{ error: "Initial setup is already complete" },
			{ status: 403 }
		);
	}

	const checks = getSetupRequirementChecks(env);
	const ready = checks.every((check) => check.configured);
	return Response.json({ checks }, { status: ready ? 200 : 503 });
}
