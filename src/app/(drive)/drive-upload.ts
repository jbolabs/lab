import { authFetch, getAuthHeaders } from "@/lib/auth/client";

const PART_RETRIES = 3;

async function readError(response: Response): Promise<Error> {
	const data = (await response.json().catch(() => null)) as {
		error?: string;
	} | null;
	return new Error(data?.error ?? `Upload failed (${response.status})`);
}

// XMLHttpRequest rather than fetch, because only it reports upload progress. Browsers that do not
// compute the length still finish the part; progress then moves once per part.
function putPart(
	url: string,
	chunk: Blob,
	onBytes: (loaded: number) => void
): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<undefined>();
	{
		const request = new XMLHttpRequest();
		request.open("PUT", url);
		for (const [name, value] of getAuthHeaders({
			"Content-Type": "application/octet-stream",
		})) {
			request.setRequestHeader(name, value);
		}

		request.upload.addEventListener("progress", (event) => {
			if (event.lengthComputable) {
				onBytes(event.loaded);
			}
		});
		request.addEventListener("load", () => {
			if (request.status >= 200 && request.status < 300) {
				resolve(undefined);
				return;
			}
			let message: string | undefined;
			try {
				message = (JSON.parse(request.responseText) as { error?: string })
					.error;
			} catch {
				/* not JSON */
			}
			reject(new Error(message ?? `Upload failed (${request.status})`));
		});
		request.addEventListener("error", () =>
			reject(new Error("Upload failed: network error"))
		);
		request.addEventListener("abort", () =>
			reject(new Error("Upload cancelled"))
		);
		request.send(chunk);
	}
	return promise;
}

/**
 * Uploads a file in parts, each sent as a raw request body. Not multipart/form-data: the runtime treats every
 * multipart POST as a server action and rejects anything over 1 MB.
 *
 * The server remembers which parts arrived. Interrupted uploads (lost connection, closed tab) are not discarded:
 * picking the same file again, same name, size and modified time, into the same folder continues after the last stored part.
 */
export async function uploadDriveFile(
	file: File,
	parentId: string | null,
	onProgress: (percent: number, resumed: boolean) => void
): Promise<void> {
	const start = await authFetch("/api/drive/upload", {
		body: JSON.stringify({
			contentType: file.type || "application/octet-stream",
			fingerprint: String(file.lastModified),
			name: file.name,
			parentId,
			size: file.size,
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	if (!start.ok) {
		throw await readError(start);
	}
	const session = (await start.json()) as {
		id?: string;
		partSize?: number;
		parts?: number;
		uploaded?: number[];
		resumed?: boolean;
		complete?: boolean;
	};
	if (session.complete) {
		return;
	}
	const { id, partSize, parts } = session as {
		id: string;
		partSize: number;
		parts: number;
	};
	const stored = new Set(session.uploaded);
	const resumed = !!session.resumed;
	const partBytes = (index: number) =>
		Math.max(0, Math.min(partSize, file.size - index * partSize));
	let sent = [...stored].reduce(
		(total, part) => total + partBytes(part - 1),
		0
	);
	// Held at 99% until the server has assembled the parts.
	const report = (bytes: number) =>
		onProgress(
			file.size ? Math.min(99, Math.floor((bytes / file.size) * 100)) : 99,
			resumed
		);
	report(sent);
	for (let index = 0; index < parts; index += 1) {
		if (stored.has(index + 1)) {
			continue;
		}
		const sentBeforePart = sent;
		const chunk = file.slice(index * partSize, (index + 1) * partSize);
		for (let attempt = 1; ; attempt += 1) {
			try {
				// oxlint-disable-next-line no-await-in-loop -- Multipart upload resumes and persists each completed part before advancing to the next part.
				await putPart(
					`/api/drive/upload/${id}?part=${index + 1}`,
					chunk,
					(loaded) => report(sentBeforePart + loaded)
				);
				break;
			} catch (error) {
				if (attempt >= PART_RETRIES) {
					throw error;
				}
			}
		}
		sent += chunk.size;
		report(sent);
	}
	const finish = await authFetch(`/api/drive/upload/${id}`, { method: "POST" });
	if (!finish.ok) {
		throw await readError(finish);
	}
}
