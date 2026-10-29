import { authorizeDrive } from "@/lib/drive/auth";
import { createDriveFile, DriveFailure } from "@/lib/drive/documents";
import { normalizeDriveName } from "@/lib/drive/utils";

export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	try {
		const body = (await request.json()) as {
			name?: unknown;
			content?: unknown;
			parentId?: unknown;
		};
		const name = normalizeDriveName(body.name);
		if (!name || typeof body.content !== "string") {
			throw new DriveFailure("Enter a document name and content");
		}
		return Response.json(
			await createDriveFile(auth.env, auth.user.id, {
				content: new TextEncoder().encode(body.content),
				contentType: "text/markdown",
				name: /\.(?:md|markdown)$/iu.test(name)
					? name
					: `${name.slice(0, 252)}.md`,
				parentId: typeof body.parentId === "string" ? body.parentId : undefined,
			})
		);
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof DriveFailure
						? error.message
						: "Could not create document",
			},
			{ status: error instanceof DriveFailure ? error.status : 400 }
		);
	}
}
