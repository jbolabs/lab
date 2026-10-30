import { useLoaderData } from "@tanstack/react-router";

import { AuthGuard } from "@/components/auth/auth-guard";

import { LoginClient } from "./login-client";

export default function LoginPage() {
	const { adding, returnTo } = useLoaderData({ strict: false }) as {
		adding: boolean;
		returnTo?: string;
	};

	return (
		<AuthGuard mode="public" allowAuthenticated={adding || !!returnTo}>
			<LoginClient returnTo={returnTo} adding={adding} />
		</AuthGuard>
	);
}
