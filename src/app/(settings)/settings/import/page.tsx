"use client";
import { Upload } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { importMessageFiles } from "@/components/settings/import-messages-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	FieldLabel,
	Field,
	FieldGroup,
	FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { withCleanup } from "@/lib/async-cleanup";
import type { TranslationKey } from "@/lib/i18n/types";
import { cn as scopeLayoutClasses } from "@/lib/utils";

import type {
	ImapFormState,
	ImportResult,
	ImportSourceItem,
	ImportSourceSection,
	ImportTab,
	ImportProgress,
} from "./types";
import {
	ensureImportDestination,
	fetchImapFolders,
	filterCustomImapFolders,
	formatImportResult,
	getFileImportSource,
	getFolderImportSource,
	getSelectedImportSources,
	importFromImap,
	importSourceOptions,
	resolveImapSourceFolder,
} from "./utils";

const initialImapForm: ImapFormState = {
	folder: "INBOX",
	host: "",
	importAll: true,
	limit: "100",
	password: "",
	port: "993",
	secure: true,
	username: "",
};
const defaultSections = importSourceOptions.map((option) => option.value);
const SECTION_LABEL_KEYS: Record<ImportSourceSection, TranslationKey> = {
	archived: "navigation.archived",
	drafts: "navigation.drafts",
	inbox: "navigation.inbox",
	others: "importPage.others",
	sent: "navigation.sent",
	spam: "navigation.spam",
	trash: "navigation.trash",
};
function mergeImportResult(total: ImportResult, result: ImportResult) {
	total.imported = (total.imported ?? 0) + (result.imported ?? 0);
	total.skipped = (total.skipped ?? 0) + (result.skipped ?? 0);
	total.errors = [...(total.errors ?? []), ...(result.errors ?? [])];
}

export default function SettingsImportPage() {
	const { t } = useLanguage();
	// System sections are translated; folders discovered on the source keep their own names.
	const sourceLabel = (source: ImportSourceItem) =>
		source.sourceSection
			? t(SECTION_LABEL_KEYS[source.sourceSection])
			: source.label;
	const { selectedMailbox } = useSelectedMailbox();
	const [activeTab, setActiveTab] = useState<ImportTab>("file");
	const [selectedSections, setSelectedSections] =
		useState<ImportSourceSection[]>(defaultSections);

	const [files, setFiles] = useState<File[]>([]);
	const [fileResult, setFileResult] = useState<ImportResult | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const [fileLoading, setFileLoading] = useState(false);
	const [fileProgress, setFileProgress] = useState<ImportProgress | null>(null);
	const [imapForm, setImapForm] = useState<ImapFormState>(initialImapForm);
	const [imapResult, setImapResult] = useState<ImportResult | null>(null);
	const [imapError, setImapError] = useState<string | null>(null);
	const [imapLoading, setImapLoading] = useState(false);
	const [imapProgress, setImapProgress] = useState<ImportProgress | null>(null);
	const selectedSources = useMemo(
		() => getSelectedImportSources(selectedSections),
		[selectedSections]
	);
	const fileImportSource = getFileImportSource(selectedSources);

	function toggleSection(section: ImportSourceSection, checked: boolean) {
		setSelectedSections((current) => {
			if (checked) {
				return current.includes(section) ? current : [...current, section];
			}
			return current.filter((item) => item !== section);
		});
	}
	function getDestination(source: ImportSourceItem): Promise<string> {
		if (!selectedMailbox?.id) {
			throw new Error(t("importPage.selectMailboxFirst"));
		}
		return ensureImportDestination(selectedMailbox.id, source);
	}
	function onFileSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox?.id || selectedSources.length === 0) {
			return;
		}
		setFileLoading(true);
		setFileError(null);
		setFileResult(null);
		setFileProgress({
			completed: 0,
			label: t("importPage.preparing"),
			total: 100,
		});
		return withCleanup(
			async () => {
				try {
					const destination = await getDestination(fileImportSource);
					const result = await importMessageFiles(
						selectedMailbox.id,
						files,
						destination,
						(percentage) =>
							setFileProgress({
								completed: percentage,
								label:
									percentage < 70
										? t("importPage.uploading")
										: t("importPage.importingMessages"),
								total: 100,
							})
					);
					setFileResult(result);
					window.dispatchEvent(new Event("mailflare:messages-changed"));
				} catch (error) {
					setFileError(
						error instanceof Error ? error.message : t("importPage.fileFailed")
					);
				}
			},
			() => {
				setFileLoading(false);
			}
		);
	}
	function onImapSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox?.id || selectedSources.length === 0) {
			return;
		}
		setImapLoading(true);
		setImapError(null);
		setImapResult(null);
		setImapProgress({
			completed: 0,
			label: t("importPage.discovering"),
			total: 1,
		});
		return withCleanup(
			async () => {
				try {
					const total: ImportResult = { errors: [], imported: 0, skipped: 0 };
					const discoveredFolders = await fetchImapFolders(imapForm);
					const expandedSources: ImportSourceItem[] = [];
					for (const source of selectedSources) {
						if (source.id === "system:others") {
							expandedSources.push(
								...filterCustomImapFolders(
									discoveredFolders,
									selectedSources
								).map(getFolderImportSource)
							);
						} else {
							expandedSources.push(source);
						}
					}
					for (const [index, source] of expandedSources.entries()) {
						setImapProgress({
							completed: index,
							label: t("importPage.importingSource", {
								source: sourceLabel(source),
							}),
							total: expandedSources.length,
						});
						// oxlint-disable-next-line no-await-in-loop -- Destination creation must precede imports; folders run serially to bound server load.
						const destination = await getDestination(source);
						const folder = resolveImapSourceFolder(source, discoveredFolders);
						let offset = 0;
						let processed = 0;
						// Newest messages first, one batch per request. Without "import all"
						// only the newest batch is imported.
						while (true) {
							// oxlint-disable-next-line no-await-in-loop -- The next batch depends on the offset returned by this batch.
							const result = await importFromImap(
								selectedMailbox.id,
								{ ...imapForm, folder },
								destination,
								offset
							);
							mergeImportResult(total, result);
							processed +=
								(result.imported ?? 0) +
								(result.skipped ?? 0) +
								(result.errors?.length ?? 0);
							if (
								!imapForm.importAll ||
								result.nextOffset === null ||
								result.nextOffset === undefined ||
								result.nextOffset <= offset
							) {
								break;
							}
							offset = result.nextOffset;
							setImapProgress({
								completed: index,
								label: t("importPage.importingSourceProgress", {
									processed,
									source: sourceLabel(source),
									total: result.total ?? "?",
								}),
								total: expandedSources.length,
							});
						}
						setImapProgress({
							completed: index + 1,
							label: t("importPage.importedSource", {
								source: sourceLabel(source),
							}),
							total: expandedSources.length,
						});
					}
					setImapResult(total);
					setImapForm((current) => ({ ...current, password: "" }));
					window.dispatchEvent(new Event("mailflare:messages-changed"));
				} catch (error) {
					setImapError(
						error instanceof Error ? error.message : t("importPage.imapFailed")
					);
				}
			},
			() => {
				setImapLoading(false);
			}
		);
	}

	function renderImapForm() {
		return (
			<form onSubmit={onImapSubmit}>
				<FieldGroup>
					<div
						className={scopeLayoutClasses(
							"grid gap-3",
							"md:grid-cols-[1fr_110px]"
						)}
					>
						<Field>
							<FieldLabel htmlFor="imap-host">
								{t("importPage.host")}
							</FieldLabel>
							<Input
								id="imap-host"
								value={imapForm.host}
								onChange={(event) =>
									setImapForm({
										...imapForm,
										host: event.target.value,
									})
								}
								placeholder="imap.gmail.com"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="imap-port">
								{t("importPage.port")}
							</FieldLabel>
							<Input
								id="imap-port"
								type="number"
								value={imapForm.port}
								onChange={(event) =>
									setImapForm({
										...imapForm,
										port: event.target.value,
									})
								}
							/>
						</Field>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="imap-username">
								{t("importPage.username")}
							</FieldLabel>
							<Input
								id="imap-username"
								value={imapForm.username}
								onChange={(event) =>
									setImapForm({
										...imapForm,
										username: event.target.value,
									})
								}
								placeholder="you@example.com"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="imap-password">
								{t("importPage.passwordOrApp")}
							</FieldLabel>
							<Input
								id="imap-password"
								type="password"
								value={imapForm.password}
								onChange={(event) =>
									setImapForm({
										...imapForm,
										password: event.target.value,
									})
								}
								autoComplete="off"
							/>
						</Field>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="imap-limit">
								{imapForm.importAll
									? t("importPage.perBatch")
									: t("importPage.perSource")}
							</FieldLabel>
							<Input
								id="imap-limit"
								type="number"
								min={1}
								max={100}
								value={imapForm.limit}
								onChange={(event) =>
									setImapForm({
										...imapForm,
										limit: event.target.value,
									})
								}
							/>
						</Field>
						<Field orientation="horizontal">
							<FieldLabel className="min-h-11 w-full items-center">
								<Checkbox
									checked={imapForm.importAll}
									onCheckedChange={(checked) =>
										setImapForm({
											...imapForm,
											importAll: checked === true,
										})
									}
								/>
								{t("importPage.importAll")}
							</FieldLabel>
						</Field>
						<Field orientation="horizontal">
							<FieldLabel className="min-h-11 w-full items-center">
								<Checkbox
									checked={imapForm.secure}
									onCheckedChange={(checked) =>
										setImapForm({
											...imapForm,
											secure: checked === true,
										})
									}
								/>
								{t("importPage.useTls")}
							</FieldLabel>
						</Field>
					</div>
					<Alert variant="muted">
						<AlertDescription>{t("importPage.imapNote")}</AlertDescription>
					</Alert>
					<Button
						type="submit"
						disabled={
							!selectedMailbox ||
							selectedSources.length === 0 ||
							!imapForm.host ||
							!imapForm.username ||
							!imapForm.password ||
							imapLoading
						}
					>
						<Upload data-icon="inline-start" />
						{imapLoading
							? t("import.importing")
							: t("importPage.importSources")}
					</Button>
					{imapProgress && (
						<div
							className="flex flex-col gap-1 text-xs text-muted-foreground"
							aria-live="polite"
						>
							<div className="flex justify-between">
								<span>{imapProgress.label}</span>
								<span>
									{imapProgress.completed}/{imapProgress.total}
								</span>
							</div>
							<Progress
								value={Math.round(
									(imapProgress.completed / imapProgress.total) * 100
								)}
							/>
						</div>
					)}
					{imapResult && (
						<Alert variant="success">
							<AlertDescription>
								{formatImportResult(imapResult, t)}
							</AlertDescription>
						</Alert>
					)}
					{imapError && (
						<Alert variant="error">
							<AlertDescription>{imapError}</AlertDescription>
						</Alert>
					)}
				</FieldGroup>
			</form>
		);
	}
	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("settings.nav.import")}</PageTitle>
				</PageHeaderText>
			</PageHeader>

			<Card>
				<CardHeader>
					<CardTitle>{t("importPage.title")}</CardTitle>
					<CardDescription>{t("importPage.description")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<Field>
						<FieldLabel htmlFor="import-source">
							{t("importPage.source")}
						</FieldLabel>
						<ToggleGroup
							type="single"
							variant="outline"
							value={activeTab}
							onValueChange={(next) => {
								if (next) {
									setActiveTab(next as ImportTab);
								}
							}}
							aria-label={t("importPage.source")}
							className="w-full justify-start"
						>
							<ToggleGroupItem value="file" className="flex-1">
								{t("importPage.backupFile")}
							</ToggleGroupItem>
							<ToggleGroupItem value="imap" className="flex-1">
								{t("importPage.imap")}
							</ToggleGroupItem>
						</ToggleGroup>
					</Field>
					<Field>
						<FieldLabel>{t("importPage.chooseSections")}</FieldLabel>
						<ToggleGroup
							type="multiple"
							variant="outline"
							value={selectedSections}
							onValueChange={(next) => {
								for (const option of importSourceOptions) {
									if (
										next.includes(option.value) !==
										selectedSections.includes(option.value)
									) {
										toggleSection(option.value, next.includes(option.value));
									}
								}
							}}
							className="flex w-full flex-wrap justify-start"
						>
							{importSourceOptions.map((option) => (
								<ToggleGroupItem
									key={option.value}
									value={option.value}
									className="min-w-20 flex-1"
								>
									{t(SECTION_LABEL_KEYS[option.value])}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</Field>

					{activeTab === "file" ? (
						<form onSubmit={onFileSubmit}>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="import-files">
										{t("importPage.selectFile")}
									</FieldLabel>
									<Input
										id="import-files"
										type="file"
										accept=".eml,.mbox,.mbx,message/rfc822,application/mbox"
										multiple
										onChange={(event) =>
											setFiles([...(event.target.files ?? [])])
										}
									/>
									<FieldDescription>
										{t("importPage.fileHint", {
											section: sourceLabel(fileImportSource),
										})}
									</FieldDescription>
								</Field>
								{selectedSections.includes("others") && (
									<Alert variant="warning">
										<AlertDescription>
											{t("importPage.othersNote")}
										</AlertDescription>
									</Alert>
								)}
								<Button
									type="submit"
									disabled={
										!selectedMailbox ||
										selectedSources.length === 0 ||
										files.length === 0 ||
										fileLoading
									}
								>
									{fileLoading
										? t("import.importing")
										: t("importPage.importFiles")}
								</Button>
								{fileProgress && (
									<div
										className="flex flex-col gap-1 text-xs text-muted-foreground"
										aria-live="polite"
									>
										<div className="flex justify-between">
											<span>{fileProgress.label}</span>
											<span>{fileProgress.completed}%</span>
										</div>
										<Progress value={fileProgress.completed} />
									</div>
								)}
								{fileResult && (
									<Alert variant="success">
										<AlertDescription>
											{formatImportResult(fileResult, t)}
										</AlertDescription>
									</Alert>
								)}
								{fileError && (
									<Alert variant="error">
										<AlertDescription>{fileError}</AlertDescription>
									</Alert>
								)}
							</FieldGroup>
						</form>
					) : (
						renderImapForm()
					)}
				</CardContent>
			</Card>
		</div>
	);
}
