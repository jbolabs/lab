import { getDb } from "@/db";
import { authenticateApiRequest, hasScope } from "@/lib/api/key-auth";

import { readBlob, storeUpload } from "./blobs";
import { LIMITS } from "./constants";
import { corsHeaders, JmapError, problemResponse } from "./errors";
import { processRequest, sessionState, validateRequest } from "./processor";
import { buildSession } from "./session";
import { getEmailState, getMailboxState } from "./state";
import type { JmapContext } from "./types";

/**
 * Server-sent events. Mailflare has no per-account change log, so the stream
 * sends the current states on connect and again whenever they move, polling
 * every `ping` seconds (default 30, minimum 10) until the client leaves.
 */
function eventSource(ctx: JmapContext, url: URL): Response {
	const ping = Math.max(Number(url.searchParams.get("ping") || 30), 10);
	const closeAfter = url.searchParams.get("closeafter") === "state";
	const encoder = new TextEncoder();
	let last = "";
	let timer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;

	const stream = new ReadableStream<Uint8Array>({
		cancel() {
			stopped = true;
			if (timer) {
				clearTimeout(timer);
			}
		},
		async start(controller) {
			const emit = async () => {
				const email = await getEmailState(ctx);
				const mailbox = await getMailboxState(ctx, email);
				if (stopped) {
					return;
				}
				const state = `${mailbox}|${email}`;
				if (state === last) {
					controller.enqueue(
						encoder.encode(`event: ping\ndata: {"interval": ${ping}}\n\n`)
					);
				} else {
					last = state;
					const changed = {
						[ctx.accountId]: { Email: email, Mailbox: mailbox, Thread: email },
					};
					controller.enqueue(
						encoder.encode(
							`event: state\ndata: ${JSON.stringify({ "@type": "StateChange", changed })}\n\n`
						)
					);
					if (closeAfter) {
						stopped = true;
						controller.close();
					}
				}
				if (!stopped) {
					timer = setTimeout(
						() =>
							emit().catch(() => {
								stopped = true;
							}),
						ping * 1000
					);
				}
			};
			await emit();
		},
	});
	return new Response(stream, {
		headers: {
			"Cache-Control": "no-store",
			Connection: "keep-alive",
			"Content-Type": "text/event-stream",
			...corsHeaders(),
		},
	});
}

const JSON_HEADERS = {
	"Cache-Control": "no-store",
	"Content-Type": "application/json; charset=utf-8",
	...corsHeaders(),
};

/**
 * Entry point for every /jmap/* path and /.well-known/jmap. Returns null for
 * paths it does not own so the caller can fall through.
 */
export async function handleJmapRequest(
	request: Request,
	env: CloudflareEnv
): Promise<Response | null> {
	const url = new URL(request.url);
	const path = url.pathname;

	if (request.method === "OPTIONS") {
		return new Response(null, { headers: corsHeaders(), status: 204 });
	}
	if (path === "/.well-known/jmap") {
		return Response.redirect(`${url.origin}/jmap/session`, 301);
	}
	if (!path.startsWith("/jmap/")) {
		return null;
	}

	const auth = await authenticateApiRequest(env, request);
	if (!auth) {
		return Response.json(
			{ error: "Unauthorized" },
			{
				headers: {
					...JSON_HEADERS,
					"WWW-Authenticate": 'Basic realm="Lab JMAP", Bearer',
				},
				status: 401,
			}
		);
	}
	if (!hasScope(auth.scopes, "jmap")) {
		return Response.json(
			{ error: "This API key does not have the jmap scope" },
			{ headers: JSON_HEADERS, status: 403 }
		);
	}
	const ctx: JmapContext = {
		accountId: auth.userId,
		auth,
		createdIds: {},
		db: getDb(env),
		env,
		origin: env.APP_URL?.trim() || url.origin,
	};

	if (path === "/jmap/session" && request.method === "GET") {
		return Response.json(buildSession(ctx, await sessionState(ctx)), {
			headers: JSON_HEADERS,
		});
	}

	if (path === "/jmap/api" && request.method === "POST") {
		const length = Number(request.headers.get("content-length") ?? 0);
		if (length > LIMITS.maxSizeRequest) {
			return problemResponse("limit", 400, "Request too large", {
				limit: "maxSizeRequest",
			});
		}
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return problemResponse("notJSON", 400, "Body is not valid JSON");
		}
		try {
			const response = await processRequest(ctx, validateRequest(body));
			return Response.json(response, { headers: JSON_HEADERS });
		} catch (error) {
			if (error instanceof JmapError) {
				return problemResponse(error.type, 400, error.message, error.extra);
			}
			throw error;
		}
	}
	const handleBlobOrEventRequest = async (): Promise<Response | null> => {
		const download = path.match(
			/^\/jmap\/download\/(?<capture1>[^/]+)\/(?<capture2>[^/]+)\/(?<capture3>.*)$/u
		);
		if (download && request.method === "GET") {
			const [, accountId, blobId, rawName] = download;
			if (decodeURIComponent(accountId) !== ctx.accountId) {
				return new Response("Not found", {
					headers: corsHeaders(),
					status: 404,
				});
			}
			const blob = await readBlob(ctx, decodeURIComponent(blobId));
			if (!blob) {
				return new Response("Not found", {
					headers: corsHeaders(),
					status: 404,
				});
			}
			const name = decodeURIComponent(rawName) || blob.name || "blob";
			const type = url.searchParams.get("type") || blob.type;
			return new Response(blob.body, {
				headers: {
					"Cache-Control": "private, max-age=3600",
					"Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
					"Content-Length": String(blob.size),
					"Content-Security-Policy": "default-src 'none'; sandbox",
					"Content-Type": type,
					...corsHeaders(),
				},
			});
		}

		const upload = path.match(/^\/jmap\/upload\/(?<capture1>[^/]+)$/u);
		if (upload && request.method === "POST") {
			if (decodeURIComponent(upload[1]) !== ctx.accountId) {
				return problemResponse("accountNotFound", 404, "Unknown account");
			}
			const type =
				request.headers.get("content-type") || "application/octet-stream";
			const disposition = request.headers.get("content-disposition") ?? "";
			const name =
				disposition.match(
					/filename\*?=(?:UTF-8'')?"?(?<capture1>[^";]+)"?/iu
				)?.[1] ?? null;
			const stored = await storeUpload(
				ctx,
				await request.arrayBuffer(),
				type,
				name ? decodeURIComponent(name) : null
			);
			if (!stored) {
				return problemResponse("limit", 413, "Upload too large", {
					limit: "maxSizeUpload",
				});
			}
			return Response.json(stored, {
				headers: JSON_HEADERS,
				status: 201,
			});
		}

		if (path === "/jmap/eventsource" && request.method === "GET") {
			return eventSource(ctx, url);
		}

		return Response.json(
			{ error: "Not found" },
			{
				headers: JSON_HEADERS,
				status: 404,
			}
		);
	};
	return await handleBlobOrEventRequest();
}
