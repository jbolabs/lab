"use client";

import { MoreVertical, RotateCcw, Trash2 } from "lucide-react";

import Link from "@/components/app-link";
import { useLanguage } from "@/components/language-provider";
import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Empty } from "@/components/ui/empty";
import {
	Item,
	ItemGroup,
	ItemContent,
	ItemActions,
} from "@/components/ui/item";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table";
import {
	getAccountPurgeDate,
	getAccountStatus,
} from "@/lib/accounts/deletion-utils";

import type { AccountsTableProps } from "./accounts-table-types";
import { formatAccountDate, formatAccountDateTime } from "./utils";

export function AccountsTable({
	accounts,
	currentUserId,
	isPrimaryAdmin,
	loading,
	selected,
	onSelectedChange,
	onDeleteSelected,
	onRestore,
	restoringId,
}: AccountsTableProps) {
	const { t } = useLanguage();
	const isSelectable = (account: AccountsTableProps["accounts"][number]) =>
		!account.isPrimaryAdmin &&
		account.id !== currentUserId &&
		!account.deletedAt &&
		(isPrimaryAdmin || account.role !== "admin");
	const selectable = accounts.filter(isSelectable);
	const allSelected =
		selectable.length > 0 &&
		selectable.every((account) => selected.has(account.id));
	function toggle(id: string, checked: boolean) {
		const next = new Set(selected);
		if (checked) {
			next.add(id);
		} else {
			next.delete(id);
		}
		onSelectedChange(next);
	}
	const selectAll = (
		<Checkbox
			aria-label={t("accounts.selectAll")}
			checked={allSelected}
			disabled={!selectable.length}
			onCheckedChange={(checked) =>
				onSelectedChange(
					checked === true
						? new Set(selectable.map((account) => account.id))
						: new Set()
				)
			}
		/>
	);
	const actions = (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						aria-label={t("accounts.moreActions")}
					/>
				}
			>
				<MoreVertical />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>
					<DropdownMenuItem
						variant="destructive"
						disabled={!selected.size}
						onClick={onDeleteSelected}
					>
						<Trash2 />
						{t("accounts.deleteSelected")}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
	function row(
		account: AccountsTableProps["accounts"][number],
		mobile: boolean
	) {
		const locked =
			!isPrimaryAdmin &&
			account.role === "admin" &&
			account.id !== currentUserId;
		const status = getAccountStatus({
			deletedAt: account.deletedAt,
			disabled: !!account.disabled,
		});
		const label =
			status === "pendingDeletion" && account.deletedAt
				? t("accounts.status.pendingDeletion", {
						date: formatAccountDate(
							getAccountPurgeDate(new Date(account.deletedAt)).toISOString()
						),
					})
				: t(`accounts.status.${status}`);
		const statusBadge = (
			<Badge
				variant={(() => {
					if (status === "pendingDeletion") {
						return "destructive";
					}
					if (status === "active") {
						return "outline";
					}
					return "secondary";
				})()}
			>
				{label}
			</Badge>
		);
		const identity = (
			<div className="flex min-w-0 items-center gap-3">
				<Avatar>
					<AvatarFallback>
						{account.name.charAt(0).toUpperCase()}
					</AvatarFallback>
					{account.hasAvatar && (
						<ProgressiveAvatarImage
							src={`/api/accounts/${account.id}/avatar`}
							alt=""
							className="absolute inset-0 size-full object-cover"
						/>
					)}
				</Avatar>
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="truncate font-medium">{account.name}</span>
						<Badge variant="secondary">
							{account.isPrimaryAdmin
								? t("accounts.primaryAdmin")
								: t(
										account.role === "admin"
											? "accounts.role.admin"
											: "accounts.role.user"
									)}
						</Badge>
					</div>
					<div className="truncate text-muted-foreground">{account.email}</div>
				</div>
			</div>
		);
		const identityLink =
			account.deletedAt || locked ? (
				<div
					aria-disabled={locked}
					title={locked ? t("accounts.lockedAdmin") : undefined}
				>
					{identity}
				</div>
			) : (
				<Link
					className="block min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
					href={`/accounts/${account.id}`}
				>
					{identity}
				</Link>
			);
		const checkbox = (
			<Checkbox
				aria-label={t("accounts.selectOne", { name: account.name })}
				checked={selected.has(account.id)}
				disabled={!isSelectable(account)}
				onCheckedChange={(checked) => toggle(account.id, checked === true)}
			/>
		);
		const restore = account.deletedAt && (
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("accounts.restoreAccount", { name: account.name })}
				disabled={locked || restoringId === account.id}
				onClick={() => onRestore(account)}
			>
				<RotateCcw />
			</Button>
		);
		const lastSignIn = account.lastSignInAt
			? formatAccountDateTime(account.lastSignInAt)
			: t("accounts.neverSignedIn");
		return mobile ? (
			<Item
				variant="outline"
				key={account.id}
				className="flex-nowrap items-start"
			>
				<div className="flex items-center">{checkbox}</div>
				<ItemContent className="min-w-0">
					{identityLink}
					<div className="mt-2 flex flex-wrap gap-2">{statusBadge}</div>
					<p className="text-xs text-muted-foreground">
						{t("accounts.colLastSignIn")}: {lastSignIn}
					</p>
				</ItemContent>
				<ItemActions>{restore}</ItemActions>
			</Item>
		) : (
			<TableRow key={account.id}>
				<TableCell>{checkbox}</TableCell>
				<TableCell className="max-w-96">{identityLink}</TableCell>
				<TableCell>{statusBadge}</TableCell>
				<TableCell className="">{lastSignIn}</TableCell>
				<TableCell>{restore}</TableCell>
			</TableRow>
		);
	}
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2">
				{selectAll}
				<span className="flex-1 text-sm">
					{selected.size
						? t("common.selectedCount", { count: selected.size })
						: t("accounts.colAccount")}
				</span>
				{actions}
			</div>
			{(() => {
				if (loading) {
					return <SkeletonRows count={4} />;
				}
				if (accounts.length) {
					return (
						<>
							<div className="hidden rounded-lg border bg-card md:block">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-12" />
											<TableHead>{t("accounts.colAccount")}</TableHead>
											<TableHead>{t("accounts.colStatus")}</TableHead>
											<TableHead>{t("accounts.colLastSignIn")}</TableHead>
											<TableHead className="w-12" />
										</TableRow>
									</TableHeader>
									<TableBody>
										{accounts.map((account) => row(account, false))}
									</TableBody>
								</Table>
							</div>
							<ItemGroup className="gap-2 md:hidden">
								{accounts.map((account) => row(account, true))}
							</ItemGroup>
						</>
					);
				}
				return <Empty>{t("common.none")}</Empty>;
			})()}
		</div>
	);
}
