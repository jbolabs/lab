"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client";
import type { DriveItemDto } from "@/lib/drive/types";
import { DRIVE_REFRESH_EVENT } from "../../drive-events";

type Draft = { name: string; content: string; revision: string | null };
// In-memory, account-scoped buffers survive SPA history and command-palette navigation.
const drafts = new Map<string, Draft>();

export default function DocumentPage() {
	const user = useCurrentUser();
	const params = useSearchParams();
	const id = params.get("id");
	// Remount on document navigation so a previous request or unsaved buffer cannot cross documents.
	return user ? <DocumentEditor key={`${user.id}:${id ?? `new:${params.get("parent") ?? ""}`}`} userId={user.id} id={id} parentId={params.get("parent")} /> : null;
}
function DocumentEditor({ userId, id, parentId }: { userId: string; id: string | null; parentId: string | null }) {
	const draftKey = `${userId}:${id ?? `new:${parentId ?? ""}`}`;
	const draft = drafts.get(draftKey);
	const { t } = useLanguage();
	const [fileId, setFileId] = useState(id);
	const [name, setName] = useState(draft?.name ?? "");
	const [content, setContent] = useState(draft?.content ?? "");
	const [savedContent, setSavedContent] = useState("");
	const [revision, setRevision] = useState<string | null>(null);
	const [editable, setEditable] = useState(!id);
	const [loading, setLoading] = useState(!!id);
	const [busy, setBusy] = useState(false);
	const [preview, setPreview] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const mounted = useRef(false);
	useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
	const dirty = content !== savedContent || (!fileId && !!name.trim());
	useEffect(() => {
		if (!id) return;
		const abort = new AbortController();
		void authFetch(`/api/drive/documents/${encodeURIComponent(id)}`, { signal: abort.signal }).then(async (response) => {
			const data = await response.json() as { item: DriveItemDto; content: string; revision: string; error?: string };
			if (!response.ok) throw new Error(data.error || t("docs.loadFailed"));
			const retained = drafts.get(draftKey);
			setName(data.item.name); setContent(retained?.content ?? data.content); setSavedContent(data.content); setRevision(retained?.revision ?? data.revision); setEditable(data.item.role !== "view");
		}).catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : t("docs.loadFailed")); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
		return () => abort.abort();
	}, [id, t, draftKey]);
	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty, t]);
	function retain(nextName: string, nextContent: string) {
		if ((fileId && nextContent === savedContent) || (!fileId && !nextName.trim() && !nextContent)) drafts.delete(draftKey);
		else drafts.set(draftKey, { name: nextName, content: nextContent, revision });
	}
	async function save() {
		if (busy || !editable || loading) return;
		const submittedDraft = drafts.get(draftKey);
		const submittedUrl = window.location.href;
		setBusy(true); setError(null);
		try {
			const response = await authFetch(fileId ? `/api/drive/documents/${encodeURIComponent(fileId)}` : "/api/drive/documents", { method: fileId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fileId ? { content, expectedRevision: revision } : { name, content, parentId }) });
			const data = await response.json() as { item: DriveItemDto; revision: string; error?: string };
			if (!response.ok) throw new Error(data.error || t("docs.saveFailed"));
			if (drafts.get(draftKey) === submittedDraft) drafts.delete(draftKey);
			window.dispatchEvent(new Event(DRIVE_REFRESH_EVENT));
			if (!mounted.current || window.location.href !== submittedUrl) return;
			setFileId(data.item.id); setName(data.item.name); setRevision(data.revision); setSavedContent(content);
			if (!fileId) window.history.replaceState(null, "", `/drive/document?id=${encodeURIComponent(data.item.id)}`);
		} catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : t("docs.saveFailed")); }
		finally { setBusy(false); }
	}
	return <main className="flex h-full min-h-0 flex-col bg-white text-neutral-900">
		<header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3 sm:px-6">
			<a href={parentId ? `/drive?folder=${encodeURIComponent(parentId)}` : "/drive"} className="inline-flex min-h-11 items-center text-sm text-blue-700 underline-offset-4 hover:underline">{t("docs.back")}</a>
			<label className="min-w-0 flex-1"><span className="sr-only">{t("docs.name")}</span><input value={name} disabled={!!fileId || loading || busy} onChange={(event) => { setName(event.target.value); retain(event.target.value, content); }} placeholder={t("docs.untitled")} maxLength={252} className="min-h-11 w-full rounded-md border border-neutral-200 px-3 text-base disabled:border-transparent disabled:bg-transparent disabled:text-neutral-900" /></label>
			<Button type="button" onClick={() => void save()} disabled={loading || busy || !editable || (!fileId && !name.trim()) || (!!fileId && !dirty)}>{busy ? t("docs.saving") : t("docs.save")}</Button>
		</header>
		<div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-2 sm:px-6">
			<Button type="button" variant={preview ? "ghost" : "outline"} onClick={() => setPreview(false)} aria-pressed={!preview}>{t("docs.markdown")}</Button>
			<Button type="button" variant={preview ? "outline" : "ghost"} onClick={() => setPreview(true)} aria-pressed={preview}>{t("docs.preview")}</Button>
			<span role="status" className="text-sm text-neutral-600">{loading ? t("docs.loading") : !editable ? t("docs.readOnly") : dirty ? t("docs.unsaved") : fileId ? t("docs.saved") : t("docs.new")}</span>
		</div>
		{error && <div role="alert" className="px-4 py-3 text-sm text-red-700"><p>{error}</p><button type="button" className="min-h-11 underline" onClick={() => { if (!dirty || window.confirm(t("docs.discard"))) { drafts.delete(draftKey); window.location.reload(); } }}>{t("docs.reload")}</button></div>}
		{preview ? <article className="mx-auto w-full max-w-3xl flex-1 overflow-auto break-words p-5 leading-7 [&_h1]:mb-5 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:my-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:my-3 [&_h3]:text-xl [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-auto [&_pre]:bg-neutral-100 [&_pre]:p-3 [&_a]:text-blue-700 [&_a]:underline [&_table]:block [&_table]:overflow-auto [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 sm:p-8"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{content}</ReactMarkdown></article> : <textarea aria-label={t("docs.content")} value={content} onChange={(event) => { setContent(event.target.value); retain(name, event.target.value); }} readOnly={!editable || loading || busy} spellCheck className="min-h-64 w-full flex-1 resize-none p-5 font-mono text-base leading-7 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:p-8" placeholder={t("docs.placeholder")} />}
	</main>;
}
