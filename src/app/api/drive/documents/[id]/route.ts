import { authorizeDrive } from "@/lib/drive/auth";
import {
	DriveFailure,
	readDocument,
	saveDocument,
} from "@/lib/drive/documents";

interface Params {
	params: Promise<{ id: string }>;
}
function failure(error: unknown) {
	return Response.json(
		{
			error:
				error instanceof DriveFailure
					? error.message
					: "Document operation failed",
		},
		{ status: error instanceof DriveFailure ? error.status : 400 }
	);
}
export async function GET(request: Request, { params }: Params) {
	const resolvedParams = await params;

	const auth = await authorizeDrive(request);
	if (auth.error) {
		return auth.error;
	}
	try {
		return Response.json(
			await readDocument(auth.env, auth.user.id, resolvedParams.id),
			{ headers: { "Cache-Control": "no-store" } }
		);
	} catch (error) {
		return failure(error);
	}
}
export async function PUT(request: Request, { params }: Params) {
	const resolvedParams = await params;

	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	try {
		const body = (await request.json()) as {
			content?: unknown;
			expectedRevision?: unknown;
		};
		if (
			typeof body.content !== "string" ||
			typeof body.expectedRevision !== "string"
		) {
			throw new DriveFailure("Content and current revision are required");
		}
		return Response.json(
			await saveDocument(
				auth.env,
				auth.user.id,
				resolvedParams.id,
				body.content,
				body.expectedRevision
			)
		);
	} catch (error) {
		return failure(error);
	}
}
