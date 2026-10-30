"use client";
import { useQuery } from "@tanstack/react-query";
import { LogIn, LogOut } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@/components/ui/item";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from "@/components/ui/table";

import {
	fetchActivity,
	formatActivityDate,
	getActivityLabel,
	getActivityMetadata,
} from "./utils";

export default function ActivityPage() {
	const { t } = useLanguage();
	const activity = useQuery({
		queryFn: fetchActivity,
		queryKey: ["activity"],
	});

	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("activity.title")}</PageTitle>
					<PageDescription>{t("activity.description")}</PageDescription>
				</PageHeaderText>
			</PageHeader>

			{/* Phones get one stacked row per event; the four-column table does not fit. */}
			<ItemGroup className="gap-2 md:hidden" aria-label={t("activity.title")}>
				{activity.isLoading &&
					Array.from({ length: 5 }, (_, index) => (
						<Skeleton key={index} className="h-20 w-full rounded-2xl" />
					))}
				{!activity.isLoading && (activity.data ?? []).length === 0 && (
					<Empty>
						<EmptyDescription>{t("activity.none")}</EmptyDescription>
					</Empty>
				)}
				{(activity.data ?? []).map((log) => {
					const metadata = getActivityMetadata(log);
					const Icon = log.action === "auth.logout" ? LogOut : LogIn;
					const where = [metadata.city, metadata.country]
						.filter(Boolean)
						.join(", ");
					return (
						<Item key={log.id} variant="outline" size="sm">
							<ItemContent className="min-w-0">
								<div className="flex items-center justify-between gap-2">
									<Badge variant="outline">
										<Icon className="size-3" />
										{getActivityLabel(log.action, t)}
									</Badge>
									<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
										{formatActivityDate(log.createdAt)}
									</span>
								</div>
								<ItemTitle>
									<span className="block truncate">
										{log.actorEmail ?? t("activity.unknownEmail")}
									</span>
								</ItemTitle>
								<ItemDescription>
									<span className="block truncate">
										{[
											metadata.device ?? t("activity.unknownDevice"),
											metadata.ipAddress,
											where,
										]
											.filter(Boolean)
											.join(" · ")}
									</span>
								</ItemDescription>
							</ItemContent>
						</Item>
					);
				})}
			</ItemGroup>

			<section
				aria-label={t("activity.title")}
				className="overflow-x-auto rounded-lg bg-card max-md:hidden"
			>
				<Table className="w-full min-w-[760px] table-fixed text-left">
					<TableHeader className="">
						<TableRow>
							<TableHead scope="col" className="w-32">
								{t("activity.col.activity")}
							</TableHead>
							<TableHead scope="col" className="">
								{t("activity.col.user")}
							</TableHead>
							<TableHead scope="col" className="w-64">
								{t("activity.col.device")}
							</TableHead>
							<TableHead scope="col" className="w-48">
								{t("activity.col.time")}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody className="">
						{activity.isLoading &&
							Array.from({ length: 7 }, (_, index) => (
								<TableRow key={index}>
									<TableCell className="">
										<Skeleton className="h-6 w-20" />
									</TableCell>
									<TableCell className="">
										<Skeleton className="h-9 w-48" />
									</TableCell>
									<TableCell className="">
										<Skeleton className="h-9 w-40" />
									</TableCell>
									<TableCell className="">
										<Skeleton className="h-4 w-32" />
									</TableCell>
								</TableRow>
							))}
						{!activity.isLoading && (activity.data ?? []).length === 0 && (
							<TableRow>
								<TableCell colSpan={4} className="">
									{t("activity.none")}
								</TableCell>
							</TableRow>
						)}
						{(activity.data ?? []).map((log) => {
							const metadata = getActivityMetadata(log);
							const Icon = log.action === "auth.logout" ? LogOut : LogIn;
							return (
								<TableRow key={log.id} className="align-top">
									<TableCell className="">
										<Badge variant="outline">
											<Icon className="size-3" />
											{getActivityLabel(log.action, t)}
										</Badge>
									</TableCell>
									<TableCell className="">
										<p className="flex flex-col truncate font-sans">
											<span>
												{log.actorEmail ?? t("activity.unknownEmail")}
											</span>
										</p>
										<small className="text-muted-foreground">
											{metadata.city || t("activity.unknownCity")} •{" "}
											{metadata.country || t("activity.unknownCountry")}
										</small>
									</TableCell>
									<TableCell className="">
										<p className="flex flex-col truncate font-sans">
											{metadata.device ?? t("activity.unknownDevice")}
										</p>

										<small className="text-muted-foreground">
											{metadata.platform || t("activity.unknownPlatform")} •{" "}
											{metadata.ipAddress ?? t("activity.unknownIp")}
										</small>
									</TableCell>
									<TableCell className="">
										{formatActivityDate(log.createdAt)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</section>
		</div>
	);
}
