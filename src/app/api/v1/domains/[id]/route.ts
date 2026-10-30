import { authenticateAdminApiKey } from "@/lib/api/admin-auth";
import { getEnv } from "@/lib/cloudflare";
import { getDomainForUser, removeDomainForUser } from "@/lib/domains/service";

interface Params {
	params: Promise<{ id: string }>;
}

async function authorize(request: Request) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "domains");
	if (!auth) {
		return null;
	}
	return auth;
}

export async function GET(request: Request, { params }: Params) {
	const auth = await authorize(request);
	if (!auth) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const domain = await getDomainForUser(getEnv(), auth.userId, id);
	if (!domain) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	return Response.json({ domain });
}

export async function DELETE(request: Request, { params }: Params) {
	const auth = await authorize(request);
	if (!auth) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	try {
		await removeDomainForUser(getEnv(), auth.userId, id);
		return Response.json({ ok: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to remove domain";
		return Response.json({ error: message }, { status: 400 });
	}
}
