import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { tmpdir } = os;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-providers-"));
after(() => rmSync(outDir, { force: true, recursive: true }));

async function bundle(entry, outfile) {
	await build({
		alias: { "@": join(root, "src") },
		bundle: true,
		entryPoints: [join(root, entry)],
		format: "esm",
		logLevel: "silent",
		outfile: join(outDir, outfile),
		platform: "node",
		target: "node22",
	});
	return import(pathToFileURL(join(outDir, outfile)).href);
}

const sigv4 = await bundle("src/lib/aws/sigv4.ts", "sigv4.mjs");
const xml = await bundle("src/lib/aws/xml.ts", "xml.mjs");
const notification = await bundle(
	"src/lib/aws/ses-notification.ts",
	"notification.mjs"
);
const svix = await bundle("src/lib/email/svix.ts", "svix.mjs");
const config = await bundle("src/lib/aws/config.ts", "config.mjs").catch(
	() => null
);
const validate = await bundle("src/lib/aws/validate.ts", "validate.mjs");
const sesLib = await bundle("src/lib/aws/ses.ts", "ses.mjs");

test("SigV4 matches the AWS get-vanilla test vector", async () => {
	const headers = await sigv4.signAwsRequest({
		body: "",
		credentials: {
			accessKeyId: "AKIDEXAMPLE",
			secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
		},
		headers: {},
		method: "GET",
		now: new Date("2015-08-30T12:36:00Z"),
		region: "us-east-1",
		service: "service",
		url: new URL("https://example.amazonaws.com/"),
	});
	assert.equal(
		headers.Authorization,
		"AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"
	);
});

test("SigV4 matches the AWS post-x-www-form-urlencoded test vector", async () => {
	const headers = await sigv4.signAwsRequest({
		body: "Param1=value1",
		credentials: {
			accessKeyId: "AKIDEXAMPLE",
			secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
		},
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		method: "POST",
		now: new Date("2015-08-30T12:36:00Z"),
		region: "us-east-1",
		service: "service",
		url: new URL("https://example.amazonaws.com/"),
	});
	assert.equal(
		headers.Authorization,
		"AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=ff11897932ad3f4e8b18135d722051e5ac45fc38421b1da7b9d196a0fe09473a"
	);
});

test("XML helpers read AWS responses", () => {
	const doc =
		"<R><Account>1234</Account><Rules><member><Name>a</Name></member><member><Name>b&amp;c</Name></member></Rules></R>";
	assert.equal(xml.xmlTag(doc, "Account"), "1234");
	assert.deepEqual(
		xml
			.xmlBlocks(xml.xmlBlocks(doc, "Rules")[0], "member")
			.map((member) => xml.xmlTag(member, "Name")),
		["a", "b&c"]
	);
	assert.equal(xml.xmlTag(doc, "Missing"), null);
});

test("SES notifications parse S3 receipts and ignore everything else", () => {
	const message = JSON.stringify({
		mail: {
			destination: ["a@example.com"],
			headers: [{ name: "Subject", value: "Hi" }],
			source: "sender@example.net",
		},
		notificationType: "Received",
		receipt: {
			action: { bucketName: "b", objectKey: "inbound/abc", type: "S3" },
			recipients: ["a@example.com"],
			virusVerdict: { status: "PASS" },
		},
	});
	assert.deepEqual(notification.parseSesNotification(message), {
		bucket: "b",
		from: "sender@example.net",
		headers: { subject: "Hi" },
		key: "inbound/abc",
		recipients: ["a@example.com"],
		virusFailed: false,
	});
	assert.equal(
		notification.parseSesNotification(
			JSON.stringify({ notificationType: "Bounce" })
		),
		null
	);
	assert.equal(notification.parseSesNotification("not json"), null);
	assert.equal(
		notification.parseSesNotification(message.replace('"PASS"', '"FAIL"'))
			.virusFailed,
		true
	);
	assert.equal(notification.safeEqual("abc", "abc"), true);
	assert.equal(notification.safeEqual("abc", "abd"), false);
});

test("Svix signatures verify, and reject tampering, stale timestamps and wrong secrets", async () => {
	const secretBytes = Buffer.from("super-secret-key-material");
	const secret = `whsec_${secretBytes.toString("base64")}`;
	const id = "msg_1";
	const timestamp = String(Math.floor(Date.now() / 1000));
	const body = '{"type":"email.received"}';
	const { createHmac } = await import("node:crypto");
	const signature = `v1,${createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
	const headers = { id, signature, timestamp };

	assert.equal(await svix.verifySvixSignature(secret, headers, body), true);
	assert.equal(
		await svix.verifySvixSignature(
			secret,
			{ ...headers, signature: `v1,bogus ${signature}` },
			body
		),
		true,
		"any listed signature may match"
	);
	assert.equal(
		await svix.verifySvixSignature(secret, headers, `${body} `),
		false
	);
	assert.equal(
		await svix.verifySvixSignature(
			`whsec_${Buffer.from("other").toString("base64")}`,
			headers,
			body
		),
		false
	);
	assert.equal(
		await svix.verifySvixSignature(
			secret,
			{ ...headers, timestamp: String(Number(timestamp) - 3600) },
			body
		),
		false
	);
	assert.equal(
		await svix.verifySvixSignature(
			secret,
			{ id: null, signature, timestamp },
			body
		),
		false
	);
});

test("AWS region validation and SES receiving regions", () => {
	assert.ok(config, "config module bundles");
	assert.equal(config.isValidRegion("us-east-1"), true);
	assert.equal(config.isValidRegion("eu-west-2"), true);
	assert.equal(config.isValidRegion("us-gov-west-1"), true);
	assert.equal(config.isValidRegion("nowhere"), false);
	assert.equal(config.isValidRegion("us-east-1; rm"), false);
	assert.ok(config.SES_RECEIVING_REGIONS.includes("us-east-1"));
	assert.ok(!config.SES_RECEIVING_REGIONS.includes("af-south-1"));
});

function mockAws(handler) {
	const original = globalThis.fetch;
	const calls = [];
	globalThis.fetch = (input, init = {}) => {
		try {
			const url = new URL(
				typeof input === "string" ? input : (input.url ?? input.href)
			);
			const body = typeof init.body === "string" ? init.body : "";
			const action = new URLSearchParams(body).get("Action") ?? "";
			calls.push({
				action,
				body,
				headers: init.headers,
				method: init.method ?? "GET",
				url,
			});
			const result = handler({ action, body, url });
			return Promise.resolve(
				new Response(result.body, { status: result.status ?? 200 })
			);
		} catch (error) {
			return Promise.reject(error);
		}
	};
	return {
		calls,
		restore: () => {
			globalThis.fetch = original;
		},
	};
}

const creds = {
	accessKeyId: "AKIAEXAMPLE000000000",
	region: "us-east-1",
	secretAccessKey: "x".repeat(40),
};

test("validation rejects credentials AWS refuses", async () => {
	const mock = mockAws(() => ({
		body: "<ErrorResponse><Error><Code>InvalidClientTokenId</Code><Message>bad token</Message></Error></ErrorResponse>",
		status: 403,
	}));
	try {
		await assert.rejects(
			() => validate.validateAwsConfig(creds),
			(error) =>
				error instanceof validate.AwsCredentialsError &&
				/rejected/u.test(error.message)
		);
		await assert.rejects(
			() => validate.validateAwsConfig({ ...creds, region: "mars-1" }),
			/not a valid AWS region/u
		);
	} finally {
		mock.restore();
	}
});

test("validation reports each missing permission instead of failing", async () => {
	const mock = mockAws(({ url, action }) => {
		if (action === "GetCallerIdentity") {
			return {
				body: "<R><Account>111122223333</Account><Arn>arn:aws:iam::111122223333:user/x</Arn></R>",
			};
		}
		if (url.pathname === "/v2/email/account") {
			return {
				body: JSON.stringify({
					ProductionAccessEnabled: false,
					SendingEnabled: true,
				}),
			};
		}
		if (action === "DescribeActiveReceiptRuleSet") {
			return {
				body: "<ErrorResponse><Error><Code>AccessDenied</Code><Message>no</Message></Error></ErrorResponse>",
				status: 403,
			};
		}
		if (action === "ListTopics") {
			return { body: "<ListTopicsResponse/>" };
		}
		return {
			body: "<Error><Code>AccessDenied</Code><Message>no</Message></Error>",
			status: 403,
		};
	});
	try {
		const report = await validate.validateAwsConfig(creds);
		assert.equal(report.accountId, "111122223333");
		assert.equal(report.sending, true);
		assert.equal(report.productionAccess, false);
		assert.equal(report.receiving, false);
		assert.equal(report.sns, true);
		assert.equal(report.s3, false);
		assert.ok(report.missing.includes("ses:CreateReceiptRule"));
		assert.ok(report.missing.includes("s3:CreateBucket"));
		assert.ok(!report.missing.includes("sns:CreateTopic"));
		assert.equal(report.receivingRegion, true);
	} finally {
		mock.restore();
	}
});

test("SES calls are signed and shaped for the v1 receipt-rule API", async () => {
	const mock = mockAws(() => ({ body: "<R/>" }));
	try {
		await sesLib.upsertReceiptRule(creds, {
			bucket: "bkt",
			name: "mailflare-example-com",
			prefix: "inbound/",
			recipient: "example.com",
			ruleSet: "rs",
			topicArn: "arn:aws:sns:us-east-1:1:t",
		});
		const [call] = mock.calls;
		assert.equal(call.url.host, "email.us-east-1.amazonaws.com");
		assert.equal(call.action, "CreateReceiptRule");
		const params = new URLSearchParams(call.body);
		assert.equal(params.get("Version"), "2010-12-01");
		assert.equal(params.get("Rule.Recipients.member.1"), "example.com");
		assert.equal(
			params.get("Rule.Actions.member.1.S3Action.BucketName"),
			"bkt"
		);
		assert.equal(
			params.get("Rule.Actions.member.1.S3Action.TopicArn"),
			"arn:aws:sns:us-east-1:1:t"
		);
		assert.match(
			call.headers.Authorization,
			/Credential=AKIAEXAMPLE000000000\/\d{8}\/us-east-1\/ses\/aws4_request/u
		);
	} finally {
		mock.restore();
	}
});

test("an existing receipt rule is updated, not duplicated", async () => {
	const mock = mockAws(({ action }) =>
		action === "CreateReceiptRule"
			? {
					body: "<ErrorResponse><Error><Code>AlreadyExists</Code><Message>exists</Message></Error></ErrorResponse>",
					status: 400,
				}
			: { body: "<R/>" }
	);
	try {
		await sesLib.upsertReceiptRule(creds, {
			bucket: "b",
			name: "n",
			prefix: "inbound/",
			recipient: "example.com",
			ruleSet: "rs",
			topicArn: "arn",
		});
		assert.deepEqual(
			mock.calls.map((call) => call.action),
			["CreateReceiptRule", "UpdateReceiptRule"]
		);
	} finally {
		mock.restore();
	}
});

test("SES send maps the message and returns the Message-ID SES will use", async () => {
	const mock = mockAws(() => ({
		body: JSON.stringify({ MessageId: "0100abc" }),
	}));
	try {
		const result = await sesLib.sendSesEmail(creds, {
			attachments: [
				{
					content: new TextEncoder().encode("hello").buffer,
					disposition: "attachment",
					filename: "f.txt",
					type: "text/plain",
				},
			],
			from: "a@example.com",
			headers: { "In-Reply-To": "<x>", "Message-ID": "<mine>" },
			html: "<p>t</p>",
			subject: "Hi",
			text: "t",
			to: ["b@example.net"],
		});
		assert.equal(result.messageId, "<0100abc@email.amazonses.com>");
		const sent = JSON.parse(mock.calls[0].body);
		assert.equal(sent.FromEmailAddress, "a@example.com");
		assert.deepEqual(sent.Content.Simple.Headers, [
			{ Name: "In-Reply-To", Value: "<x>" },
		]);
		assert.equal(
			sent.Content.Simple.Attachments[0].RawContent,
			Buffer.from("hello").toString("base64")
		);
		const eu = await sesLib.sendSesEmail(
			{ ...creds, region: "eu-west-1" },
			{ from: "a@example.com", subject: "s", text: "t", to: ["b@example.net"] }
		);
		assert.equal(eu.messageId, "<0100abc@eu-west-1.amazonses.com>");
	} finally {
		mock.restore();
	}
});
