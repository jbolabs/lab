"use client";
import { ChevronRight, Download } from "lucide-react";
import { use, useEffect, useState } from "react";

import { DrivePreviewBody } from "@/app/(drive)/drive-preview";
import {
	driveIconFor,
	publicContentUrl,
	sortDriveItems,
} from "@/app/(drive)/drive-utils";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { PageTitle } from "@/components/ui/page-header";
import { formatDriveSize } from "@/lib/drive/utils";
import { cn as scopeLayoutClasses } from "@/lib/utils";

import type { PublicDriveItem, PublicDriveListing } from "./types";

function PublicRow({
	entry,
	token,
	onOpen,
}: {
	entry: PublicDriveItem;
	token: string;
	onOpen: (id: string) => void;
}) {
	const { Icon, className } = driveIconFor(entry);
	return (
		<div className="flex items-center gap-4 rounded-lg px-3 text-sm hover:bg-accent/60">
			<Button
				variant="ghost"
				type="button"
				onClick={() => onOpen(entry.id)}
				className="min-w-0 flex-1 justify-start text-left"
			>
				<Icon
					data-icon="inline-start"
					className={className}
					fill={entry.kind === "folder" ? "currentColor" : "none"}
				/>
				<span className="truncate text-foreground">{entry.name}</span>
			</Button>
			{entry.kind === "file" && (
				<span className="hidden shrink-0 text-muted-foreground sm:block">
					{formatDriveSize(entry.size)}
				</span>
			)}
			{entry.kind === "file" && (
				<Button
					asChild
					variant="ghost"
					size="icon"
					className="shrink-0 text-muted-foreground"
				>
					<a
						href={publicContentUrl(token, entry.id, true)}
						aria-label={entry.name}
					>
						<Download />
					</a>
				</Button>
			)}
		</div>
	);
}

export default function PublicDrivePage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = use(params);
	const { t } = useLanguage();
	const [itemId, setItemId] = useState<string | null>(null);
	const [data, setData] = useState<PublicDriveListing | null>(null);
	const [missing, setMissing] = useState(false);

	useEffect(() => {
		let active = true;
		const search = itemId ? `?item=${encodeURIComponent(itemId)}` : "";
		void fetch(`/api/drive/public/${encodeURIComponent(token)}${search}`)
			.then((response) => {
				if (!response.ok) {
					throw new Error("Request failed");
				}
				return response.json() as Promise<PublicDriveListing>;
			})
			.then((listing) => {
				if (active) {
					setData(listing);
					setMissing(false);
				}

				return null;
			})
			.catch(() => {
				if (active) {
					setMissing(true);
				}
			});
		return () => {
			active = false;
		};
	}, [token, itemId]);

	if (missing) {
		return (
			<main className="flex min-h-dvh items-center justify-center bg-sidebar p-6">
				<Empty>
					<EmptyHeader>
						<EmptyDescription>{t("drive.publicNotFound")}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</main>
		);
	}
	if (!data) {
		return <main className="min-h-dvh bg-sidebar" aria-busy="true" />;
	}
	const { item, items, path } = data;
	const isFile = item.kind === "file";

	return (
		<main className="mx-auto flex min-h-dvh max-w-5xl flex-col bg-sidebar p-4 md:p-8">
			<nav className="mb-4 flex flex-wrap items-center gap-1 text-lg text-foreground">
				{path.map((crumb, index) => (
					<span key={crumb.id} className="flex items-center gap-1">
						{index > 0 && (
							<ChevronRight size={18} className="text-muted-foreground" />
						)}
						{index === path.length - 1 ? (
							<PageTitle size="sm" className="">
								{crumb.name}
							</PageTitle>
						) : (
							<Button
								variant="ghost"
								type="button"
								onClick={() => setItemId(crumb.id)}
								className=""
							>
								{crumb.name}
							</Button>
						)}
					</span>
				))}
				{isFile && (
					<Button asChild className="ml-auto">
						<a href={publicContentUrl(token, item.id, true)}>
							<Download data-icon="inline-start" />
							{t("drive.download")}
						</a>
					</Button>
				)}
			</nav>
			{isFile ? (
				<div
					className={scopeLayoutClasses(
						"flex-1 rounded-lg bg-primary p-3",
						"min-h-[70vh]"
					)}
				>
					<DrivePreviewBody
						src={publicContentUrl(token, item.id)}
						downloadHref={publicContentUrl(token, item.id, true)}
						contentType={item.contentType}
						name={item.name}
					/>
				</div>
			) : (
				<div className="flex flex-col rounded-lg border bg-card p-2">
					{items.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyTitle>{t("drive.empty")}</EmptyTitle>
							</EmptyHeader>
						</Empty>
					) : (
						sortDriveItems(items, "name", true).map((entry) => (
							<PublicRow
								key={entry.id}
								entry={entry}
								token={token}
								onOpen={setItemId}
							/>
						))
					)}
				</div>
			)}
		</main>
	);
}
