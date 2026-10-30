"use client";
import { ImagePlus, Palette } from "lucide-react";
import { useRef, useState } from "react";

import { useBranding } from "@/components/branding-provider";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { runAsyncAction } from "@/lib/async-cleanup";

import { BRANDING_ICON_ACCEPT, saveBranding } from "./utils";

function BrandingForm({
	branding,
}: {
	branding: ReturnType<typeof useBranding>;
}) {
	const { t } = useLanguage();
	const [appName, setAppName] = useState(branding.appName);
	const [icon, setIcon] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	function pickIcon(file: File | null) {
		setIcon(file);
		if (preview) {
			URL.revokeObjectURL(preview);
		}
		setPreview(file ? URL.createObjectURL(file) : null);
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setStatus(null);
		return runAsyncAction(
			async () => {
				await saveBranding(appName.trim(), icon);
				await branding.refreshBranding();
				setIcon(null);
				setStatus(t("branding.updated"));
			},
			(failure) => {
				setStatus(
					failure instanceof Error ? failure.message : t("branding.saveFailed")
				);
			},
			() => {
				setSaving(false);
			}
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("branding.title")}</PageTitle>
					<PageDescription>{t("branding.description")}</PageDescription>
				</PageHeaderText>
			</PageHeader>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Palette className="size-5" />
						{t("branding.identity")}
					</CardTitle>
					<CardDescription>{t("branding.faviconNote")}</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={submit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="appName">
									{t("branding.appName")}
								</FieldLabel>
								<Input
									id="appName"
									value={appName}
									maxLength={60}
									onChange={(event) => setAppName(event.target.value)}
									required
								/>
							</Field>
							<Field>
								<FieldLabel>{t("branding.appIcon")}</FieldLabel>
								<Input
									ref={inputRef}
									type="file"
									accept={BRANDING_ICON_ACCEPT}
									className="hidden"
									onChange={(event) =>
										pickIcon(event.target.files?.[0] ?? null)
									}
								/>
								<div className="flex items-center gap-4">
									<img
										width={48}
										height={48}
										src={preview ?? branding.iconUrl}
										alt={t("branding.iconPreview")}
										className="size-16 rounded-lg border object-cover"
									/>
									<div className="flex flex-col items-start gap-1.5">
										<Button
											type="button"
											variant="outline"
											onClick={() => inputRef.current?.click()}
										>
											<ImagePlus data-icon="inline-start" />
											{t("branding.chooseImage")}
										</Button>
										<FieldDescription>{t("branding.maxSize")}</FieldDescription>
									</div>
								</div>
							</Field>
							{status && (
								<output className="text-sm text-muted-foreground">
									{status}
								</output>
							)}
							<Button type="submit" disabled={saving || !appName.trim()}>
								{saving ? t("common.saving") : t("branding.save")}
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

export default function BrandingPage() {
	const branding = useBranding();
	return <BrandingForm key={branding.appName} branding={branding} />;
}
