import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { driveItems } from "@/db/schema";
import { getDriveItem } from "@/lib/drive/access";
import { authorizeDrive } from "@/lib/drive/auth";
import { newId } from "@/lib/ids";

import type { DriveItemParams } from "../types";

/** Turns the "anyone with the link can view" URL on or off. Turning it off invalidates the old token. */
export async function POST(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const item = await getDriveItem(auth.db, id);
	if (!item || item.ownerId !== auth.user.id || item.trashedAt) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	const body = (await request.json().catch(() => ({}))) as {
		enabled?: unknown;
	};
	const linkToken = body.enabled
		? (item.linkToken ??
			`${newId()}${newId()}`.replaceAll(/[^A-Za-z0-9]/gu, "").slice(0, 32))
		: null;
	await auth.db
		.update(driveItems)
		.set({ linkToken })
		.where(eq(driveItems.id, id));
	return NextResponse.json({ linkToken });
}
