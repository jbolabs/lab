import { getEnv } from "@/lib/cloudflare";
import { metadata } from "@/lib/oauth/protocol";
import { oauthError, preflight } from "@/lib/oauth/config";
export function GET(request: Request) { try { return metadata(getEnv(), request, false); } catch (error) { return oauthError(error); } }
export const OPTIONS = preflight;
