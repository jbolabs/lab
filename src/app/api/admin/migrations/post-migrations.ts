import { applyPendingMigrations } from "@/lib/migrations/service";

import { authorizeMigrationRequest } from "./utils";

export async function POST(request: Request) {
	const authorization = await authorizeMigrationRequest(request);
	if (authorization.error) {
		return authorization.error;
	}

	try {
		return Response.json(await applyPendingMigrations(authorization.env.DB));
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not apply database migrations",
			},
			{ status: 500 }
		);
	}
}
