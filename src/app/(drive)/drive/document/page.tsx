"use client";
import { useConfirmation } from "@/app/(calendar)/use-confirmation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn as clsx } from "@/lib/utils";
import { ArrowLeft, FileText, Lock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
	const { confirm, confirmation } = useConfirmation();
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
	const [backHref, setBackHref] = useState(parentId ? `/drive?folder=${encodeURIComponent(parentId)}` : "/drive");
	const mounted = useRef(false);
	useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
	const dirty = content !== savedContent || (!fileId && !!name.trim());
	const canSave = !loading && !busy && editable && (fileId ? dirty : !!name.trim());
	useEffect(() => {
		if (!id) return;
		const abort = new AbortController();
		void authFetch(`/api/drive/documents/${encodeURIComponent(id)}`, { signal: abort.signal }).then(async (response) => {
			const data = await response.json() as { item: DriveItemDto; content: string; revision: string; error?: string };
			if (!response.ok) throw new Error(data.error || t("docs.loadFailed"));
			const retained = drafts.get(draftKey);
			setName(data.item.name); setContent(retained?.content ?? data.content); setSavedContent(data.content); setRevision(retained?.revision ?? data.revision); setEditable(data.item.role !== "view");
			// Viewers land on the rendered document; shared items return to the list they were opened from.
			if (data.item.role === "view") setPreview(true);
			setBackHref(data.item.role !== "owner" ? "/drive?view=shared" : data.item.parentId ? `/drive?folder=${encodeURIComponent(data.item.parentId)}` : "/drive");
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
		if (!canSave) return;
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
	const unavailable = !!id && !loading && revision === null && !content;
	const status = loading ? t("docs.loading") : !editable ? t("docs.readOnly") : dirty ? t("docs.unsaved") : fileId ? t("docs.saved") : t("docs.new");
	const segment = (active: boolean) => clsx("min-h-11 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");
	return <div className="flex h-full min-h-0 flex-col rounded-t-3xl bg-card text-foreground" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } }}>
		<header className="flex min-h-[4.25rem] shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-3 sm:px-5">
			<Link href={backHref} aria-label={t("docs.back")} title={t("docs.back")} className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground/80 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft size={20} /></Link>
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<FileText size={18} aria-hidden="true" className="hidden shrink-0 text-signal sm:block" />
				{loading ? <Skeleton className="h-6 w-48" /> : fileId ? <h1 className="min-w-0 truncate text-lg text-foreground" title={name}>{name}</h1>
					: <Field className="min-w-0 flex-1"><FieldLabel htmlFor="apps-field-srcappdrivedrivedocumentpagetsx-0"><span className="sr-only">{t("docs.name")}</span></FieldLabel><Input id="apps-field-srcappdrivedrivedocumentpagetsx-0" value={name} disabled={busy} autoFocus onChange={(event) => { setName(event.target.value); retain(event.target.value, content); }} placeholder={t("docs.untitled")} maxLength={252} className="h-10 w-full rounded-lg border border-border px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20" /></Field>}
			</div>
			<div className="flex items-center gap-3 max-sm:order-last max-sm:w-full max-sm:justify-between">
				<Tabs value={preview ? "preview" : "markdown"} onValueChange={(value) => setPreview(value === "preview")}><TabsList aria-label={t("docs.view")}><TabsTrigger value="markdown">{t("docs.markdown")}</TabsTrigger><TabsTrigger value="preview">{t("docs.preview")}</TabsTrigger></TabsList></Tabs>
				<span role="status" className="flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">{!loading && !editable && <Lock size={14} aria-hidden="true" />}{dirty && editable && <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" />}{status}</span>
			</div>
			{editable && <Button type="button" onClick={() => void save()} disabled={!canSave} aria-keyshortcuts="Control+S Meta+S" title={t("docs.saveShortcut")}>{busy ? t("docs.saving") : t("docs.save")}</Button>}
		</header>
		{confirmation}{error && <div role="alert" className="mx-3 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-destructive/10 px-4 py-2 text-sm text-destructive sm:mx-5"><p className="min-w-0 flex-1">{error}</p><Button variant="ghost" type="button" className= "min-h-10 font-medium underline underline-offset-4 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" onClick={async () => { if (!dirty || await confirm(t("docs.discard"))) { drafts.delete(draftKey); window.location.reload(); } }}>{t("docs.reload")}</Button></div>}
		{loading ? <div aria-hidden="true" className="mx-auto w-full max-w-3xl flex flex-col gap-4 p-5 sm:p-8"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-5/6" /><Skeleton className="h-5 w-1/2" /></div>
			: unavailable ? null
			: preview ? <div className="min-h-0 flex-1 overflow-y-auto"><article className="mx-auto w-full max-w-3xl break-words p-5 leading-7 text-foreground sm:p-8 [&_h1]:mb-4 [&_h1]:mt-2 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-input [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_hr]:my-8 [&_hr]:border-border [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-signal [&_a]:underline [&_a]:underline-offset-2 [&_table]:my-4 [&_table]:block [&_table]:overflow-x-auto [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:p-2 [&_input]:mr-2">{content.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{content}</ReactMarkdown> : <p className="text-muted-foreground">{t("docs.emptyPreview")}</p>}</article></div>
			: <Textarea aria-label={t("docs.content")} value={content} onChange={(event) => { setContent(event.target.value); retain(name, event.target.value); }} readOnly={!editable || busy} spellCheck className="mx-auto min-h-64 w-full max-w-3xl flex-1 resize-none bg-transparent p-5 font-mono text-base leading-7 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring placeholder:text-muted-foreground sm:p-8" placeholder={editable ? t("docs.placeholder") : undefined} />}
	</div>;
}
