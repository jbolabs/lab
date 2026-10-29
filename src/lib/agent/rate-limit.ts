export async function allowAgentRequest(env: CloudflareEnv, key: string) {
	if (!env.AGENT_RATE_LIMIT) {
		return true;
	}
	try {
		return await env.AGENT_RATE_LIMIT.limit({ key }).then(
			(resolved) => resolved.success
		);
	} catch {
		return false;
	}
}
