"use client";

import {
	ChevronUp,
	FileText,
	Forward,
	Maximize2,
	Minimize2,
	Minus,
	Paperclip,
	Reply,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { toast as notify } from "sonner";

import { SendReview } from "@/components/agent/send-review";
import type { ReviewSnapshot } from "@/components/agent/send-review-types";
import { useCompose } from "@/components/compose/compose-context";
import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { useIsMobile } from "@/components/sidebar-mobile-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Item } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { requireSuccessfulResponse, withCleanup } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import { formatEmailAddress, getEmailAddress } from "@/lib/email/address";
import { haptic } from "@/lib/haptics";
import { useRouter } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import type { ComposeAttachmentPolicy } from "./attachment-policy-types";
import { RecipientInput } from "./recipient-input";
import {
	headerToRecipients,
	isValidRecipient,
	recipientsToHeader,
} from "./recipient-utils";
import { RichTextEditor } from "./rich-text-editor";
import {
	applyMailboxSignatureHtml,
	hasMeaningfulHtml,
	htmlToPlainText,
	joinQuotedHtml,
	splitQuotedHtml,
	textToHtml,
} from "./rich-text-utils";
import { ScheduleSendMenu } from "./schedule-send-menu";
import { isPastSchedule } from "./schedule-send-utils";
import type {
	ComposeAttachment,
	ComposeStoredAttachment,
	ComposeThreading,
} from "./types";
import { useSheetViewport } from "./use-sheet-viewport";
import {
	buildSendFormData,
	draftThreading,
	fetchDraft,
	formatAttachmentSize,
} from "./utils";

type Toast = { type: "success" | "error"; message: string } | null;

function useComposeForm({
	mode = "page",
	draftIdToLoad,
	onClose,
}: {
	mode?: "page" | "popup";
	draftIdToLoad?: string | null;
	onClose?: () => void;
}) {
	const { t } = useLanguage();
	const translateEffect = useEffectEvent(t);
	const router = useRouter();
	const { showNotice, openDraftComposer } = useCompose();
	const { selectedMailbox, setSelectedMailbox, mailboxes } =
		useSelectedMailbox();
	const [draftId, setDraftId] = useState<string | null>(null);
	const [agentRevision, setAgentRevision] = useState<number | null>(null);
	const [agentReview, setAgentReview] = useState<{
		approvalId: string;
		snapshot: ReviewSnapshot;
	} | null>(null);
	const [to, setTo] = useState<string[]>([]);
	const [cc, setCc] = useState<string[]>([]);
	const [bcc, setBcc] = useState<string[]>([]);
	const [showCc, setShowCc] = useState(false);
	const [showBcc, setShowBcc] = useState(false);
	const [threading, setThreading] = useState<ComposeThreading | null>(null);
	const [subject, setSubject] = useState("");
	// The body is HTML; quoted/forwarded content is kept aside and folded.
	const [html, setHtml] = useState("");
	const [quotedHtml, setQuotedHtml] = useState<string | null>(null);
	const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
	// Attachments the draft already holds server-side (a forwarded message's files).
	const [storedAttachments, setStoredAttachments] = useState<
		ComposeStoredAttachment[]
	>([]);
	const [attachmentPolicy, setAttachmentPolicy] =
		useState<ComposeAttachmentPolicy>({
			cloudThresholdBytes: 3_000_000,
			maxMb: 25,
		});
	const [draggingFiles, setDraggingFiles] = useState(false);
	const [modalMode, setModalMode] = useState(false);
	const [minimized, setMinimized] = useState(false);
	const [toast, setToast] = useState<Toast>(null);
	const [loading, setLoading] = useState(false);
	const [loadingDraft, setLoadingDraft] = useState(!!draftIdToLoad);
	const [deletingDraft, setDeletingDraft] = useState(false);
	const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
	const [loadedDraftMailboxId, setLoadedDraftMailboxId] = useState<
		string | null
	>(null);
	const [requestedFrom, setRequestedFrom] = useState("");
	const formRef = useRef<HTMLFormElement>(null);
	useSheetViewport(formRef, mode === "popup");
	const isPhone = useIsMobile();
	const phoneSheet = mode === "popup" && isPhone;
	const [closing, setClosing] = useState(false);
	const dragStart = useRef<number | null>(null);
	const [dragY, setDragY] = useState(0);

	// Phones: slide the sheet away and let the page behind grow back before unmounting.
	function dismiss() {
		if (!onClose) {
			return;
		}
		if (!phoneSheet || closing) {
			onClose();
			return;
		}
		setClosing(true);
		window.setTimeout(onClose, 260);
	}

	const sheetDrag = phoneSheet
		? {
				onTouchEnd: () => {
					dragStart.current = null;
					if (dragY > 110) {
						dismiss();
					}
					setDragY(0);
				},
				onTouchMove: (event: React.TouchEvent) => {
					if (dragStart.current !== null) {
						setDragY(Math.max(0, event.touches[0].clientY - dragStart.current));
					}
				},
				onTouchStart: (event: React.TouchEvent) => {
					dragStart.current = event.touches[0].clientY;
				},
			}
		: {};
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSave = useRef<(() => Promise<void>) | null>(null);
	const draftGeneration = useRef(0);
	const draftIdRef = useRef<string | null>(null);
	const saveQueue = useRef<Promise<void>>(Promise.resolve());
	const uploadedFiles = useRef(new WeakSet<File>());
	const rejectedFiles = useRef(new WeakSet<File>());
	const attachmentInput = useRef<HTMLInputElement | null>(null);
	const fileDragDepth = useRef(0);

	useEffect(() => {
		if (!selectedMailbox && mailboxes.length === 1) {
			setSelectedMailbox(mailboxes[0]);
		}
	}, [mailboxes, selectedMailbox, setSelectedMailbox]);

	useEffect(() => {
		let active = true;
		void authFetch("/api/attachment-policy", { cache: "no-store" })
			.then(async (response) => {
				if (response.ok && active) {
					setAttachmentPolicy(
						(await response.json()) as ComposeAttachmentPolicy
					);
				}

				return null;
			})
			.catch(() => {
				// Keep the current UI state when this optional background request fails.
			});
		return () => {
			active = false;
		};
	}, []);

	const senderAddresses = useMemo(() => {
		if (!selectedMailbox) {
			return [];
		}
		return selectedMailbox.senderAddresses?.length
			? selectedMailbox.senderAddresses
			: [`${selectedMailbox.localPart}@${selectedMailbox.hostname}`];
	}, [selectedMailbox]);
	const senderOptions = useMemo(
		() =>
			mailboxes.flatMap((mailbox) => {
				const addresses = mailbox.senderAddresses?.length
					? mailbox.senderAddresses
					: [`${mailbox.localPart}@${mailbox.hostname}`];
				return addresses.map((address) => ({ address, mailbox }));
			}),
		[mailboxes]
	);
	const selectedFrom = senderAddresses.includes(requestedFrom)
		? requestedFrom
		: (senderAddresses[0] ?? "");
	const fromAddr =
		selectedMailbox && selectedFrom
			? formatEmailAddress(selectedFrom, selectedMailbox.displayName)
			: "";

	useEffect(() => {
		if (!toast) {
			return;
		}
		notify[toast.type](toast.message);
		const timer = setTimeout(() => setToast(null), 3200);
		return () => clearTimeout(timer);
	}, [toast]);

	useEffect(() => {
		if (!draftIdToLoad) {
			return;
		}

		const idToLoad = draftIdToLoad;
		let cancelled = false;
		async function loadDraft() {
			try {
				const draft = await fetchDraft(idToLoad);
				if (cancelled) {
					return;
				}

				draftIdRef.current = draft.id;
				setDraftId(draft.id);
				setAgentRevision(draft.agent?.revision ?? null);
				setScheduledAt(
					draft.agent?.scheduledAt ? new Date(draft.agent.scheduledAt) : null
				);
				setTo(headerToRecipients(draft.toAddr));
				const draftCc = headerToRecipients(draft.ccAddr);
				const draftBcc = headerToRecipients(draft.bccAddr);
				setCc(draftCc);
				setBcc(draftBcc);
				setShowCc(draftCc.length > 0);
				setShowBcc(draftBcc.length > 0);
				setThreading(
					draft.inReplyTo || draft.threadId
						? {
								inReplyTo: draft.inReplyTo ?? null,
								references: draft.references ?? null,
								threadId: draft.threadId ?? null,
							}
						: null
				);
				setSubject(draft.subject ?? "");
				const stored = splitQuotedHtml(
					draft.htmlBody || textToHtml(draft.textBody)
				);
				setHtml(stored.body);
				setQuotedHtml(stored.quoted);
				setStoredAttachments(
					draft.attachments?.filter(
						(item) => item.disposition === "attachment"
					) ?? []
				);
				setLoadedDraftMailboxId(draft.mailboxId);
				setRequestedFrom(getEmailAddress(draft.fromAddr).toLowerCase());
			} catch (error) {
				if (cancelled) {
					return;
				}
				const message =
					error instanceof Error
						? error.message
						: translateEffect("compose.error.loadDraft");
				setToast({ message, type: "error" });
			}
			if (!cancelled) {
				setLoadingDraft(false);
			}
		}
		void loadDraft();

		return () => {
			cancelled = true;
		};
	}, [draftIdToLoad]);

	useEffect(() => {
		if (!loadedDraftMailboxId) {
			return;
		}
		if (selectedMailbox?.id === loadedDraftMailboxId) {
			return;
		}

		const draftMailbox = mailboxes.find(
			(mailbox) => mailbox.id === loadedDraftMailboxId
		);
		if (draftMailbox) {
			setSelectedMailbox(draftMailbox);
		}
	}, [
		loadedDraftMailboxId,
		mailboxes,
		selectedMailbox?.id,
		setSelectedMailbox,
	]);

	const signature = selectedMailbox?.signature ?? "";
	const [appliedSignature, setAppliedSignature] = useState("");
	if (!loadingDraft && appliedSignature !== signature) {
		setAppliedSignature(signature);
		setHtml((current) =>
			applyMailboxSignatureHtml(current, appliedSignature, signature)
		);
	}

	useEffect(
		() => () => {
			void pendingSave.current?.();
		},
		[]
	);

	useEffect(() => {
		pendingSave.current = null;
		const bodyContent = htmlToPlainText(html).trim();
		const signatureOnly =
			bodyContent === (selectedMailbox?.signature?.trim() ?? "");
		const hasContent =
			to.length > 0 ||
			cc.length > 0 ||
			bcc.length > 0 ||
			subject.trim() ||
			quotedHtml ||
			attachments.length > 0 ||
			(bodyContent && !signatureOnly);
		if (!fromAddr || !hasContent || loadingDraft) {
			return;
		}
		if (saveTimer.current) {
			clearTimeout(saveTimer.current);
		}

		const generation = draftGeneration.current;
		const save = () => {
			const run = (async () => {
				await saveQueue.current
					.then(async () => {
						if (generation !== draftGeneration.current) {
							return null;
						}
						const payload = {
							bcc: recipientsToHeader(bcc),
							cc: recipientsToHeader(cc),
							from: fromAddr,
							html: joinQuotedHtml(html, quotedHtml),
							...draftThreading(threading),
							mailboxId: selectedMailbox?.id,
							subject,
							text: htmlToPlainText(joinQuotedHtml(html, quotedHtml)),
							to: recipientsToHeader(to),
						};
						const existingId = draftIdRef.current;
						const res = await authFetch(
							existingId ? `/api/drafts/${existingId}` : "/api/drafts",
							{
								body: JSON.stringify(payload),
								headers: { "Content-Type": "application/json" },
								method: existingId ? "PATCH" : "POST",
							}
						);
						const data = (await res.json()) as { draft?: { id: string } };
						if (!res.ok || !data.draft?.id) {
							return null;
						}
						if (generation !== draftGeneration.current) {
							if (!existingId) {
								void authFetch(`/api/drafts/${data.draft.id}`, {
									method: "DELETE",
								});
							}
							return null;
						}
						draftIdRef.current = data.draft.id;
						setDraftId(data.draft.id);
						const pending = attachments.filter(
							(attachment) =>
								!uploadedFiles.current.has(attachment.file) &&
								!rejectedFiles.current.has(attachment.file)
						);
						if (agentRevision !== null || pending.length === 0) {
							return null;
						}
						const form = new FormData();
						for (const attachment of pending) {
							form.append("attachments", attachment.file);
						}
						const uploaded = await authFetch(
							`/api/drafts/${data.draft.id}/attachments`,
							{ body: form, method: "POST" }
						);
						const result = (await uploaded.json()) as {
							attachments?: ComposeStoredAttachment[];
							error?: string;
						};
						if (!uploaded.ok) {
							for (const attachment of pending) {
								rejectedFiles.current.add(attachment.file);
							}
							setToast({
								message:
									result.error ||
									translateEffect("compose.error.draftAttachments"),
								type: "error",
							});
							return null;
						}
						for (const attachment of pending) {
							uploadedFiles.current.add(attachment.file);
						}
						setStoredAttachments((current) => [
							...current,
							...(result.attachments ?? []),
						]);
						setAttachments((current) =>
							current.filter(
								(attachment) => !uploadedFiles.current.has(attachment.file)
							)
						);

						return null;
					})
					.catch(() => {
						// Keep the current UI state when this optional background request fails.
					});
			})();
			saveQueue.current = run;
			return run;
		};
		pendingSave.current = save;
		saveTimer.current = setTimeout(() => {
			pendingSave.current = null;
			void save();
		}, 900);

		return () => {
			if (saveTimer.current) {
				clearTimeout(saveTimer.current);
			}
		};
	}, [
		agentRevision,
		attachments,
		bcc,
		cc,
		fromAddr,
		html,
		loadingDraft,
		quotedHtml,
		selectedMailbox?.id,
		selectedMailbox?.signature,
		subject,
		threading,
		to,
	]);

	useEffect(() => {
		if (!draftIdToLoad || loadingDraft) {
			return;
		}
		formRef.current
			?.querySelector<HTMLElement>("[contenteditable='true']")
			?.focus();
	}, [draftIdToLoad, loadingDraft]);

	async function cancelSend(messageId: string) {
		try {
			const res = await authFetch(
				`/api/messages/${messageId}/cancel-schedule`,
				{ method: "POST" }
			);
			if (!res.ok) {
				showNotice(t("compose.cancelTooLate"));
				return;
			}
			showNotice(t("compose.sendCancelled"));
			window.dispatchEvent(new Event("mailflare:messages-changed"));
			openDraftComposer(messageId);
		} catch {
			showNotice(t("compose.cancelTooLate"));
		}
	}

	function validateSend() {
		if (to.length === 0) {
			return t("compose.error.noRecipient");
		}
		const invalid = [...to, ...cc, ...bcc].find(
			(entry) => !isValidRecipient(entry)
		);
		if (invalid) {
			return t("compose.error.invalidAddress", { address: invalid });
		}
		if (!hasMeaningfulHtml(html) && !quotedHtml) {
			return t("compose.error.emptyBody");
		}
		if (scheduledAt && isPastSchedule(scheduledAt)) {
			return t("schedule.pastTime");
		}
		return null;
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const validationError = validateSend();
		if (validationError) {
			setToast({ message: validationError, type: "error" });
			return;
		}
		// Still inside the tap, which iOS needs for the haptic to play.
		if (!(draftId && agentRevision !== null)) {
			haptic("impact");
		}
		if (saveTimer.current) {
			clearTimeout(saveTimer.current);
		}
		pendingSave.current = null;
		setLoading(true);
		await saveQueue.current;
		const currentDraftId = draftIdRef.current;
		const unsentAttachments = attachments.filter(
			(attachment) => !uploadedFiles.current.has(attachment.file)
		);
		const fullHtml = joinQuotedHtml(html, quotedHtml);
		if (draftId && agentRevision !== null) {
			await withCleanup(
				async () => {
					try {
						if (saveTimer.current) {
							clearTimeout(saveTimer.current);
						}
						if (attachments.length > 0) {
							const form = new FormData();
							for (const attachment of attachments) {
								form.append("attachments", attachment.file);
							}
							const uploaded = await authFetch(
								`/api/drafts/${draftId}/attachments`,
								{ body: form, method: "POST" }
							);
							const result = (await uploaded.json()) as {
								attachments?: ComposeStoredAttachment[];
								error?: string;
							};
							if (!uploaded.ok) {
								requireSuccessfulResponse(
									uploaded,
									result.error || t("compose.error.draftAttachments")
								);
							}
							setStoredAttachments((current) => [
								...current,
								...(result.attachments ?? []),
							]);
							setAttachments([]);
						}
						const updated = await authFetch(`/api/drafts/${draftId}`, {
							body: JSON.stringify({
								bcc: recipientsToHeader(bcc),
								cc: recipientsToHeader(cc),
								from: fromAddr,
								html: fullHtml,
								...draftThreading(threading),
								mailboxId: selectedMailbox?.id,
								scheduledAt: scheduledAt?.toISOString() ?? null,
								subject,
								text: htmlToPlainText(fullHtml),
								to: recipientsToHeader(to),
							}),
							headers: { "Content-Type": "application/json" },
							method: "PATCH",
						});
						if (!updated.ok) {
							requireSuccessfulResponse(
								updated,
								t("compose.error.saveForReview")
							);
						}
						const current = await fetchDraft(draftId);
						if (!current.agent) {
							requireSuccessfulResponse(
								{ ok: false },
								t("compose.error.aiMetadata")
							);
							return;
						}
						setAgentRevision(current.agent.revision);
						const response = await authFetch("/api/agent/approvals", {
							body: JSON.stringify({
								draftId,
								expectedRevision: current.agent.revision,
							}),
							headers: { "Content-Type": "application/json" },
							method: "POST",
						});
						const result = (await response.json()) as {
							approvalId?: string;
							snapshot?: ReviewSnapshot;
							error?: string;
						};
						if (!response.ok || !result.approvalId || !result.snapshot) {
							requireSuccessfulResponse(
								{ ok: false },
								result.error || t("compose.error.createReview")
							);
							return;
						}
						setAgentReview({
							approvalId: result.approvalId,
							snapshot: result.snapshot,
						});
					} catch (error) {
						setToast({
							message:
								error instanceof Error
									? error.message
									: t("compose.error.reviewDraft"),
							type: "error",
						});
					}
				},
				() => setLoading(false)
			);
			return;
		}
		let res: Response;
		let data: {
			messageId?: string;
			scheduled?: boolean;
			undoSeconds?: number;
			error?: string;
		};
		try {
			res = await authFetch("/api/send", {
				body: buildSendFormData({
					attachments: unsentAttachments,
					bcc: recipientsToHeader(bcc),
					cc: recipientsToHeader(cc),
					draftId,
					from: fromAddr,
					html: fullHtml,
					mailboxId: selectedMailbox?.id,
					scheduledAt,
					subject,
					text: htmlToPlainText(fullHtml),
					threading: threading ?? undefined,
					to: recipientsToHeader(to),
					undoSend: true,
				}),
				method: "POST",
			});
			data = (await res.json()) as {
				messageId?: string;
				scheduled?: boolean;
				undoSeconds?: number;
				error?: string;
			};
		} catch {
			setLoading(false);
			setToast({ message: t("compose.error.sendFailed"), type: "error" });
			return;
		}
		setLoading(false);

		if (!res.ok) {
			setToast({
				message: data.error ?? t("compose.error.sendFailed"),
				type: "error",
			});
			return;
		}

		if (currentDraftId) {
			void authFetch(`/api/drafts/${currentDraftId}`, {
				method: "DELETE",
			}).finally(() => {
				window.dispatchEvent(new Event("mailflare:messages-changed"));
			});
		}
		draftGeneration.current += 1;
		draftIdRef.current = null;
		setDraftId(null);
		setTo([]);
		setCc([]);
		setBcc([]);
		setShowCc(false);
		setShowBcc(false);
		setThreading(null);
		setStoredAttachments([]);
		setSubject("");
		setHtml(applyMailboxSignatureHtml("", "", selectedMailbox?.signature));
		setQuotedHtml(null);
		setAttachments([]);
		setScheduledAt(null);
		const sentMessageId = data.messageId;
		if (data.undoSeconds && sentMessageId) {
			// The send is queued for the undo window; Cancel puts the message back in Drafts and reopens it.
			showNotice(t("compose.sent"), {
				action: {
					label: t("compose.cancelSend"),
					onClick: () => cancelSend(sentMessageId),
				},
				durationMs: data.undoSeconds * 1000,
			});
			// Refresh the lists once the queue has had time to deliver it.
			setTimeout(
				() => window.dispatchEvent(new Event("mailflare:messages-changed")),
				(data.undoSeconds + 3) * 1000
			);
		} else {
			showNotice(data.scheduled ? t("compose.scheduled") : t("compose.sent"));
		}
		window.dispatchEvent(new Event("mailflare:messages-changed"));

		if (onClose) {
			dismiss();
			return;
		}
		router.push("/sent");
	}

	async function deleteDraftAndClose() {
		if (saveTimer.current) {
			clearTimeout(saveTimer.current);
		}
		pendingSave.current = null;
		draftGeneration.current += 1;
		setDeletingDraft(true);
		await saveQueue.current;

		if (draftIdRef.current) {
			let deleted = false;
			try {
				const res = await authFetch(`/api/drafts/${draftIdRef.current}`, {
					method: "DELETE",
				});
				deleted = res.ok || res.status === 404;
			} catch {
				deleted = false;
			}
			if (!deleted) {
				setDeletingDraft(false);
				setToast({ message: t("compose.error.deleteDraft"), type: "error" });
				return;
			}
		}

		draftIdRef.current = null;
		setDraftId(null);
		setTo([]);
		setCc([]);
		setBcc([]);
		setShowCc(false);
		setShowBcc(false);
		setThreading(null);
		setStoredAttachments([]);
		setSubject("");
		setHtml(applyMailboxSignatureHtml("", "", selectedMailbox?.signature));
		setQuotedHtml(null);
		setAttachments([]);
		setScheduledAt(null);
		window.dispatchEvent(new Event("mailflare:messages-changed"));

		if (onClose) {
			dismiss();
			return;
		}
		setDeletingDraft(false);
		router.push("/inbox");
	}

	async function removeStoredAttachment(attachmentId: string) {
		const currentDraftId = draftIdRef.current;
		if (!currentDraftId) {
			return;
		}
		const res = await authFetch(
			`/api/drafts/${currentDraftId}/attachments/${attachmentId}`,
			{ method: "DELETE" }
		);
		if (!res.ok) {
			setToast({ message: t("compose.error.removeAttachment"), type: "error" });
			return;
		}
		setStoredAttachments((current) =>
			current.filter((item) => item.id !== attachmentId)
		);
	}

	function addAttachments(files: FileList | null) {
		if (!files) {
			return;
		}
		const nextFiles = [...files];
		const nextCount =
			storedAttachments.length + attachments.length + nextFiles.length;
		const totalSize =
			storedAttachments.reduce((total, item) => total + item.size, 0) +
			[
				...attachments.map((attachment) => attachment.file),
				...nextFiles,
			].reduce((total, file) => total + file.size, 0);

		if (nextCount > 10) {
			setToast({ message: t("compose.error.maxAttachments"), type: "error" });
			return;
		}
		if (
			nextFiles.some((file) => file.size > attachmentPolicy.maxMb * 1_000_000)
		) {
			setToast({
				message: t("compose.error.attachmentSize", {
					max: attachmentPolicy.maxMb,
				}),
				type: "error",
			});
			return;
		}
		if (totalSize > attachmentPolicy.maxMb * 1_000_000) {
			setToast({
				message: t("compose.error.totalSize", { max: attachmentPolicy.maxMb }),
				type: "error",
			});
			return;
		}

		setAttachments((current) => [
			...current,
			...nextFiles.map((file) => ({ file, id: crypto.randomUUID() })),
		]);
		if (attachmentInput.current) {
			attachmentInput.current.value = "";
		}
	}

	function onFileDragEnter(event: DragEvent<HTMLFormElement>) {
		if (!event.dataTransfer.types.includes("Files")) {
			return;
		}
		fileDragDepth.current += 1;
		if (!loading && !loadingDraft) {
			setDraggingFiles(true);
		}
	}

	function onFileDragOver(event: DragEvent<HTMLFormElement>) {
		if (!event.dataTransfer.types.includes("Files")) {
			return;
		}
		event.preventDefault();
		event.dataTransfer.dropEffect = loading || loadingDraft ? "none" : "copy";
	}

	function onFileDragLeave(event: DragEvent<HTMLFormElement>) {
		if (!event.dataTransfer.types.includes("Files")) {
			return;
		}
		fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
		if (fileDragDepth.current === 0) {
			setDraggingFiles(false);
		}
	}

	function onFileDrop(event: DragEvent<HTMLFormElement>) {
		if (!event.dataTransfer.types.includes("Files")) {
			return;
		}
		event.preventDefault();
		fileDragDepth.current = 0;
		setDraggingFiles(false);
		if (!loading && !loadingDraft) {
			addAttachments(event.dataTransfer.files);
		}
	}

	useEffect(() => {
		const form = formRef.current;
		if (!form || !modalMode || minimized) {
			return;
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				setModalMode(false);
			}
		}
		form.addEventListener("keydown", onKeyDown);
		return () => form.removeEventListener("keydown", onKeyDown);
	}, [modalMode, minimized]);

	function selectSender(value: string) {
		const option = senderOptions.find(
			(item) => `${item.mailbox.id}|${item.address}` === value
		);
		if (!option) {
			return;
		}
		setRequestedFrom(option.address);
		if (selectedMailbox?.id !== option.mailbox.id) {
			setSelectedMailbox(option.mailbox);
		}
	}

	// Below md the popup is a bottom sheet: full width, anchored to the visual viewport (so the keyboard never covers the toolbar) and padded by the bottom safe area.
	const sheetClass =
		"compose-sheet max-md:inset-x-0 max-md:bottom-[var(--sheet-bottom,0px)] max-md:left-0 max-md:right-0 max-md:top-auto max-md:z-50 max-md:h-[var(--sheet-height,100dvh)] max-md:w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0 max-md:pt-safe max-md:pb-compose-safe";
	const getFrameClass = () => {
		if (mode === "popup") {
			if (minimized) {
				return cn(
					"fixed right-8 bottom-0 z-40 flex h-9 w-[min(260px,calc(100vw-32px))] flex-col overflow-hidden rounded-t-lg border border-border bg-card shadow-2xl",
					sheetClass
				);
			}
			return modalMode
				? cn(
						"fixed top-1/2 left-1/2 z-50 flex h-[86dvh] w-[min(860px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-card shadow-2xl",
						sheetClass
					)
				: cn(
						"fixed right-8 bottom-0 z-40 flex h-[min(580px,calc(100dvh-88px))] w-[min(680px,calc(100vw-32px))] flex-col overflow-hidden rounded-t-lg border border-border bg-card shadow-2xl",
						sheetClass
					);
		}
		return "relative flex h-full min-h-[720px] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm";
	};
	const frameClass = getFrameClass();

	const getFormRole = () => {
		if (modalMode && !minimized) {
			return "dialog";
		}
		return mode === "popup" ? "region" : undefined;
	};
	const getTitle = () => {
		if (loadingDraft) {
			return t("compose.title.loading");
		}
		if (threading?.inReplyTo) {
			return t("compose.title.reply");
		}
		if (/^fwd?:/iu.test(subject)) {
			return t("compose.title.forward");
		}
		return draftId ? t("compose.title.saved") : t("compose.title.new");
	};
	const getSendLabel = () => {
		if (loading) {
			return t("compose.preparing");
		}
		if (scheduledAt) {
			return t("compose.schedule");
		}
		return agentRevision === null ? t("compose.send") : t("compose.reviewSend");
	};

	return {
		addAttachments,
		agentReview,
		attachmentInput,
		attachmentPolicy,
		attachments,
		bcc,
		cc,
		closing,
		deleteDraftAndClose,
		deletingDraft,
		dismiss,
		draftIdToLoad,
		dragY,
		draggingFiles,
		formRef,
		frameClass,
		fromAddr,
		getFormRole,
		getSendLabel,
		getTitle,
		html,
		loading,
		loadingDraft,
		minimized,
		modalMode,
		mode,
		onClose,
		onFileDragEnter,
		onFileDragLeave,
		onFileDragOver,
		onFileDrop,
		onSubmit,
		quotedHtml,
		removeStoredAttachment,
		router,
		scheduledAt,
		selectSender,
		selectedFrom,
		selectedMailbox,
		senderOptions,
		setAgentReview,
		setAttachments,
		setBcc,
		setCc,
		setDraggingFiles,
		setHtml,
		setMinimized,
		setModalMode,
		setScheduledAt,
		setShowBcc,
		setShowCc,
		setSubject,
		setTo,
		sheetDrag,
		showBcc,
		showCc,
		storedAttachments,
		subject,
		t,
		threading,
		to,
	};
}

function ComposeAttachments({
	model,
}: {
	model: ReturnType<typeof useComposeForm>;
}) {
	const {
		t,
		attachmentPolicy,
		attachments,
		storedAttachments,
		removeStoredAttachment,
		setAttachments,
	} = model;
	return (
		(attachments.length > 0 || storedAttachments.length > 0) && (
			<div>
				<div className="flex min-w-0 flex-nowrap gap-2 overflow-x-auto overflow-y-hidden px-3 py-2">
					{storedAttachments.map((attachment) => (
						<Item
							variant="muted"
							size="sm"
							key={attachment.id}
							className="max-w-full shrink-0"
							title={t("compose.carriedOver")}
						>
							<FileText className="size-4 shrink-0 text-muted-foreground" />
							<span className="max-w-48 truncate">{attachment.filename}</span>
							<span className="text-muted-foreground">
								{formatAttachmentSize(attachment.size)}
							</span>
							<Button
								variant="ghost"
								size="icon-sm"
								type="button"
								onClick={() => removeStoredAttachment(attachment.id)}
							>
								<X data-icon="inline-start" />
								<span className="sr-only">{t("compose.removeAttachment")}</span>
							</Button>
						</Item>
					))}
					{attachments.map((attachment) => (
						<Item
							variant="muted"
							size="sm"
							key={attachment.id}
							className="max-w-full shrink-0"
						>
							<FileText className="size-4 shrink-0 text-muted-foreground" />
							<span className="max-w-48 truncate font-medium">
								{attachment.file.name}
							</span>
							<span className="text-muted-foreground">
								{formatAttachmentSize(attachment.file.size)}
							</span>
							<Button
								variant="ghost"
								size="icon-sm"
								type="button"
								onClick={() =>
									setAttachments((current) =>
										current.filter((item) => item.id !== attachment.id)
									)
								}
							>
								<X data-icon="inline-start" />
								<span className="sr-only">{t("compose.removeAttachment")}</span>
							</Button>
						</Item>
					))}
				</div>
				<p className="px-3 pb-2 text-warning">
					{[
						...attachments.map((item) => item.file.size),
						...storedAttachments.map((item) => item.size),
					].some((size) => size > attachmentPolicy.cloudThresholdBytes)
						? t("compose.cloudWarning.will")
						: t("compose.cloudWarning.may")}
				</p>
			</div>
		)
	);
}

function ComposeHeader({
	model,
}: {
	model: ReturnType<typeof useComposeForm>;
}) {
	const {
		mode,
		t,
		dismiss,
		modalMode,
		minimized,
		sheetDrag,
		threading,
		subject,
		getTitle,
		loading,
		loadingDraft,
		fromAddr,
		getSendLabel,
		setMinimized,
		setDraggingFiles,
		setModalMode,
	} = model;
	return (
		<div
			{...sheetDrag}
			className="flex h-9 shrink-0 items-center justify-between border-b bg-card px-3 font-medium text-foreground max-md:h-auto max-md:min-h-14 max-md:touch-none max-md:pt-safe"
		>
			<Button
				type="button"
				variant="ghost"
				onClick={dismiss}
				className="md:hidden"
			>
				{t("common.cancel")}
			</Button>
			<span className="flex min-w-0 items-center gap-2 truncate">
				{threading?.inReplyTo && (
					<Reply className="size-3.5 text-muted-foreground/50" />
				)}
				{!threading?.inReplyTo && /^fwd?:/iu.test(subject) && (
					<Forward className="size-3.5 text-muted-foreground/50" />
				)}
				{getTitle()}
			</span>
			<Button
				type="submit"
				disabled={loading || loadingDraft || !fromAddr}
				className="md:hidden"
			>
				{getSendLabel()}
			</Button>
			{mode === "popup" && (
				<div className="hidden shrink-0 items-center gap-1 md:flex">
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						onClick={() => {
							setMinimized((current) => !current);
							setDraggingFiles(false);
						}}
						aria-label={
							minimized ? t("compose.restore") : t("compose.minimize")
						}
						title={minimized ? t("compose.restore") : t("compose.minimize")}
						className="max-md:hidden"
					>
						{minimized ? <ChevronUp /> : <Minus />}
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						onClick={() => {
							if (minimized) {
								setMinimized(false);
							}
							setModalMode((current) => !current);
						}}
						aria-label={
							modalMode ? t("compose.restoreFloating") : t("compose.openModal")
						}
						title={
							modalMode ? t("compose.restoreFloating") : t("compose.openModal")
						}
						className="max-md:hidden"
					>
						{modalMode ? <Minimize2 /> : <Maximize2 />}
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						onClick={dismiss}
						aria-label={t("compose.close")}
					>
						<X data-icon="inline-start" />
					</Button>
				</div>
			)}
		</div>
	);
}

function ComposeAddressFields({
	model,
}: {
	model: ReturnType<typeof useComposeForm>;
}) {
	const {
		mode,
		draftIdToLoad,
		t,
		subject,
		loadingDraft,
		selectedMailbox,
		selectedFrom,
		selectSender,
		senderOptions,
		to,
		setTo,
		showCc,
		setShowCc,
		showBcc,
		setShowBcc,
		cc,
		setCc,
		bcc,
		setBcc,
		setSubject,
	} = model;
	return (
		<>
			<div className="flex flex-row items-center gap-2 border-b border-border px-4 py-1">
				<Label
					htmlFor={`${mode}-from`}
					className="w-10 shrink-0 text-muted-foreground"
				>
					{t("compose.from")}
				</Label>
				<NativeSelect
					id={`${mode}-from`}
					value={
						selectedMailbox && selectedFrom
							? `${selectedMailbox.id}|${selectedFrom}`
							: ""
					}
					onChange={(event) => selectSender(event.target.value)}
					// placeholder="Select a mailbox first"
					required
					disabled={loadingDraft || senderOptions.length === 0}
					size="sm"
					variant="ghost"
					containerClassName="flex-1"
				>
					{senderOptions.length === 0 && (
						<option value="">{t("compose.selectMailboxFirst")}</option>
					)}
					{senderOptions.map(({ mailbox, address }) => (
						<option
							key={`${mailbox.id}|${address}`}
							value={`${mailbox.id}|${address}`}
						>
							{address}
						</option>
					))}
				</NativeSelect>
			</div>
			<RecipientInput
				id={`${mode}-to`}
				label={t("compose.to")}
				value={to}
				onChange={setTo}
				placeholder={t("compose.toPlaceholder")}
				required
				autoFocus={!draftIdToLoad}
				disabled={loadingDraft}
				trailing={
					<>
						{!showCc && (
							<Button
								variant="ghost"
								size="icon"
								type="button"
								onClick={() => setShowCc(true)}
							>
								{t("compose.cc")}
							</Button>
						)}
						{!showBcc && (
							<Button
								variant="ghost"
								size="icon"
								type="button"
								onClick={() => setShowBcc(true)}
							>
								{t("compose.bcc")}
							</Button>
						)}
					</>
				}
			/>
			{showCc && (
				<RecipientInput
					id={`${mode}-cc`}
					label={t("compose.cc")}
					value={cc}
					onChange={setCc}
					placeholder={t("compose.ccPlaceholder")}
					disabled={loadingDraft}
					autoFocus={!loadingDraft && cc.length === 0}
				/>
			)}
			{showBcc && (
				<RecipientInput
					id={`${mode}-bcc`}
					label={t("compose.bcc")}
					value={bcc}
					onChange={setBcc}
					placeholder={t("compose.bccPlaceholder")}
					disabled={loadingDraft}
					autoFocus={!loadingDraft && bcc.length === 0}
				/>
			)}
			<div className="border-b border-border px-4 py-1">
				<Label htmlFor={`${mode}-subject`} className="sr-only">
					{t("compose.subject")}
				</Label>
				<Input
					variant="ghost"
					id={`${mode}-subject`}
					value={subject}
					onChange={(event) => setSubject(event.target.value)}
					placeholder={t("compose.subject")}
					required
					disabled={loadingDraft}
				/>
			</div>
		</>
	);
}
function ComposeSendControls({
	model,
}: {
	model: ReturnType<typeof useComposeForm>;
}) {
	const {
		loading,
		loadingDraft,
		fromAddr,
		getSendLabel,
		scheduledAt,
		setScheduledAt,
		selectedMailbox,
		setSubject,
		setHtml,
	} = model;
	return (
		<div className="flex items-center max-md:contents">
			<div className="flex items-center max-md:order-last max-md:ml-auto">
				<Button
					type="submit"
					size="sm"
					disabled={loading || loadingDraft || !fromAddr}
					className="max-md:hidden"
				>
					{getSendLabel()}
				</Button>
				<ScheduleSendMenu
					disabled={loading || loadingDraft || !fromAddr}
					value={scheduledAt}
					onChange={setScheduledAt}
					mailboxId={selectedMailbox?.id}
					from={fromAddr}
					onApplyTemplate={({ title, html: templateHtml }) => {
						setSubject((current) => (current.trim() ? current : title));
						setHtml((current) =>
							hasMeaningfulHtml(current)
								? `${current}${templateHtml}`
								: templateHtml
						);
					}}
				/>
			</div>
		</div>
	);
}

function ComposeAttachmentControls({
	model,
}: {
	model: ReturnType<typeof useComposeForm>;
}) {
	const {
		attachmentInput,
		addAttachments,
		t,
		attachmentPolicy,
		loading,
		loadingDraft,
		deleteDraftAndClose,
		deletingDraft,
	} = model;
	return (
		<>
			{/* <span className="mx-1 h-5 w-px bg-accent" /> */}
			<Input
				ref={attachmentInput}
				type="file"
				multiple
				className="hidden"
				onChange={(event) => addAttachments(event.target.files)}
			/>
			<HintTooltip
				label={t("compose.attachTooltip", {
					max: attachmentPolicy.maxMb,
				})}
			>
				<Button
					variant="ghost"
					size="icon"
					type="button"
					aria-label={t("compose.attachFiles")}
					onClick={() => attachmentInput.current?.click()}
					disabled={loading || loadingDraft}
				>
					<Paperclip data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<span className="flex-1 max-md:hidden" />
			<HintTooltip label={t("compose.deleteDraft")}>
				<Button
					variant="ghost"
					size="icon"
					type="button"
					aria-label={t("compose.deleteDraft")}
					onClick={() => deleteDraftAndClose()}
					disabled={loading || loadingDraft || deletingDraft}
				>
					<Trash2 data-icon="inline-start" />
				</Button>
			</HintTooltip>
		</>
	);
}

export function ComposeForm(props: {
	mode?: "page" | "popup";
	draftIdToLoad?: string | null;
	onClose?: () => void;
}) {
	const model = useComposeForm(props);
	const {
		mode,
		onClose,
		t,
		router,
		agentReview,
		setAgentReview,
		dismiss,
		modalMode,
		minimized,
		onSubmit,
		frameClass,
		dragY,
		closing,
		formRef,
		getFormRole,
		draggingFiles,
		onFileDragEnter,
		onFileDragOver,
		onFileDragLeave,
		onFileDrop,

		loadingDraft,
		html,
		setHtml,
		quotedHtml,
	} = model;
	return (
		<>
			{agentReview && (
				<SendReview
					approvalId={agentReview.approvalId}
					snapshot={agentReview.snapshot}
					onClose={() => setAgentReview(null)}
					onSent={() => {
						setAgentReview(null);
						if (onClose) {
							dismiss();
						} else {
							router.push("/sent");
						}
					}}
				/>
			)}
			{mode === "popup" && modalMode && !minimized && (
				<div
					className="fixed inset-0 z-40 bg-foreground/65"
					aria-hidden="true"
				/>
			)}

			<form
				onSubmit={onSubmit}
				className={`[transform:var(--mf-transform)] ${cn(frameClass, dragY && "transition-none", closing && "compose-sheet-closing")}`}
				style={
					(dragY
						? {
								"--mf-transform": `translateY(${dragY}px)`,
							}
						: undefined) as CSSProperties &
						Record<`--${string}`, string | number | undefined>
				}
				ref={formRef}
				role={getFormRole()}
				aria-modal={(modalMode && !minimized) || undefined}
				aria-label={mode === "popup" ? t("compose.dialogLabel") : undefined}
				onDragEnterCapture={minimized ? undefined : onFileDragEnter}
				onDragOverCapture={minimized ? undefined : onFileDragOver}
				onDragLeaveCapture={minimized ? undefined : onFileDragLeave}
				onDropCapture={minimized ? undefined : onFileDrop}
			>
				{draggingFiles && !minimized && (
					<div
						className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-ring bg-signal-soft/90 text-sm font-medium text-signal"
						aria-hidden="true"
					>
						{t("compose.dropFiles")}
					</div>
				)}
				<ComposeHeader model={model} />
				<div
					className={cn("flex min-h-0 flex-1 flex-col", minimized && "hidden")}
				>
					<ComposeAddressFields model={model} />
					<Label htmlFor={`${mode}-text`} className="sr-only">
						{t("compose.body")}
					</Label>
					<RichTextEditor
						id={`${mode}-text`}
						value={html}
						onChange={setHtml}
						quotedHtml={quotedHtml}
						disabled={loadingDraft}
						placeholder={t("compose.bodyPlaceholder")}
						footerContent={<ComposeAttachments model={model} />}
						toolbarStart={<ComposeSendControls model={model} />}
						toolbarEnd={<ComposeAttachmentControls model={model} />}
					/>
				</div>
			</form>
		</>
	);
}
