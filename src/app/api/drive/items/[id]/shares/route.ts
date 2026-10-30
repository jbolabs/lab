import { and, eq } from "drizzle-orm";

import { driveShares, users } from "@/db/schema";
import { getDriveItem } from "@/lib/drive/access";
import { authorizeDrive } from "@/lib/drive/auth";
import { newId } from "@/lib/ids";

import type { DriveItemParams } from "../types";

async function loadOwnedItem(
	request: Request,
	params: DriveItemParams["params"],
	mutation: boolean
) {
	const { id } = await params;
	const auth = await authorizeDrive(request, mutation);
	if (auth.error) {
		return { error: auth.error } as const;
	}
	const item = await getDriveItem(auth.db, id);
	if (!item || item.ownerId !== auth.user.id || item.trashedAt) {
		return {
			error: Response.json({ error: "Not found" }, { status: 404 }),
		} as const;
	}
	return { ...auth, item } as const;
}

function listShares(db: Parameters<typeof getDriveItem>[0], itemId: string) {
	return db
		.select({
			email: users.email,
			id: driveShares.id,
			name: users.name,
			role: driveShares.role,
			userId: driveShares.userId,
		})
		.from(driveShares)
		.innerJoin(users, eq(driveShares.userId, users.id))
		.where(eq(driveShares.itemId, itemId))
		.orderBy(driveShares.createdAt);
}

export async function GET(request: Request, { params }: DriveItemParams) {
	const ctx = await loadOwnedItem(request, params, false);
	if (ctx.error) {
		return ctx.error;
	}
	return Response.json({
		linkToken: ctx.item.linkToken,
		shares: await listShares(ctx.db, ctx.item.id),
	});
}

export async function POST(request: Request, { params }: DriveItemParams) {
	const ctx = await loadOwnedItem(request, params, true);
	if (ctx.error) {
		return ctx.error;
	}
	const { db, user, item } = ctx;
	const body = (await request.json().catch(() => ({}))) as {
		email?: unknown;
		role?: unknown;
	};
	const email =
		typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const role = body.role === "edit" ? "edit" : "view";
	if (!email) {
		return Response.json({ error: "Enter an email address" }, { status: 400 });
	}
	const [target] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (!target) {
		return Response.json(
			{ error: "No account uses that email address" },
			{ status: 404 }
		);
	}
	if (target.id === user.id) {
		return Response.json(
			{ error: "You already own this item" },
			{ status: 400 }
		);
	}
	await db
		.insert(driveShares)
		.values({ id: newId("dshr"), itemId: item.id, role, userId: target.id })
		.onConflictDoUpdate({
			set: { role },
			target: [driveShares.itemId, driveShares.userId],
		});
	return Response.json({ shares: await listShares(db, item.id) });
}

export async function DELETE(request: Request, { params }: DriveItemParams) {
	const ctx = await loadOwnedItem(request, params, true);
	if (ctx.error) {
		return ctx.error;
	}
	const shareId = new URL(request.url).searchParams.get("shareId");
	if (!shareId) {
		return Response.json({ error: "Missing share" }, { status: 400 });
	}
	await ctx.db
		.delete(driveShares)
		.where(
			and(eq(driveShares.id, shareId), eq(driveShares.itemId, ctx.item.id))
		);
	return Response.json({ shares: await listShares(ctx.db, ctx.item.id) });
}
