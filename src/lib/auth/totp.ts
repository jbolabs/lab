/**
 * RFC 6238 TOTP over Web Crypto, with no dependency. HMAC-SHA1, 30-second
 * steps, six digits: the profile every authenticator app implements.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let output = "";
	for (const byte of bytes) {
		// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
			output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) {
		// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
		output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
	}
	return output;
}

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
	const clean = input.toUpperCase().replaceAll(/[^A-Z2-7]/gu, "");
	const bytes: number[] = [];
	let bits = 0;
	let value = 0;
	for (const char of clean) {
		// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
		value = (value << 5) | BASE32_ALPHABET.indexOf(char);
		bits += 5;
		if (bits >= 8) {
			// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
			bytes.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	const out = new Uint8Array(new ArrayBuffer(bytes.length));
	out.set(bytes);
	return out;
}

/** 160-bit secret, the size RFC 4226 recommends for HMAC-SHA1. */
export function generateTotpSecret(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return base32Encode(bytes);
}

const DIGITS = 6;

export async function hotp(secret: string, counter: number): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		base32Decode(secret),
		{ hash: "SHA-1", name: "HMAC" },
		false,
		["sign"]
	);
	const message = new Uint8Array(8);
	// Big-endian 64-bit counter; the high word stays zero for any sane clock.
	let remaining = counter;
	for (let index = 7; index >= 0; index -= 1) {
		// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
		message[index] = remaining & 255;
		remaining = Math.floor(remaining / 256);
	}
	const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
	const lastByte = digest.at(-1);
	if (lastByte === undefined) {
		throw new Error("HMAC returned an empty digest");
	}
	// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
	const offset = lastByte & 15;
	const binary =
		// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
		((digest[offset] & 127) << 24) |
		// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
		((digest[offset + 1] & 255) << 16) |
		// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
		((digest[offset + 2] & 255) << 8) |
		// oxlint-disable-next-line eslint/no-bitwise -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations.
		(digest[offset + 3] & 255);
	return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

const STEP_SECONDS = 30;

export function totpCounter(at: number = Date.now()): number {
	return Math.floor(at / 1000 / STEP_SECONDS);
}

export async function totp(
	secret: string,
	at: number = Date.now()
): Promise<string> {
	return await hotp(secret, totpCounter(at));
}

export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let diff = 0;
	for (let index = 0; index < a.length; index += 1) {
		// oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-code-point -- RFC 4226 Base32 packing and HOTP truncation require exact integer bit operations. Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
		diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}
	return diff === 0;
}

/**
 * Accept the current step and one on either side, so a phone whose clock is a
 * few seconds off still works. Comparison is constant-time.
 */
export async function verifyTotp(
	secret: string,
	code: string,
	at: number = Date.now()
): Promise<boolean> {
	const candidate = code.replaceAll(/\s+/gu, "");
	if (!/^\d{6}$/u.test(candidate)) {
		return false;
	}
	const counter = totpCounter(at);
	let matched = false;
	for (const delta of [-1, 0, 1]) {
		const expected = await hotp(secret, counter + delta);
		if (timingSafeEqual(expected, candidate)) {
			matched = true;
		}
	}
	return matched;
}

/** The URI authenticator apps read from a QR code (Google Authenticator key format). */
export function buildOtpauthUrl(input: {
	issuer: string;
	account: string;
	secret: string;
}): string {
	const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
	const params = new URLSearchParams({
		algorithm: "SHA1",
		digits: String(DIGITS),
		issuer: input.issuer,
		period: String(STEP_SECONDS),
		secret: input.secret,
	});
	return `otpauth://totp/${label}?${params.toString()}`;
}
