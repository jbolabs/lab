import { createPrivateKey, createPublicKey } from "node:crypto";
import { Redacted } from "effect";

/** Adapt Alchemy's persisted P-256 PEM pair to Web Push's base64url format. */
export function vapidPublicKey(pem: string): string {
  const key = createPublicKey(pem).export({ format: "jwk" });
  if (key.crv !== "P-256" || !key.x || !key.y) throw new Error("Web Push requires a P-256 key");
  return Buffer.concat([Buffer.from([4]), Buffer.from(key.x, "base64url"), Buffer.from(key.y, "base64url")]).toString("base64url");
}

export function vapidPrivateKey(pem: Redacted.Redacted<string>): Redacted.Redacted<string> {
  const key = createPrivateKey(Redacted.value(pem)).export({ format: "jwk" });
  if (key.crv !== "P-256" || !key.d) throw new Error("Web Push requires a P-256 key");
  return Redacted.make(key.d);
}
