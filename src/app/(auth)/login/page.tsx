import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthGuard } from "@/components/auth/auth-guard";
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hasAdminAccount } from "@/lib/auth/setup";
import { getEnv } from "@/lib/cloudflare";

import { authPageMetadata } from "../auth-metadata";
import { LoginClient } from "./login-client";

export const dynamic = "force-dynamic";

export const generateMetadata = () => authPageMetadata("auth.signIn");

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ add?: string; returnTo?: string }>;
}) {
	const params = await searchParams;
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

	return (
		<AuthGuard mode="public" allowAuthenticated={adding || !!returnTo}>
			<LoginClient returnTo={returnTo} adding={adding} />
		</AuthGuard>
	);
}
