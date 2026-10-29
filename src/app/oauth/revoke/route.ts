import { getEnv } from "@/lib/cloudflare";
import { oauthError } from "@/lib/oauth/config";
import { revokeToken } from "@/lib/oauth/protocol";

export async function POST(request: Request) {
	try {
		return await revokeToken(getEnv(), request);
	} catch (error) {
		return oauthError(error);
	}
}
export { preflight as OPTIONS } from "@/lib/oauth/config";
