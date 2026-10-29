import { getEnv } from "@/lib/cloudflare";
import { oauthError } from "@/lib/oauth/config";
import { metadata } from "@/lib/oauth/protocol";

export function GET(request: Request) {
	try {
		return metadata(getEnv(), request, true);
	} catch (error) {
		return oauthError(error);
	}
}
export { preflight as OPTIONS } from "@/lib/oauth/config";
