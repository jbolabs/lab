"use client";
import { ArrowLeft, FileText, Lock } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useConfirmation } from "@/app/(calendar)/use-confirmation";
import { useLanguage } from "@/components/language-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageTitle } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import { requireSuccessfulResponse, withCleanup } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import type { DriveItemDto } from "@/lib/drive/types";

import { DRIVE_REFRESH_EVENT } from "../../drive-events";

function MarkdownLink({ children, href }: ComponentProps<"a">) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	);
}
function MarkdownImage({ alt }: ComponentProps<"img">) {
	return <span>{alt}</span>;
}
const markdownComponents = { a: MarkdownLink, img: MarkdownImage };

interface Draft {
	name: string;
	content: string;
	revision: string | null;
}
// In-memory, account-scoped buffers survive SPA history and command-palette navigation.
const drafts = new Map<string, Draft>();
function DocumentEditor({
	userId,
	id,
	parentId,
}: {
	userId: string;
	id: string | null;
	parentId: string | null;
}) {
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
	const [backHref, setBackHref] = useState(
		parentId ? `/drive?folder=${encodeURIComponent(parentId)}` : "/drive"
	);
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const dirty = content !== savedContent || (!fileId && !!name.trim());
	const canSave =
		!loading && !busy && editable && (fileId ? dirty : !!name.trim());
	useEffect(() => {
		if (!id) {
			return;
		}
		const abort = new AbortController();
		void authFetch(`/api/drive/documents/${encodeURIComponent(id)}`, {
			signal: abort.signal,
		})
			.then(async (response) => {
				const data = (await response.json()) as {
					item: DriveItemDto;
					content: string;
					revision: string;
					error?: string;
				};
				requireSuccessfulResponse(response, data.error || t("docs.loadFailed"));
				const retained = drafts.get(draftKey);
				setName(data.item.name);
				setContent(retained?.content ?? data.content);
				setSavedContent(data.content);
				setRevision(retained?.revision ?? data.revision);
				setEditable(data.item.role !== "view");
				// Viewers land on the rendered document; shared items return to the list they were opened from.
				if (data.item.role === "view") {
					setPreview(true);
				}
				setBackHref(
					(() => {
						if (data.item.role === "owner") {
							if (data.item.parentId) {
								return `/drive?folder=${encodeURIComponent(data.item.parentId)}`;
							}
							return "/drive";
						}
						return "/drive?view=shared";
					})()
				);

				return null;
			})
			.catch((error_: unknown) => {
				if (!abort.signal.aborted) {
					setError(
						error_ instanceof Error ? error_.message : t("docs.loadFailed")
					);
				}
			})
			.finally(() => {
				if (!abort.signal.aborted) {
					setLoading(false);
				}
			});
		return () => abort.abort();
	}, [id, t, draftKey]);
	useEffect(() => {
		if (!dirty) {
			return;
		}
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);
	function retain(nextName: string, nextContent: string) {
		if (
			(fileId && nextContent === savedContent) ||
			(!fileId && !nextName.trim() && !nextContent)
		) {
			drafts.delete(draftKey);
		} else {
			drafts.set(draftKey, { content: nextContent, name: nextName, revision });
		}
	}
	function save() {
		if (!canSave) {
			return;
		}
		const submittedDraft = drafts.get(draftKey);
		const submittedUrl = window.location.href;
		setBusy(true);
		setError(null);
		return withCleanup(
			async () => {
				try {
					const response = await authFetch(
						fileId
							? `/api/drive/documents/${encodeURIComponent(fileId)}`
							: "/api/drive/documents",
						{
							body: JSON.stringify(
								fileId
									? { content, expectedRevision: revision }
									: { content, name, parentId }
							),
							headers: { "Content-Type": "application/json" },
							method: fileId ? "PUT" : "POST",
						}
					);
					const data = (await response.json()) as {
						item: DriveItemDto;
						revision: string;
						error?: string;
					};
					requireSuccessfulResponse(
						response,
						data.error || t("docs.saveFailed")
					);
					if (drafts.get(draftKey) === submittedDraft) {
						drafts.delete(draftKey);
					}
					window.dispatchEvent(new Event(DRIVE_REFRESH_EVENT));
					if (!mounted.current || window.location.href !== submittedUrl) {
						return;
					}
					setFileId(data.item.id);
					setName(data.item.name);
					setRevision(data.revision);
					setSavedContent(content);
					if (!fileId) {
						window.history.replaceState(
							null,
							"",
							`/drive/document?id=${encodeURIComponent(data.item.id)}`
						);
					}
				} catch (error_) {
					if (mounted.current) {
						setError(
							error_ instanceof Error ? error_.message : t("docs.saveFailed")
						);
					}
				}
			},
			() => {
				setBusy(false);
			}
		);
	}
	const unavailable = !!id && !loading && revision === null && !content;
	useEffect(() => {
		const handleSaveShortcut = (event: globalThis.KeyboardEvent) => {
			if (
				(event.metaKey || event.ctrlKey) &&
				!event.altKey &&
				event.key.toLowerCase() === "s"
			) {
				event.preventDefault();
				void save();
			}
		};
		window.addEventListener("keydown", handleSaveShortcut);
		return () => window.removeEventListener("keydown", handleSaveShortcut);
	});

	const status = (() => {
		if (loading) {
			return t("docs.loading");
		}
		if (editable) {
			if (dirty) {
				return t("docs.unsaved");
			}
			if (fileId) {
				return t("docs.saved");
			}
			return t("docs.new");
		}
		return t("docs.readOnly");
	})();

	function renderDocumentEditor() {
		return (
			<section
				aria-label={t("docs.new")}
				className="flex h-full min-h-0 min-w-0 flex-col rounded-t-lg border-0 bg-card p-0 text-foreground"
			>
				<header className="flex min-h-17 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-3 sm:px-5">
					<Button
						variant="ghost"
						size="icon-lg"
						className="shrink-0"
						render={
							<Link
								href={backHref}
								data-edge-swipe-back
								aria-label={t("docs.back")}
								title={t("docs.back")}
							/>
						}
						nativeButton={false}
					>
						<ArrowLeft className="size-5" />
					</Button>
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<FileText
							size={18}
							aria-hidden="true"
							className="hidden shrink-0 text-signal sm:block"
						/>
						{(() => {
							if (loading) {
								return <Skeleton className="h-6 w-48" />;
							}
							if (fileId) {
								return (
									<PageTitle size="sm" className="min-w-0" title={name}>
										{name}
									</PageTitle>
								);
							}
							return (
								<Field className="min-w-0 flex-1">
									<FieldLabel htmlFor="apps-field-srcappdrivedrivedocumentpagetsx-0">
										<span className="sr-only">{t("docs.name")}</span>
									</FieldLabel>
									<Input
										id="apps-field-srcappdrivedrivedocumentpagetsx-0"
										value={name}
										disabled={busy}
										autoFocus
										onChange={(event) => {
											setName(event.target.value);
											retain(event.target.value, content);
										}}
										placeholder={t("docs.untitled")}
										maxLength={252}
									/>
								</Field>
							);
						})()}
					</div>
					<div className="flex items-center gap-3 max-sm:order-last max-sm:w-full max-sm:justify-between">
						<Tabs
							value={preview ? "preview" : "markdown"}
							onValueChange={(value) => setPreview(value === "preview")}
						>
							<TabsList aria-label={t("docs.view")}>
								<TabsTrigger value="markdown">{t("docs.markdown")}</TabsTrigger>
								<TabsTrigger value="preview">{t("docs.preview")}</TabsTrigger>
							</TabsList>
						</Tabs>
						<output className="flex items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
							{!loading && !editable && <Lock size={14} aria-hidden="true" />}
							{dirty && editable && (
								<span
									aria-hidden="true"
									className="size-2 rounded-full bg-warning"
								/>
							)}
							{status}
						</output>
					</div>
					{editable && (
						<Button
							type="button"
							onClick={() => save()}
							disabled={!canSave}
							aria-keyshortcuts="Control+S Meta+S"
							title={t("docs.saveShortcut")}
						>
							{busy ? t("docs.saving") : t("docs.save")}
						</Button>
					)}
				</header>
				{confirmation}
				{error && (
					<Alert
						variant="error"
						className="mx-3 mt-3 flex w-auto flex-wrap items-center sm:mx-5"
					>
						<p className="min-w-0 flex-1">{error}</p>
						<Button
							variant="link"
							size="sm"
							type="button"
							className=""
							onClick={async () => {
								if (!dirty || (await confirm(t("docs.discard")))) {
									drafts.delete(draftKey);
									window.location.reload();
								}
							}}
						>
							{t("docs.reload")}
						</Button>
					</Alert>
				)}
				{(() => {
					if (loading) {
						return (
							<div
								aria-hidden="true"
								className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5 sm:p-8"
							>
								<Skeleton className="h-5 w-2/3" />
								<Skeleton className="h-5 w-full" />
								<Skeleton className="h-5 w-5/6" />
								<Skeleton className="h-5 w-1/2" />
							</div>
						);
					}
					if (unavailable) {
						return null;
					}
					if (preview) {
						return (
							<div className="min-h-0 flex-1 overflow-y-auto">
								<article className="mx-auto w-full max-w-3xl p-5 leading-7 break-words text-foreground sm:p-8 [&_a]:text-signal [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm [&_h1]:mt-2 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_hr]:my-8 [&_hr]:border-border [&_input]:mr-2 [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:block [&_table]:border-collapse [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:p-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6">
									{content.trim() ? (
										<ReactMarkdown
											remarkPlugins={[remarkGfm]}
											skipHtml
											components={markdownComponents}
										>
											{content}
										</ReactMarkdown>
									) : (
										<p className="text-muted-foreground">
											{t("docs.emptyPreview")}
										</p>
									)}
								</article>
							</div>
						);
					}
					return (
						<Textarea
							aria-label={t("docs.content")}
							value={content}
							onChange={(event) => {
								setContent(event.target.value);
								retain(name, event.target.value);
							}}
							readOnly={!editable || busy}
							spellCheck
							className="mx-auto w-full max-w-3xl flex-1 resize-none p-5 sm:p-8"
							placeholder={editable ? t("docs.placeholder") : undefined}
						/>
					);
				})()}
			</section>
		);
	}
	return renderDocumentEditor();
}

export default function DocumentPage() {
	const user = useCurrentUser();
	const params = useSearchParams();
	const id = params.get("id");
	// Remount on document navigation so a previous request or unsaved buffer cannot cross documents.
	return user ? (
		<DocumentEditor
			key={`${user.id}:${id ?? `new:${params.get("parent") ?? ""}`}`}
			userId={user.id}
			id={id}
			parentId={params.get("parent")}
		/>
	) : null;
}
