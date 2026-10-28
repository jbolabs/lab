import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { driveItems } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getDriveItem, getDriveRole, toDriveItemDtos } from "./access";
import { canEditDrive, driveObjectKey, normalizeDriveName } from "./utils";
import { getDriveStorageLimit, getDriveStorageUsed } from "./storage";

import { isMarkdownFile } from "./documents-client";

export const DOCUMENT_MAX_BYTES = 1024 * 1024;
export class DriveFailure extends Error {
	constructor(message: string, public status = 400) { super(message); }
}
export async function accessibleDriveFile(env: CloudflareEnv, userId: string, id: string, edit = false) {
	const db = getDb(env);
	const item = await getDriveItem(db, id);
	const role = item && !item.uploadId ? await getDriveRole(db, userId, item) : null;
	if (!item || item.kind !== "file" || !role || (edit && !canEditDrive(role))) throw new DriveFailure("File not found or access removed", 404);
	return { item, role };
}
export async function readDriveFile(env: CloudflareEnv, userId: string, id: string) {
	const { item, role } = await accessibleDriveFile(env, userId, id);
	if (item.size > DOCUMENT_MAX_BYTES) throw new DriveFailure("Open or download files larger than 1 MiB in Drive", 413);
	const object = await env.BUCKET.get(item.r2Key ?? driveObjectKey(item.ownerId, item.id));
	if (!object) throw new DriveFailure("File content not found", 404);
	const [dto] = await toDriveItemDtos(getDb(env), [item], userId, () => role);
	return { item: dto, bytes: new Uint8Array(await object.arrayBuffer()), revision: item.r2Key ?? driveObjectKey(item.ownerId, item.id) };
}
export async function readDocument(env: CloudflareEnv, userId: string, id: string) {
	const { item } = await accessibleDriveFile(env, userId, id);
	if (!isMarkdownFile(item)) throw new DriveFailure("This file is not a Markdown document");
	const result = await readDriveFile(env, userId, id);
	return { item: result.item, content: new TextDecoder().decode(result.bytes), revision: result.revision };
}
export async function createDriveFile(env: CloudflareEnv, userId: string, input: { name: string; content: Uint8Array; contentType: string; parentId?: string }) {
	const db = getDb(env);
	const name = normalizeDriveName(input.name);
	if (!name) throw new DriveFailure("Enter a file name");
	if (input.content.byteLength > DOCUMENT_MAX_BYTES) throw new DriveFailure("Files must be at most 1 MiB through the connector or editor", 413);
	let ownerId = userId;
	if (input.parentId) {
		const parent = await getDriveItem(db, input.parentId);
		if (!parent || parent.kind !== "folder" || !canEditDrive(await getDriveRole(db, userId, parent))) throw new DriveFailure("Folder not found", 404);
		ownerId = parent.ownerId;
	}
	const limit = await getDriveStorageLimit(env);
	if (limit !== null && await getDriveStorageUsed(db, ownerId) + input.content.byteLength > limit) throw new DriveFailure("Not enough Drive storage", 413);
	const id = newId("drv");
	const key = `drive-revisions/${ownerId}/${id}/${newId("rev")}`;
	const now = new Date();
	const row = { id, ownerId, parentId: input.parentId || null, kind: "file" as const, name, r2Key: key, size: input.content.byteLength, contentType: input.contentType, uploadId: null, uploadPartSize: null, uploadFingerprint: null, linkToken: null, trashedAt: null, createdAt: now, updatedAt: now };
	await env.BUCKET.put(key, input.content, { httpMetadata: { contentType: row.contentType } });
	try { await db.insert(driveItems).values(row); }
	catch (error) { await env.BUCKET.delete(key); throw error; }
	const [item] = await toDriveItemDtos(db, [row], userId, () => ownerId === userId ? "owner" : "edit");
	return { item, revision: key };
}
export async function saveDocument(env: CloudflareEnv, userId: string, id: string, content: string, expectedRevision: string) {
	const { item, role } = await accessibleDriveFile(env, userId, id, true);
	if (!isMarkdownFile(item)) throw new DriveFailure("This file is not a Markdown document");
	const oldKey = item.r2Key ?? driveObjectKey(item.ownerId, item.id);
	if (oldKey !== expectedRevision) throw new DriveFailure("This document changed. Copy your edits, then reload the latest version.", 409);
	const bytes = new TextEncoder().encode(content);
	if (bytes.byteLength > DOCUMENT_MAX_BYTES) throw new DriveFailure("Documents must be at most 1 MiB", 413);
	const db = getDb(env);
	const limit = await getDriveStorageLimit(env);
	if (limit !== null && await getDriveStorageUsed(db, item.ownerId) - item.size + bytes.byteLength > limit) throw new DriveFailure("Not enough Drive storage", 413);
	// Immutable objects plus a conditional row update keep simultaneous saves from overwriting each other.
	const key = `drive-revisions/${item.ownerId}/${id}/${newId("rev")}`;
	await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: "text/markdown" } });
	let saved = false;
	const updatedAt = new Date();
	try {
		await accessibleDriveFile(env, userId, id, true);
		const rows = await db.update(driveItems).set({ r2Key: key, size: bytes.byteLength, contentType: "text/markdown", updatedAt }).where(and(eq(driveItems.id, id), item.r2Key ? eq(driveItems.r2Key, item.r2Key) : isNull(driveItems.r2Key), isNull(driveItems.trashedAt), isNull(driveItems.uploadId))).returning({ id: driveItems.id });
		if (!rows.length) throw new DriveFailure("This document changed. Copy your edits, then reload the latest version.", 409);
		saved = true;
	} finally { if (!saved) await env.BUCKET.delete(key); }
	// A failed cleanup must not report a failed save after the new revision has committed.
	await env.BUCKET.delete(oldKey).catch(() => undefined);
	const [dto] = await toDriveItemDtos(db, [{ ...item, r2Key: key, size: bytes.byteLength, contentType: "text/markdown", updatedAt }], userId, () => role);
	return { item: dto, content, revision: key };
}
