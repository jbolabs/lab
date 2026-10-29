import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import type { SesReceivingState } from "@/lib/aws/aws-types";
import { AwsError } from "@/lib/aws/client";
import { requireAwsConfig, SES_RECEIVING_REGIONS } from "@/lib/aws/config";
import {
	bucketExists,
	createBucket,
	putBucketPolicy,
	putExpiryLifecycle,
} from "@/lib/aws/s3";
import {
	activateRuleSet,
	createRuleSet,
	deleteReceiptRule,
	describeActiveRuleSet,
	describeReceiptRule,
	upsertReceiptRule,
} from "@/lib/aws/ses";
import type {
	ReceivingStep,
	SesReceivingView,
} from "@/lib/aws/ses-receiving-types";
import {
	createTopic,
	listSubscriptions,
	setTopicPolicy,
	subscribeHttps,
} from "@/lib/aws/sns";
import { getCallerIdentity } from "@/lib/aws/sts";
import { isManualZone } from "@/lib/domains/provision";
import {
	hasMx,
	isInboundSmtpMx,
	publishMx,
	removeMx,
} from "@/lib/domains/receiving-dns";
import type { DomainRow } from "@/lib/domains/types";

const attempt = async (run: () => Promise<boolean>): Promise<boolean> => {
	try {
		return await run();
	} catch (error) {
		if (error instanceof AwsError) {
			return false;
		}
		throw error;
	}
};

export async function getSesReceivingState(
	env: CloudflareEnv
): Promise<SesReceivingState | null> {
	const [row] = await getDb(env)
		.select({ value: appSettings.sesReceiving })
		.from(appSettings)
		.where(eq(appSettings.id, "default"))
		.limit(1);
	if (!row?.value) {
		return null;
	}
	try {
		return JSON.parse(row.value) as SesReceivingState;
	} catch {
		return null;
	}
}

async function saveState(
	env: CloudflareEnv,
	state: SesReceivingState
): Promise<void> {
	const values = { sesReceiving: JSON.stringify(state), updatedAt: new Date() };
	await getDb(env)
		.insert(appSettings)
		.values({ id: "default", ...values })
		.onConflictDoUpdate({ set: values, target: appSettings.id });
}

function isPublicHttps(origin: string): boolean {
	try {
		const url = new URL(origin);
		return (
			url.protocol === "https:" &&
			!/^(?<capture1>localhost|127\.|\[::1\]|.*\.localhost$|.*\.test$)/u.test(
				url.hostname
			)
		);
	} catch {
		return false;
	}
}

const RULE_SET = "mailflare-inbound";

export const SES_OBJECT_PREFIX = "inbound/";

const TOPIC_NAME = "mailflare-inbound";

const ruleName = (hostname: string) =>
	`mailflare-${hostname.replaceAll(/[^a-zA-Z0-9-_]/gu, "-")}`.slice(0, 64);

export const sesInboundMx = (region: string) =>
	`inbound-smtp.${region}.amazonaws.com`;

/**
 * Creates what SES needs to hand Mailflare a message: an S3 bucket SES may write
 * to, an SNS topic SES may publish to (subscribed to this app's signed endpoint),
 * and a receipt rule for the domain, then points the domain's MX at SES.
 * Everything is idempotent, so running it again repairs a partial setup.
 */
export async function setupSesReceiving(
	env: CloudflareEnv,
	domain: DomainRow,
	origin: string,
	options: { replaceMx: boolean }
): Promise<void> {
	const config = await requireAwsConfig(env);
	if (!SES_RECEIVING_REGIONS.includes(config.region)) {
		throw new Error(
			`Amazon SES cannot receive mail in ${config.region}. Use a region such as us-east-1, us-west-2 or eu-west-1.`
		);
	}
	if (!isPublicHttps(origin)) {
		throw new Error(
			"SES delivers mail by calling this app over public HTTPS. Set APP_URL to your public address (localhost will not work)."
		);
	}
	const { accountId } = await getCallerIdentity(config);
	const previous = await getSesReceivingState(env);
	const state: SesReceivingState = {
		accountId,
		bucket: `mailflare-inbound-${accountId}-${config.region}`,
		endpoint: `${origin.replace(/\/$/u, "")}/api/inbound/ses?token=`,
		region: config.region,
		ruleSet: previous?.ruleSet ?? RULE_SET,
		token: previous?.token ?? crypto.randomUUID().replaceAll("-", ""),
		topicArn: "",
	};
	state.endpoint += state.token;

	await createBucket(config, state.bucket);
	await putBucketPolicy(config, state.bucket, {
		Statement: [
			{
				Action: "s3:PutObject",
				Condition: { StringEquals: { "aws:Referer": accountId } },
				Effect: "Allow",
				Principal: { Service: "ses.amazonaws.com" },
				Resource: `arn:aws:s3:::${state.bucket}/*`,
				Sid: "AllowSESPuts",
			},
		],
		Version: "2012-10-17",
	});
	await putExpiryLifecycle(config, state.bucket, SES_OBJECT_PREFIX, 1).catch(
		() => {
			// Cleanup failure does not mask the original result.
		}
	);

	state.topicArn = await createTopic(config, TOPIC_NAME);
	await setTopicPolicy(config, state.topicArn, {
		Statement: [
			{
				Action: [
					"SNS:GetTopicAttributes",
					"SNS:SetTopicAttributes",
					"SNS:AddPermission",
					"SNS:RemovePermission",
					"SNS:DeleteTopic",
					"SNS:Subscribe",
					"SNS:ListSubscriptionsByTopic",
					"SNS:Publish",
				],
				Condition: { StringEquals: { "AWS:SourceOwner": accountId } },
				Effect: "Allow",
				Principal: { AWS: "*" },
				Resource: state.topicArn,
				Sid: "AllowOwner",
			},
			{
				Action: "SNS:Publish",
				Condition: { StringEquals: { "AWS:SourceAccount": accountId } },
				Effect: "Allow",
				Principal: { Service: "ses.amazonaws.com" },
				Resource: state.topicArn,
				Sid: "AllowSESPublish",
			},
		],
		Version: "2008-10-17",
	});
	const subscriptions = await listSubscriptions(config, state.topicArn);
	if (
		!subscriptions.some(
			(subscription) => subscription.endpoint === state.endpoint
		)
	) {
		await subscribeHttps(config, state.topicArn, state.endpoint);
	}

	// Only one rule set is active per region. Use the account's own if it has one
	// (adding our rule beside theirs); otherwise create and activate ours.
	const active = await describeActiveRuleSet(config);
	if (active.name) {
		state.ruleSet = active.name;
	} else {
		await createRuleSet(config, state.ruleSet);
		await activateRuleSet(config, state.ruleSet);
	}
	await upsertReceiptRule(config, {
		bucket: state.bucket,
		name: ruleName(domain.hostname),
		prefix: SES_OBJECT_PREFIX,
		recipient: domain.hostname,
		ruleSet: state.ruleSet,
		topicArn: state.topicArn,
	});
	await saveState(env, state);

	await publishMx(env, domain, sesInboundMx(config.region), {
		replace: options.replaceMx,
	});
}

export async function getSesReceivingView(
	env: CloudflareEnv,
	domain: DomainRow
): Promise<SesReceivingView> {
	const config = await requireAwsConfig(env);
	const state = await getSesReceivingState(env);
	const mx = sesInboundMx(config.region);
	const steps: ReceivingStep[] = [];
	const regionOk = SES_RECEIVING_REGIONS.includes(config.region);
	steps.push({
		detail: regionOk ? config.region : `${config.region} cannot receive mail`,
		key: "region",
		label: "Region supports receiving",
		ok: regionOk,
	});
	const bucketOk =
		!!state && (await attempt(() => bucketExists(config, state.bucket)));
	steps.push({
		detail: state?.bucket,
		key: "bucket",
		label: "S3 bucket for raw mail",
		ok: bucketOk,
	});
	const subscribed =
		!!state &&
		(await attempt(
			async () =>
				await listSubscriptions(config, state.topicArn).then((resolved) =>
					resolved.some(
						(subscription) =>
							subscription.endpoint === state.endpoint && subscription.confirmed
					)
				)
		));
	steps.push({
		detail: state && !subscribed ? "Subscription not confirmed yet" : undefined,
		key: "topic",
		label: "SNS topic delivering to the Lab",
		ok: subscribed,
	});
	const ruleOk =
		!!state &&
		(await attempt(() =>
			describeReceiptRule(config, state.ruleSet, ruleName(domain.hostname))
		));
	steps.push({
		detail: ruleOk ? state?.ruleSet : undefined,
		key: "rule",
		label: "SES receipt rule for this domain",
		ok: ruleOk,
	});
	const mxOk = await hasMx(env, domain, mx);
	steps.push({
		detail: mxOk === null ? "Add the MX record in your DNS" : mx,
		key: "mx",
		label: "MX record points to SES",
		ok: mxOk === true,
	});

	return {
		dnsManaged: !isManualZone(domain.zoneId),
		mx,
		ready: steps.every((step) => step.ok),
		region: config.region,
		steps,
	};
}

/** Removes this domain's rule and MX. The shared bucket and topic stay for other domains. */
export async function removeSesReceiving(
	env: CloudflareEnv,
	domain: DomainRow
): Promise<void> {
	const config = await requireAwsConfig(env);
	const state = await getSesReceivingState(env);
	if (state) {
		await deleteReceiptRule(config, state.ruleSet, ruleName(domain.hostname));
	}
	await removeMx(env, domain, isInboundSmtpMx);
}

export async function hasSesReceivingConfig(
	env: CloudflareEnv,
	domain: DomainRow
): Promise<boolean | null> {
	try {
		const config = await requireAwsConfig(env);
		const state = await getSesReceivingState(env);
		if (!state) {
			return false;
		}
		return await describeReceiptRule(
			config,
			state.ruleSet,
			ruleName(domain.hostname)
		);
	} catch {
		return null;
	}
}
