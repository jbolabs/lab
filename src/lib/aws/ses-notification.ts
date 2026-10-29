export interface SesNotification {
	from: string;
	recipients: string[];
	bucket: string;
	key: string;
	virusFailed: boolean;
	headers: Record<string, string>;
}

interface RawNotification {
	notificationType?: string;
	mail?: {
		source?: string;
		destination?: string[];
		headers?: { name: string; value: string }[];
	};
	receipt?: {
		recipients?: string[];
		virusVerdict?: { status?: string };
		action?: { type?: string; bucketName?: string; objectKey?: string };
	};
}

/** Reads the JSON an SES S3 receipt action publishes to SNS; null for anything else. */
export function parseSesNotification(message: string): SesNotification | null {
	let parsed: RawNotification;
	try {
		parsed = JSON.parse(message) as RawNotification;
	} catch {
		return null;
	}
	const action = parsed.receipt?.action;
	if (
		parsed.notificationType !== "Received" ||
		action?.type !== "S3" ||
		!action.bucketName ||
		!action.objectKey
	) {
		return null;
	}
	const recipients =
		parsed.receipt?.recipients ?? parsed.mail?.destination ?? [];
	return {
		bucket: action.bucketName,
		from: parsed.mail?.source ?? "",
		headers: Object.fromEntries(
			(parsed.mail?.headers ?? []).map((header) => [
				header.name.toLowerCase(),
				header.value,
			])
		),
		key: action.objectKey,
		recipients,
		virusFailed: parsed.receipt?.virusVerdict?.status === "FAIL",
	};
}

export function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let diff = 0;
	for (let index = 0; index < a.length; index += 1) {
		// oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-code-point -- Compare every signature byte without data-dependent early exits. Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
		diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}
	return diff === 0;
}

export interface SnsEnvelope {
	Type?: string;
	TopicArn?: string;
	Message?: string;
	SubscribeURL?: string;
}
