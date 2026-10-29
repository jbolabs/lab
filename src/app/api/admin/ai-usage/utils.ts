import { and, desc, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { aiUsage } from "@/db/schema";
import { requireSessionUser } from "@/lib/api/auth";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { getEnv } from "@/lib/cloudflare";
import { getRequestTimeZone, recentZonedDays } from "@/lib/time/utils";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) {
		return session.error;
	}
	if (!isPrimaryAdmin(session.user)) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
	const rawPage = new URL(request.url).searchParams.get("page") ?? "1";
	const page = Number(rawPage);
	if (
		!Number.isSafeInteger(page) ||
		page < 1 ||
		page > Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE)
	) {
		return Response.json({ error: "Invalid page" }, { status: 400 });
	}
	const db = getDb(env);
	const [totals] = await db
		.select({
			costUsdMicros: sql<number>`coalesce(sum(${aiUsage.costUsdMicros}), 0)`,
			inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
			outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
			pricedRequests: sql<number>`count(${aiUsage.costUsdMicros})`,
			requests: sql<number>`count(*)`,
		})
		.from(aiUsage);
	const timeZone = getRequestTimeZone(request, session.user.timeZone);
	const days = recentZonedDays(timeZone, 30);
	const lastDay = days.at(-1);
	if (!lastDay) {
		throw new Error("Expected recent day boundaries");
	}
	// Each boundary uses the offset on that date, including daylight-saving changes.
	const day = sql<string>`CASE ${sql.join(
		days.map(
			(item) =>
				sql`WHEN ${aiUsage.createdAt} < ${item.end.getTime() / 1000} THEN ${item.date}`
		),
		sql` `
	)} END`;
	const dailyRows = await db
		.select({
			date: day.as("date"),
			inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
			outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
			requests: sql<number>`count(*)`,
		})
		.from(aiUsage)
		.where(
			and(
				gte(aiUsage.createdAt, days[0].start),
				lt(aiUsage.createdAt, lastDay.end)
			)
		)
		.groupBy(sql`"date"`)
		.orderBy(sql`"date"`);
	const byDate = new Map(dailyRows.map((row) => [row.date, row]));
	const daily = days.map(
		({ date }) =>
			byDate.get(date) ?? { date, inputTokens: 0, outputTokens: 0, requests: 0 }
	);
	const rows = await db
		.select()
		.from(aiUsage)
		.orderBy(desc(aiUsage.createdAt), desc(aiUsage.id))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);
	return Response.json(
		{
			daily,
			page,
			pageSize: PAGE_SIZE,
			rows,
			timeZone,
			totalPages: Math.max(1, Math.ceil(totals.requests / PAGE_SIZE)),
			totals: {
				...totals,
				totalTokens: totals.inputTokens + totals.outputTokens,
			},
		},
		{ headers: { "Cache-Control": "no-store" } }
	);
}
