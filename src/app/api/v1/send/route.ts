import { NextResponse } from "next/server";

import { getSendErrorStatus } from "@/app/api/send/error-utils";
import { authenticateApiKey, requireScope } from "@/lib/api/auth";
import { getEnv } from "@/lib/cloudflare";
import { decodeBase64Content } from "@/lib/email/attachments";
import { sendEmail } from "@/lib/email/send";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { readJsonBody } from "@/lib/http/request";
import { sendEmailSchema } from "@/lib/validators";

export async function POST(request: Request) {
	const env = getEnv();
	const auth = await authenticateApiKey(
		env,
		request.headers.get("authorization")
	);
	if (!auth || !requireScope(auth.scopes, "send")) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await readJsonBody(request, 40 * 1024 * 1024);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return NextResponse.json({ error: "Invalid send request" }, { status });
	}
	const parsed = sendEmailSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.flatten() },
			{ status: 400 }
		);
	}
	if (auth.mailboxIds && !auth.mailboxIds.includes(parsed.data.mailboxId)) {
		return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
	}

	try {
		const { attachments, ...fields } = parsed.data;
		const result = await sendEmail(env, {
			userId: auth.userId,
			...fields,
			attachments: attachments?.map((attachment) => ({
				content: decodeBase64Content(attachment.contentBase64),
				disposition: "attachment",
				filename: attachment.filename,
				type: attachment.type,
			})),
			publicOrigin: new URL(request.url).origin,
		});
		return NextResponse.json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Send failed";
		return NextResponse.json(
			{ error: message },
			{ status: getSendErrorStatus(message) }
		);
	}
}
