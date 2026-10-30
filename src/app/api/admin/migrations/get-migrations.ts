import { getMigrationStatus } from "@/lib/migrations/service";

import { authorizeMigrationRequest } from "./utils";

export async function GET(request: Request) {
	const authorization = await authorizeMigrationRequest(request);
	if (authorization.error) {
		return authorization.error;
	}

	try {
		return Response.json(await getMigrationStatus(authorization.env.DB));
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not check database migrations",
			},
			{ status: 500 }
		);
	}
}
