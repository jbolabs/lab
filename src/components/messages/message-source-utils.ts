import { authFetch } from "@/lib/auth/client";
import { formatUserDate } from "@/lib/time/utils";

import type {
	AuthenticationSummary,
	MessageSourceSummary,
} from "./message-source-types";

export async function fetchMessageSource(
	messageId: string,
	signal: AbortSignal
): Promise<string> {
	const response = await authFetch(
		`/api/messages/${encodeURIComponent(messageId)}/original`,
		{
			redirectOnUnauthorized: false,
			signal,
		}
	);
	const source = await response.text();
	if (!response.ok) {
		throw new Error(source || "Unable to load original message");
	}
	return source;
}

function readHeaders(source: string): Map<string, string[]> {
	const boundary = source.match(/\r?\n\r?\n/u);
	const headerText =
		boundary?.index === undefined ? source : source.slice(0, boundary.index);
	const headers = new Map<string, string[]>();
	let currentName: string | null = null;
	for (const line of headerText.split(/\r?\n/u)) {
		if (/^[ \t]/u.test(line) && currentName) {
			const values = headers.get(currentName);
			if (values?.length) {
				values[values.length - 1] += ` ${line.trim()}`;
			}
			continue;
		}
		const separator = line.indexOf(":");
		if (separator < 1) {
			currentName = null;
			continue;
		}
		currentName = line.slice(0, separator).toLowerCase();
		const values = headers.get(currentName) ?? [];
		values.push(line.slice(separator + 1).trim());
		headers.set(currentName, values);
	}
	return headers;
}

function firstHeader(
	headers: Map<string, string[]>,
	name: string
): string | null {
	return headers.get(name)?.[0] ?? null;
}

function deliveryDuration(
	headers: Map<string, string[]>,
	sentAt: Date
): string | null {
	const received = firstHeader(headers, "received");
	const receivedDate = received?.slice(received.lastIndexOf(";") + 1).trim();
	if (!received || !receivedDate || !received.includes(";")) {
		return null;
	}
	const deliveredAt = new Date(receivedDate);
	const seconds = Math.round((deliveredAt.getTime() - sentAt.getTime()) / 1000);
	if (!Number.isFinite(seconds) || seconds < 0) {
		return null;
	}
	if (seconds < 60) {
		return `Delivered after ${seconds} ${seconds === 1 ? "second" : "seconds"}`;
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `Delivered after ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
	}
	const hours = Math.round(minutes / 60);
	if (hours < 48) {
		return `Delivered after ${hours} ${hours === 1 ? "hour" : "hours"}`;
	}
	const days = Math.round(hours / 24);
	return `Delivered after ${days} ${days === 1 ? "day" : "days"}`;
}

function authenticationDetail(
	headers: Map<string, string[]>,
	method: "spf" | "dkim" | "dmarc",
	resultHeader: string | undefined
) {
	const section =
		resultHeader
			?.split(";")
			.find((value) =>
				new RegExp(`(?:^|\\s)${method}\\s*=`, "iu").test(value)
			) ?? "";
	if (method === "spf") {
		const ip =
			section.match(/\bclient-ip\s*=\s*(?<capture1>[^\s;)]+)/iu)?.[1] ??
			firstHeader(headers, "received-spf")?.match(
				/\bclient-ip\s*=\s*(?<capture1>[^\s;)]+)/iu
			)?.[1];
		return ip ? `with IP ${ip}` : null;
	}
	if (method === "dkim") {
		const domain =
			section.match(/\bheader\.d\s*=\s*(?<capture1>[^\s;)]+)/iu)?.[1] ??
			firstHeader(headers, "dkim-signature")?.match(
				/(?:^|;)\s*d\s*=\s*(?<capture1>[^\s;)]+)/iu
			)?.[1];
		return domain ? `with domain ${domain}` : null;
	}
	return null;
}

function authResult(
	headers: Map<string, string[]>,
	method: "spf" | "dkim" | "dmarc"
): AuthenticationSummary | null {
	const resultHeader = headers
		.get("authentication-results")
		?.find((value) =>
			new RegExp(`(?:^|[;\\s])${method}\\s*=`, "iu").test(value)
		);
	const result =
		resultHeader?.match(
			new RegExp(`(?:^|[;\\s])${method}\\s*=\\s*([a-z]+)`, "iu")
		)?.[1] ??
		(method === "spf"
			? firstHeader(headers, "received-spf")?.match(
					/^\s*(?<capture1>[a-z]+)/iu
				)?.[1]
			: null);
	if (!result) {
		return null;
	}
	const status = result.toUpperCase();
	if (status !== "PASS") {
		return { detail: null, status };
	}
	return {
		detail: authenticationDetail(headers, method, resultHeader),
		status,
	};
}

export function summarizeMessageSource(source: string): MessageSourceSummary {
	const headers = readHeaders(source);
	const date = firstHeader(headers, "date");
	const parsedDate = date ? new Date(date) : null;
	const validDate =
		parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
	const duration = validDate ? deliveryDuration(headers, validDate) : null;
	return {
		createdAt: validDate
			? `${formatUserDate(validDate, {
					day: "numeric",
					hour: "numeric",
					minute: "2-digit",
					month: "short",
					weekday: "short",
					year: "numeric",
				})}${duration ? ` (${duration})` : ""}`
			: date,
		dkim: authResult(headers, "dkim"),
		dmarc: authResult(headers, "dmarc"),
		from: firstHeader(headers, "from"),
		messageId: firstHeader(headers, "message-id"),
		spf: authResult(headers, "spf"),
		subject: firstHeader(headers, "subject"),
		to: firstHeader(headers, "to"),
	};
}

export function downloadMessageSource(source: string, messageId: string): void {
	const url = URL.createObjectURL(
		new Blob([source], { type: "message/rfc822" })
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = `original-${messageId}.eml`;
	// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Workers HTMLRewriter adds incompatible append overloads to DOM Element.
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyMessageSource(source: string): Promise<void> {
	await navigator.clipboard.writeText(source);
}
