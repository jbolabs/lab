import OAuth2Server from "@node-oauth/oauth2-server";
import { z } from "zod";

import {
	canonicalOrigin,
	hash,
	now,
	OAuthFailure,
	oauthJson,
	OAUTH_SCOPES,
	parseScope,
	secret,
	uniqueParameters,
	validRedirect,
} from "./config";
import { createOAuthServer } from "./model";
import { OAuthStore } from "./store";
import type { Token } from "./store";

const registration = z.object({
	client_name: z.string().trim().min(1).max(100).default("MCP client"),
	grant_types: z
		.array(z.enum(["authorization_code", "refresh_token"]))
		.default(["authorization_code", "refresh_token"]),
	redirect_uris: z
		.array(z.string().max(2048).refine(validRedirect))
		.min(1)
		.max(10),
	response_types: z.array(z.literal("code")).default(["code"]),
	token_endpoint_auth_method: z.literal("none").default("none"),
});

export function metadata(
	env: CloudflareEnv,
	request: Request,
	resource = false
) {
	const origin = canonicalOrigin(env, request);
	return oauthJson(
		resource
			? {
					authorization_servers: [origin],
					bearer_methods_supported: ["header"],
					resource: `${origin}/mcp`,
					scopes_supported: OAUTH_SCOPES,
				}
			: {
					authorization_endpoint: `${origin}/oauth/authorize`,
					authorization_response_iss_parameter_supported: true,
					code_challenge_methods_supported: ["S256"],
					grant_types_supported: ["authorization_code", "refresh_token"],
					issuer: origin,
					registration_endpoint: `${origin}/oauth/register`,
					response_types_supported: ["code"],
					revocation_endpoint: `${origin}/oauth/revoke`,
					scopes_supported: OAUTH_SCOPES,
					token_endpoint: `${origin}/oauth/token`,
					token_endpoint_auth_methods_supported: ["none"],
				}
	);
}

export async function boundedText(request: Request) {
	if (Number(request.headers.get("Content-Length")) > 16_384) {
		throw new OAuthFailure("invalid_request", "Request is too large", 413);
	}
	// Read incrementally so chunked requests cannot bypass the size limit.
	const reader = request.body?.getReader();
	if (!reader) {
		return "";
	}
	let length = 0;
	const chunks: Uint8Array[] = [];
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		length += value.byteLength;
		if (length > 16_384) {
			await reader.cancel();
			throw new OAuthFailure("invalid_request", "Request is too large", 413);
		}
		chunks.push(value);
	}
	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return new TextDecoder().decode(result);
}

export async function registerClient(env: CloudflareEnv, request: Request) {
	canonicalOrigin(env, request);
	const store = new OAuthStore(env.DB);
	await store.rateLimit(request, "register", 20);
	if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
		throw new OAuthFailure("invalid_client_metadata", "Expected JSON");
	}
	const parsed = registration.safeParse(
		await boundedText(request).then((body) => {
			try {
				return JSON.parse(body);
			} catch {
				return null;
			}
		})
	);
	if (
		!parsed.success ||
		!parsed.data.grant_types.includes("authorization_code")
	) {
		throw new OAuthFailure(
			"invalid_client_metadata",
			"Use HTTPS or a loopback redirect and public PKCE authentication"
		);
	}
	const id = `mf_client_${secret()}`;
	await store.cleanup();
	await store.db
		.prepare(
			"INSERT INTO oauth_clients(id, name, redirect_uris, grants, created_at) VALUES (?, ?, ?, ?, ?)"
		)
		.bind(
			id,
			parsed.data.client_name,
			JSON.stringify(parsed.data.redirect_uris),
			JSON.stringify(parsed.data.grant_types),
			now()
		)
		.run();
	return oauthJson(
		{ ...parsed.data, client_id: id, client_id_issued_at: now() },
		201
	);
}

export async function validateAuthorization(
	env: CloudflareEnv,
	request: Request
) {
	const origin = canonicalOrigin(env, request);
	const parameters = new URL(request.url).searchParams;
	if (parameters.toString().length > 8192) {
		throw new OAuthFailure("invalid_request", "Request is too large");
	}
	const p = uniqueParameters(parameters);
	const client = await new OAuthStore(env.DB).client(p.client_id || "");
	if (!client) {
		throw new OAuthFailure("invalid_client", "Unknown client");
	}
	if (
		!p.redirect_uri ||
		!(JSON.parse(client.redirect_uris) as string[]).includes(p.redirect_uri)
	) {
		throw new OAuthFailure(
			"invalid_request",
			"Redirect URI does not match registration"
		);
	}
	if (p.response_type !== "code") {
		throw new OAuthFailure(
			"unsupported_response_type",
			"Only authorization codes are supported"
		);
	}
	if (p.resource !== `${origin}/mcp`) {
		throw new OAuthFailure(
			"invalid_target",
			"Resource must identify this MCP server"
		);
	}
	if (
		p.code_challenge_method !== "S256" ||
		!/^[A-Za-z0-9_-]{43}$/u.test(p.code_challenge || "")
	) {
		throw new OAuthFailure("invalid_request", "S256 PKCE is required");
	}
	const scopes = parseScope(p.scope ?? null);
	return {
		client,
		origin,
		parameters: { ...p, scope: scopes.join(" ") },
		scopes,
	};
}

export async function tokenEndpoint(env: CloudflareEnv, request: Request) {
	const origin = canonicalOrigin(env, request);
	const store = new OAuthStore(env.DB);
	await store.rateLimit(request, "token", 300);
	if (
		!request.headers
			.get("Content-Type")
			?.startsWith("application/x-www-form-urlencoded")
	) {
		throw new OAuthFailure("invalid_request", "Expected form encoding");
	}
	const rawBody = await boundedText(request);
	const body = uniqueParameters(new URLSearchParams(rawBody));
	if (!["authorization_code", "refresh_token"].includes(body.grant_type)) {
		throw new OAuthFailure("unsupported_grant_type", "Unsupported grant type");
	}
	if (body.resource !== `${origin}/mcp`) {
		throw new OAuthFailure(
			"invalid_target",
			"Resource must identify this MCP server"
		);
	}
	if (
		!body.client_id ||
		body.client_secret ||
		request.headers.has("Authorization")
	) {
		throw new OAuthFailure(
			"invalid_client",
			"Use the registered public client ID"
		);
	}
	const server = createOAuthServer(store, body.resource, body.client_id);
	const response = new OAuth2Server.Response();
	try {
		await server.token(
			new OAuth2Server.Request({
				body,
				headers: {
					"content-length": String(
						new TextEncoder().encode(rawBody).byteLength
					),
					"content-type": "application/x-www-form-urlencoded",
				},
				method: "POST",
				query: {},
			}),
			response
		);
	} catch (error) {
		if (!(error instanceof OAuth2Server.OAuthError) || error.code >= 500) {
			throw error;
		}
		return oauthJson(
			{ error: error.name, error_description: error.message },
			error.code
		);
	}
	return oauthJson(response.body, response.status || 200);
}

export async function revokeToken(env: CloudflareEnv, request: Request) {
	const origin = canonicalOrigin(env, request);
	const store = new OAuthStore(env.DB);
	await store.rateLimit(request, "revoke", 100);
	const p = uniqueParameters(new URLSearchParams(await boundedText(request)));
	if (!p.client_id || !p.token || request.headers.has("Authorization")) {
		throw new OAuthFailure(
			"invalid_request",
			"Client ID and token are required"
		);
	}
	const digest = await hash(p.token);
	const row = await store.db
		.prepare(
			"SELECT * FROM oauth_tokens WHERE refresh_hash = ? OR access_hash = ?"
		)
		.bind(digest, digest)
		.first<Token>();
	const grant = row ? await store.grant(row.key_id, `${origin}/mcp`) : null;
	if (grant?.client_id === p.client_id) {
		await store.revoke(grant.key_id);
	}
	return oauthJson({});
}
