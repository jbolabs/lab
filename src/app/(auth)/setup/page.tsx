import { useLoaderData } from "@tanstack/react-router";

import { OnboardingClient } from "@/app/(auth)/onboarding/onboarding-client";
import { RegisterClient } from "@/app/(auth)/register/register-client";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function SetupPage() {
	const { register } = useLoaderData({ strict: false }) as {
		register: boolean;
	};
	return register ? (
		<AuthGuard mode="public">
			<RegisterClient />
		</AuthGuard>
	) : (
		<AuthGuard requireRole="admin">
			<OnboardingClient />
		</AuthGuard>
	);
}
