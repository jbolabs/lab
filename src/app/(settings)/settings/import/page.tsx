"use client";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Folder, Server, Upload } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { TranslationKey } from "@/lib/i18n/types";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { importMessageFiles } from "@/components/settings/import-messages-utils";
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
	host: "",
	port: "993",
	secure: true,
	username: "",
	password: "",
	folder: "INBOX",
	limit: "100",
	importAll: true,
};
const defaultSections = importSourceOptions.map((option) => option.value);
const SECTION_LABEL_KEYS: Record<ImportSourceSection, TranslationKey> = {
	inbox: "navigation.inbox",
	sent: "navigation.sent",
	drafts: "navigation.drafts",
	archived: "navigation.archived",
	spam: "navigation.spam",
	trash: "navigation.trash",
	others: "importPage.others",
};
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
	const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
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
		[selectedSections],
	);
	const fileImportSource = getFileImportSource(selectedSources);
	const sourceSummary =
		selectedSources.length > 0
			? selectedSources.map(sourceLabel).join(", ")
			: t("importPage.selectSections");
	function toggleSection(section: ImportSourceSection, checked: boolean) {
		setSelectedSections((current) => {
			if (checked)
				return current.includes(section) ? current : [...current, section];
			return current.filter((item) => item !== section);
		});
	}
	async function getDestination(source: ImportSourceItem): Promise<string> {
		if (!selectedMailbox?.id)
			throw new Error(t("importPage.selectMailboxFirst"));
		return ensureImportDestination(selectedMailbox.id, source);
	}
	async function onFileSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox?.id || selectedSources.length === 0) return;
		setFileLoading(true);
		setFileError(null);
		setFileResult(null);
		setFileProgress({
			completed: 0,
			total: 100,
			label: t("importPage.preparing"),
		});
		try {
			const destination = await getDestination(fileImportSource);
			const result = await importMessageFiles(
				selectedMailbox.id,
				files,
				destination,
				(percentage) =>
					setFileProgress({
						completed: percentage,
						total: 100,
						label:
							percentage < 70
								? t("importPage.uploading")
								: t("importPage.importingMessages"),
					}),
			);
			setFileResult(result);
			window.dispatchEvent(new Event("mailflare:messages-changed"));
		} catch (error) {
			setFileError(
				error instanceof Error ? error.message : t("importPage.fileFailed"),
			);
		} finally {
			setFileLoading(false);
		}
	}
	async function onImapSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox?.id || selectedSources.length === 0) return;
		setImapLoading(true);
		setImapError(null);
		setImapResult(null);
		setImapProgress({
			completed: 0,
			total: 1,
			label: t("importPage.discovering"),
		});
		try {
			const total: ImportResult = { imported: 0, skipped: 0, errors: [] };
			const discoveredFolders = await fetchImapFolders(imapForm);
			const expandedSources: ImportSourceItem[] = [];
			for (const source of selectedSources) {
				if (source.id === "system:others") {
					expandedSources.push(
						...filterCustomImapFolders(discoveredFolders, selectedSources).map(
							getFolderImportSource,
						),
					);
				} else {
					expandedSources.push(source);
				}
			}
			for (const [index, source] of expandedSources.entries()) {
				setImapProgress({
					completed: index,
					total: expandedSources.length,
					label: t("importPage.importingSource", {
						source: sourceLabel(source),
					}),
				});
				const destination = await getDestination(source);
				const folder = resolveImapSourceFolder(source, discoveredFolders);
				let offset = 0;
				let processed = 0;
				// Newest messages first, one batch per request. Without "import all"
				// only the newest batch is imported.
				while (true) {
					const result = await importFromImap(
						selectedMailbox.id,
						{ ...imapForm, folder },
						destination,
						offset,
					);
					total.imported = (total.imported ?? 0) + (result.imported ?? 0);
					total.skipped = (total.skipped ?? 0) + (result.skipped ?? 0);
					total.errors = [...(total.errors ?? []), ...(result.errors ?? [])];
					processed +=
						(result.imported ?? 0) +
						(result.skipped ?? 0) +
						(result.errors?.length ?? 0);
					if (
						!imapForm.importAll ||
						result.nextOffset === null ||
						result.nextOffset === undefined ||
						result.nextOffset <= offset
					)
						break;
					offset = result.nextOffset;
					setImapProgress({
						completed: index,
						total: expandedSources.length,
						label: t("importPage.importingSourceProgress", {
							source: sourceLabel(source),
							processed,
							total: result.total ?? "?",
						}),
					});
				}
				setImapProgress({
					completed: index + 1,
					total: expandedSources.length,
					label: t("importPage.importedSource", {
						source: sourceLabel(source),
					}),
				});
			}
			setImapResult(total);
			setImapForm((current) => ({ ...current, password: "" }));
			window.dispatchEvent(new Event("mailflare:messages-changed"));
		} catch (error) {
			setImapError(
				error instanceof Error ? error.message : t("importPage.imapFailed"),
			);
		} finally {
			setImapLoading(false);
		}
	}
	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-semibold tracking-tight">
				{t("settings.nav.import")}
			</h1>

			<Card>
				<CardHeader>
					<CardTitle>{t("importPage.title")}</CardTitle>
					<CardDescription>{t("importPage.description")}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-1 overflow-hidden rounded-lg">
						<CardContent className="flex flex-col gap-6 rounded-b-lg  bg-card p-6">
							<Field>
								<FieldLabel htmlFor="import-source">
									{t("importPage.source")}
								</FieldLabel>
								<ToggleGroup
									type="single"
									variant="outline"
									value={activeTab}
									onValueChange={(next) => {
										if (next) setActiveTab(next as ImportTab);
									}}
									aria-label={t("importPage.source")}
									className="w-full justify-start"
								>
									<ToggleGroupItem value="file" className="min-h-11 flex-1">
										{t("importPage.backupFile")}
									</ToggleGroupItem>
									<ToggleGroupItem value="imap" className="min-h-11 flex-1">
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
											)
												toggleSection(
													option.value,
													next.includes(option.value),
												);
										}
									}}
									className="flex w-full flex-wrap justify-start"
								>
									{importSourceOptions.map((option) => (
										<ToggleGroupItem
											key={option.value}
											value={option.value}
											className="min-h-11 min-w-20 flex-1"
										>
											{t(SECTION_LABEL_KEYS[option.value])}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
								{/* <p className="text-xs leading-5 text-muted-foreground">
Select Folders to import every source IMAP folder into matching
Lab folders.
</p> */}
							</Field>

							{activeTab === "file" ? (
								<>
									<form onSubmit={onFileSubmit} className="flex flex-col gap-4">
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
														setFiles(Array.from(event.target.files ?? []))
													}
													className="block w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
												/>
												<p className="text-xs leading-5 text-muted-foreground">
													{t("importPage.fileHint", {
														section: sourceLabel(fileImportSource),
													})}
												</p>
											</Field>
											{selectedSections.includes("others") && (
												<p className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
													{t("importPage.othersNote")}
												</p>
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
													<div className="h-1.5 overflow-hidden rounded-full bg-muted">
														<div
															className="h-full bg-primary transition-[width]"
															style={{ width: `${fileProgress.completed}%` }}
														/>
													</div>
												</div>
											)}
											{fileResult && (
												<p className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
													{formatImportResult(fileResult, t)}
												</p>
											)}
											{fileError && (
												<p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-destructive">
													{fileError}
												</p>
											)}
										</FieldGroup>
									</form>
								</>
							) : (
								<>
									<form onSubmit={onImapSubmit} className="flex flex-col gap-4">
										<FieldGroup>
											<div className="grid gap-3 md:grid-cols-[1fr_110px]">
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
											<p className="rounded-lg border border-border bg-muted/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
												{t("importPage.imapNote")}
											</p>
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
													<div className="h-1.5 overflow-hidden rounded-full bg-muted">
														<div
															className="h-full bg-primary transition-[width]"
															style={{
																width: `${Math.round((imapProgress.completed / imapProgress.total) * 100)}%`,
															}}
														/>
													</div>
												</div>
											)}
											{imapResult && (
												<p className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
													{formatImportResult(imapResult, t)}
												</p>
											)}
											{imapError && (
												<p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-destructive">
													{imapError}
												</p>
											)}
										</FieldGroup>
									</form>
								</>
							)}
						</CardContent>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
