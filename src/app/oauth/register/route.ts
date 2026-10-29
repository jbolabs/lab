import { getEnv } from "@/lib/cloudflare";
import { oauthError } from "@/lib/oauth/config";
import { registerClient } from "@/lib/oauth/protocol";

export async function POST(request: Request) {
	try {
		return await registerClient(getEnv(), request);
	} catch (error) {
		return oauthError(error);
	}
}
export { preflight as OPTIONS } from "@/lib/oauth/config";
