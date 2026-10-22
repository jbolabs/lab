import type { McpPrincipal } from "./types";

// Only server-created Request objects can carry this context; external headers cannot forge it.
const internalPrincipals = new WeakMap<Request, McpPrincipal>();
export function attachMcpPrincipal(request: Request, principal: McpPrincipal) { internalPrincipals.set(request, principal); return request; }
export function getInternalMcpPrincipal(request: Request) { return internalPrincipals.get(request); }
