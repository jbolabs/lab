import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const bootstrap = createServerFn({ method: "GET" }).handler(async () => {
	const module = await import("./bootstrap.server");
	return module.loadBootstrap();
});
export const home = createServerFn({ method: "GET" }).handler(async () => {
	const module = await import("./home.server");
	return module.loadHome();
});
export const login = createServerFn({ method: "GET" })
	.validator(
		z.object({ add: z.string().optional(), returnTo: z.string().optional() })
	)
	.handler(async ({ data }) => {
		const module = await import("./login.server");
		return module.loadLogin(data);
	});
export const setup = createServerFn({ method: "GET" }).handler(async () => {
	const module = await import("./setup.server");
	return module.loadSetup();
});
export const consent = createServerFn({ method: "GET" })
	.validator(z.object({ request: z.string().optional() }))
	.handler(async ({ data }) => {
		const module = await import("./consent.server");
		return module.loadConsent(data);
	});
