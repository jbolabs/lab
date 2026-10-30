import { getHomeBranding } from "@/app/home-server-utils";
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getEnv } from "@/lib/cloudflare";
import { cookies } from "@/lib/http/request";
import { redirect } from "@/lib/navigation";

export async function loadHome() {
	const env = getEnv();
	const cookieStore = await cookies();
	const user = await getUserFromSession(
		env,
		cookieStore.get(SESSION_COOKIE)?.value
	);
	if (!user || user.disabled) {
		redirect("/login");
	}

	const branding = await getHomeBranding();
	return {
		branding,
		user: {
			avatarKey: user.avatarKey,
			email: user.email,
			id: user.id,
			name: user.name,
			role: user.role,
		},
	};
}
