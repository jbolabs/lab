/**
 * Optional app settings a stage can be deployed with. Each is read from the
 * stack's environment (`.env` locally; the `production` environment's secrets
 * in CI, passed to the deploy step) and bound only when set, so an unset
 * setting leaves the feature off rather than binding an empty string.
 */
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

/** Bound as Worker secrets. */
export const secretSettings = [
	"AI_API_KEY",
	"APNS_PRIVATE_KEY",
	"AWS_SECRET_ACCESS_KEY",
	"B2_APPLICATION_KEY",
	"RESEND_API_KEY",
	"S3_SECRET_ACCESS_KEY",
	"TURNSTILE_SECRET_KEY",
] as const;

/** Bound as plain text. */
export const plainSettings = [
	"AI_BASE_URL",
	"AI_MODEL",
	"APNS_KEY_ID",
	"APNS_RELAY_URL",
	"APNS_TEAM_ID",
	"AWS_ACCESS_KEY_ID",
	"AWS_REGION",
	"B2_BUCKET",
	"B2_ENDPOINT",
	"B2_KEY_ID",
	"S3_ACCESS_KEY_ID",
	"S3_BUCKET",
	"S3_REGION",
] as const;

/** The settings that are set, ready to spread into a Worker's `env`. */
export const settings = Effect.fn(function* settings() {
	const env: Record<string, string | Redacted.Redacted<string>> = {};
	for (const name of secretSettings) {
		const value = yield* Config.option(Config.Redacted(name));
		if (Option.isSome(value) && Redacted.value(value.value).trim()) {
			env[name] = value.value;
		}
	}
	for (const name of plainSettings) {
		const value = yield* Config.option(Config.String(name));
		if (Option.isSome(value) && value.value.trim()) {
			env[name] = value.value.trim();
		}
	}
	return env;
});
