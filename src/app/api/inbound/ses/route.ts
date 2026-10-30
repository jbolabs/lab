import { requireAwsConfig } from "@/lib/aws/config";
import { deleteObject, getObject } from "@/lib/aws/s3";
import { parseSesNotification, safeEqual } from "@/lib/aws/ses-notification";
import type { SnsEnvelope } from "@/lib/aws/ses-notification";
import {
	getSesReceivingState,
	SES_OBJECT_PREFIX,
} from "@/lib/aws/ses-receiving";
import { getEnv } from "@/lib/cloudflare";
import { intakeProviderMail } from "@/lib/email/provider-intake";

/**
 * Amazon SNS endpoint for SES inbound mail. SNS posts JSON as text/plain.
 * Trust comes from three things rather than SNS's certificate signature: the
 * secret token in the URL that only the subscription we created knows, the topic
 * ARN matching ours, and the message itself being read from our own S3 bucket
 * with our credentials, so a forged notification cannot inject content.
 */
export async function POST(request: Request) {
	const env = getEnv();
	const state = await getSesReceivingState(env);
	const token = new URL(request.url).searchParams.get("token") ?? "";
	if (!state || !safeEqual(token, state.token)) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}

	let envelope: SnsEnvelope;
	try {
		envelope = JSON.parse(await request.text()) as SnsEnvelope;
	} catch {
		return Response.json({ error: "Invalid body" }, { status: 400 });
	}
	if (envelope.TopicArn !== state.topicArn) {
		return Response.json({ error: "Unknown topic" }, { status: 403 });
	}

	if (envelope.Type === "SubscriptionConfirmation") {
		const url = envelope.SubscribeURL ? new URL(envelope.SubscribeURL) : null;
		if (
			!url ||
			url.protocol !== "https:" ||
			!/^sns\.[a-z0-9-]+\.amazonaws\.com$/u.test(url.hostname)
		) {
			return Response.json(
				{ error: "Invalid subscription URL" },
				{ status: 400 }
			);
		}
		const confirmed = await fetch(url);
		return Response.json(
			{ confirmed: confirmed.ok },
			{ status: confirmed.ok ? 200 : 502 }
		);
	}
	if (envelope.Type !== "Notification") {
		return Response.json({ ignored: true });
	}

	const notification = parseSesNotification(envelope.Message ?? "");
	if (!notification) {
		return Response.json({ ignored: true });
	}
	if (
		notification.bucket !== state.bucket ||
		!notification.key.startsWith(SES_OBJECT_PREFIX)
	) {
		return Response.json({ error: "Unexpected object" }, { status: 400 });
	}

	const config = await requireAwsConfig(env);
	if (notification.virusFailed) {
		await deleteObject(config, state.bucket, notification.key);
		return Response.json({ dropped: "Message failed the virus scan" });
	}
	const raw = await getObject(config, state.bucket, notification.key);
	const result = await intakeProviderMail(env, {
		from: notification.from,
		headers: notification.headers,
		raw,
		recipients: notification.recipients,
	});
	// Only after intake succeeded: a failure above returns 500 so SNS retries with the object intact.
	await deleteObject(config, state.bucket, notification.key);
	return Response.json(result);
}
