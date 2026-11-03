import { useLoaderData, useParams } from "@tanstack/react-router";
import { ChevronLeft, Download } from "lucide-react";
import { useEffect, useState } from "react";

import { DrivePreviewBody } from "@/app/(drive)/drive-preview";
import {
	canPreview,
	driveIconFor,
	publicContentUrl,
	publicPosterUrl,
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
import { describeDriveItem } from "@/lib/drive/share-preview-utils";
import { cn } from "@/lib/utils";

import type { PublicDriveItem, PublicDriveListing, PublicShare } from "./types";

function KindIcon({
	item,
	className,
}: {
	item: PublicDriveItem;
	className?: string;
}) {
	const { Icon, className: tint } = driveIconFor(item);
	return (
		<Icon
			className={cn(tint, className)}
			fill={item.kind === "folder" ? "currentColor" : "none"}
		/>
	);
}

function DownloadButton({
	href,
	compact = false,
}: {
	href: string;
	compact?: boolean;
}) {
	const { t } = useLanguage();
	return (
		<Button
			size={compact ? "icon" : "default"}
			className="shrink-0"
			aria-label={compact ? t("drive.download") : undefined}
			// oxlint-disable-next-line jsx-a11y/control-has-associated-label -- Base UI render: the label is this component's children or aria-label.
			render={<a href={href} />}
			nativeButton={false}
		>
			<Download data-icon={compact ? undefined : "inline-start"} />
			{!compact && t("drive.download")}
		</Button>
	);
}

function FolderRow({
	entry,
	token,
	onOpen,
}: {
	entry: PublicDriveItem;
	token: string;
	onOpen: (id: string) => void;
}) {
	return (
		<li className="flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-accent/60">
			<Button
				variant="ghost"
				type="button"
				onClick={() => onOpen(entry.id)}
				className="min-w-0 flex-1 justify-start text-left"
			>
				<KindIcon item={entry} className="shrink-0" />
				<span className="min-w-0 flex-1 truncate text-foreground">
					{entry.name}
				</span>
				<span className="shrink-0 text-xs text-muted-foreground tabular-nums max-sm:hidden">
					{entry.kind === "file" ? describeDriveItem(entry) : null}
				</span>
			</Button>
			{entry.kind === "file" && (
				<Button
					variant="ghost"
					size="icon-sm"
					className="shrink-0 text-muted-foreground"
					render={
						<a
							href={publicContentUrl(token, entry.id, true)}
							aria-label={entry.name}
						/>
					}
					nativeButton={false}
				>
					<Download />
				</Button>
			)}
		</li>
	);
}

/** A file the browser cannot show: its icon, name and a way to get it. */
function FileCard({ item, href }: { item: PublicDriveItem; href: string }) {
	return (
		<div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border bg-card px-6 py-10 text-center shadow-xs">
			<span className="flex size-16 items-center justify-center rounded-2xl bg-muted">
				<KindIcon item={item} className="size-8" />
			</span>
			<div className="flex max-w-full min-w-0 flex-col gap-1">
				<p className="font-medium break-words text-foreground">{item.name}</p>
				<p className="text-sm text-muted-foreground tabular-nums">
					{describeDriveItem(item)}
				</p>
			</div>
			<DownloadButton href={href} />
		</div>
	);
}

function Stage({
	listing,
	token,
	onOpen,
}: {
	listing: PublicDriveListing;
	token: string;
	onOpen: (id: string) => void;
}) {
	const { t } = useLanguage();
	const { item, items } = listing;
	if (item.kind === "folder") {
		return (
			<div className="mx-auto w-full max-w-3xl rounded-2xl border bg-card p-2 shadow-xs">
				{items.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>{t("drive.publicEmpty")}</EmptyTitle>
						</EmptyHeader>
					</Empty>
				) : (
					<ul className="flex flex-col">
						{sortDriveItems(items, "name", true).map((entry) => (
							<FolderRow
								key={entry.id}
								entry={entry}
								token={token}
								onOpen={onOpen}
							/>
						))}
					</ul>
				)}
			</div>
		);
	}
	const download = publicContentUrl(token, item.id, true);
	if (!canPreview(item.contentType)) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<FileCard item={item} href={download} />
			</div>
		);
	}
	const document = !/^(?:image|video|audio)\//u.test(item.contentType);
	return (
		<div
			className={cn(
				"mx-auto flex min-h-0 w-full flex-1",
				document && "max-w-4xl"
			)}
		>
			<DrivePreviewBody
				src={publicContentUrl(token, item.id)}
				downloadHref={download}
				contentType={item.contentType}
				name={item.name}
				poster={
					item.contentType.startsWith("video/")
						? publicPosterUrl(token, item.id)
						: undefined
				}
			/>
		</div>
	);
}

export default function PublicDrivePage() {
	const { token } = useParams({ from: "/d/$token/" });
	const share = useLoaderData({ strict: false }) as PublicShare | undefined;
	const { t } = useLanguage();
	const [itemId, setItemId] = useState<string | null>(null);
	const [fetched, setFetched] = useState<{
		id: string;
		listing: PublicDriveListing | null;
	} | null>(null);

	useEffect(() => {
		if (!itemId) {
			return;
		}
		let active = true;
		void fetch(
			`/api/drive/public/${encodeURIComponent(token)}?item=${encodeURIComponent(itemId)}`
		)
			.then((response) =>
				response.ok ? (response.json() as Promise<PublicDriveListing>) : null
			)
			.catch(() => null)
			.then((listing) => {
				if (active) {
					setFetched({ id: itemId, listing });
				}
				return null;
			});
		return () => {
			active = false;
		};
	}, [token, itemId]);

	let listing = share?.listing;
	if (itemId) {
		listing = fetched?.id === itemId ? fetched.listing : undefined;
	}

	if (listing === null) {
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
	if (!listing) {
		return <main className="min-h-dvh bg-sidebar" aria-busy="true" />;
	}
	const { item, path } = listing;
	const parent = path.at(-2);
	const open = (id: string) => setItemId(id === path[0]?.id ? null : id);

	return (
		<main className="flex h-dvh flex-col bg-sidebar pt-safe">
			<header className="flex h-16 shrink-0 items-center gap-3 px-4 md:px-6">
				{parent ? (
					<Button
						variant="ghost"
						size="icon"
						className="-ml-2 shrink-0"
						aria-label={parent.name}
						data-edge-swipe-back
						onClick={() => open(parent.id)}
					>
						<ChevronLeft />
					</Button>
				) : (
					<span className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-card shadow-xs">
						<KindIcon item={item} className="size-[18px]" />
					</span>
				)}
				<div className="min-w-0 flex-1">
					<PageTitle size="sm">
						<span className="block truncate">{item.name}</span>
					</PageTitle>
					<p className="truncate text-xs text-muted-foreground tabular-nums">
						{describeDriveItem(item, listing.items.length)}
					</p>
				</div>
				{/* A file with no preview gets its Download in the card instead. */}
				{item.kind === "file" && canPreview(item.contentType) && (
					<>
						<span className="max-sm:hidden">
							<DownloadButton href={publicContentUrl(token, item.id, true)} />
						</span>
						<span className="sm:hidden">
							<DownloadButton
								compact
								href={publicContentUrl(token, item.id, true)}
							/>
						</span>
					</>
				)}
			</header>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-safe-5 md:px-6 md:pb-safe-6">
				<Stage listing={listing} token={token} onOpen={open} />
			</div>
		</main>
	);
}
