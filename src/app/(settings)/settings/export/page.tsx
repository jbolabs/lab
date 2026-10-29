"use client";
import {
	CardHeader,
	CardTitle,
	CardDescription,
	Card,
	CardContent,
} from "@/components/ui/card";
import { useState } from "react";
import { Download } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Button } from "@/components/ui/button";
import type { ExportState } from "./types";
import { exportMailbox } from "./utils";
export default function SettingsExportPage() {
	const { t } = useLanguage();
	const { selectedMailbox } = useSelectedMailbox();
	const [exportState, setExportState] = useState<ExportState>({
		error: null,
		loading: false,
	});
	async function onExport() {
		if (!selectedMailbox?.id) return;
		setExportState({ error: null, loading: true });
		try {
			await exportMailbox(
				selectedMailbox.id,
				`${selectedMailbox.localPart}.mbox`,
			);
		} catch (error) {
			setExportState({
				error: error instanceof Error ? error.message : t("export.failed"),
				loading: false,
			});
			return;
		}
		setExportState({ error: null, loading: false });
	}
	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-semibold tracking-tight">
				{t("settings.nav.export")}
			</h1>

			<Card>
				<CardHeader>
					<CardTitle>{t("export.title")}</CardTitle>
					<CardDescription>{t("export.description")}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-3 py-6">
						<Button
							type="button"
							variant="outline"
							disabled={!selectedMailbox || exportState.loading}
							onClick={onExport}
						>
							{exportState.loading
								? t("export.preparing")
								: t("export.download")}
						</Button>
						{exportState.error && (
							<p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-destructive">
								{exportState.error}
							</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
