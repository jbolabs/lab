export function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		// oxlint-disable-next-line unicorn/prefer-code-point -- Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
	const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	// oxlint-disable-next-line unicorn/prefer-code-point -- Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
	return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function base64Url(bytes: Uint8Array): string {
	return toBase64(bytes)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll(/[=]+$/gu, "");
}

function buffer(bytes: Uint8Array): ArrayBuffer {
	const out = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(out).set(bytes);
	return out;
}

/** A device public key must be an uncompressed P-256 point (65 bytes, 0x04 prefix). */
export function isValidDevicePublicKey(value: string): boolean {
	try {
		const bytes = fromBase64(value);
		return bytes.length === 65 && bytes[0] === 4;
	} catch {
		return false;
	}
}

export interface EncryptedPreview {
	/** Ephemeral public key, raw uncompressed point, base64. */
	epk: string;
	salt: string;
	iv: string;
	/** AES-GCM ciphertext with the 16-byte tag appended, base64. */
	ct: string;
}

/**
 * Crypto for native (APNs) push, on Web Crypto so it runs on Workers and Node.
 *
 * Previews are encrypted per device so Apple never sees sender or subject:
 * an ephemeral P-256 key agrees with the device's registered public key
 * (ECDH), HKDF-SHA256 (random salt, info "mailflare-push-v1") derives an
 * AES-256-GCM key, and the payload carries the ephemeral public key, salt, IV
 * and ciphertext. The app's Notification Service Extension reverses it with
 * the private key it keeps in the Secure Enclave (CryptoKit:
 * `sharedSecret.hkdfDerivedSymmetricKey(using: SHA256, salt:, sharedInfo:, outputByteCount: 32)`).
 */

export const PUSH_HKDF_INFO = "mailflare-push-v1";

export async function encryptPreview(
	devicePublicKey: string,
	plaintext: Uint8Array
): Promise<EncryptedPreview> {
	const recipient = await crypto.subtle.importKey(
		"raw",
		buffer(fromBase64(devicePublicKey)),
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[]
	);
	const ephemeral = (await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"]
	)) as CryptoKeyPair;
	const shared = await crypto.subtle.deriveBits(
		{ name: "ECDH", public: recipient },
		ephemeral.privateKey,
		256
	);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const hkdf = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
		"deriveKey",
	]);
	const key = await crypto.subtle.deriveKey(
		{
			hash: "SHA-256",
			info: new TextEncoder().encode(PUSH_HKDF_INFO),
			name: "HKDF",
			salt: buffer(salt),
		},
		hkdf,
		{ length: 256, name: "AES-GCM" },
		false,
		["encrypt"]
	);
	const ciphertext = await crypto.subtle.encrypt(
		{ iv: buffer(iv), name: "AES-GCM" },
		key,
		buffer(plaintext)
	);
	const epk = new Uint8Array(
		await crypto.subtle.exportKey("raw", ephemeral.publicKey)
	);
	return {
		ct: toBase64(new Uint8Array(ciphertext)),
		epk: toBase64(epk),
		iv: toBase64(iv),
		salt: toBase64(salt),
	};
}

/** Imports an APNs auth key (the .p8 file: PKCS#8 PEM). */
export async function importApnsKey(pem: string): Promise<CryptoKey> {
	// Secrets pasted into dashboards often carry quotes, literal "\n" or CRLFs.
	const body = pem
		.replaceAll(/-----(?<capture1>BEGIN|END) PRIVATE KEY-----/gu, "")
		.replaceAll("\\n", "")
		.replaceAll(/["']/gu, "")
		.replaceAll(/\s+/gu, "");
	return await crypto.subtle.importKey(
		"pkcs8",
		buffer(fromBase64(body)),
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"]
	);
}

/** The provider token APNs expects: an ES256 JWT with the key id and team id. */
export async function signApnsJwt(
	key: CryptoKey,
	keyId: string,
	teamId: string,
	issuedAt = Math.floor(Date.now() / 1000)
): Promise<string> {
	const encoder = new TextEncoder();
	const header = base64Url(
		encoder.encode(JSON.stringify({ alg: "ES256", kid: keyId }))
	);
	const claims = base64Url(
		encoder.encode(JSON.stringify({ iat: issuedAt, iss: teamId }))
	);
	const signature = await crypto.subtle.sign(
		{ hash: "SHA-256", name: "ECDSA" },
		key,
		encoder.encode(`${header}.${claims}`)
	);
	return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
}
