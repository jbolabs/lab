import { getEnv } from "@/lib/cloudflare";
import { tokenEndpoint } from "@/lib/oauth/protocol";
import { oauthError, preflight } from "@/lib/oauth/config";
export async function POST(request: Request) { try { return await tokenEndpoint(getEnv(), request); } catch (error) { return oauthError(error); } }
export const OPTIONS = preflight;
