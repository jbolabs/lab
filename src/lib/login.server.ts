import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hasAdminAccount } from "@/lib/auth/setup";
import { getEnv } from "@/lib/cloudflare";
import { cookies } from "@/lib/http/request";
import { redirect } from "@/lib/navigation";

export async function loadLogin(search: { add?: string; returnTo?: string }) {
	const params = search;
	const adding = params.add === "1";
	const returnTo = params.returnTo?.startsWith("/oauth/authorize?")
		? params.returnTo
		: undefined;
	const env = getEnv();
	if (!(await hasAdminAccount(env))) {
		redirect("/setup");
	}
	const cookieStore = await cookies();
	const user = await getUserFromSession(
		env,
		cookieStore.get(SESSION_COOKIE)?.value
	);
	if (user && !user.disabled && !adding) {
		redirect(returnTo ?? "/inbox");
	}

	return { adding, returnTo };
}
