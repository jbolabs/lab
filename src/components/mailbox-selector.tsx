"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
	Drawer,
	DrawerTrigger,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRouter } from "next/navigation";
import {
	CalendarDays,
	HardDrive,
	Inbox,
	LogOut,
	Settings,
	ShieldCheck,
	UserPlus,
	UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";

import { isIdentityMailbox } from "@/components/mailbox-provider-utils";
import { useMessageCounts } from "@/hooks/use-message-counts";
import {
	clearCurrentUserCache,
	fetchCurrentUser,
} from "@/hooks/use-current-user";

import { logoutClientSession } from "@/lib/auth/logout";
import {
	fetchBrowserAccounts,
	switchBrowserAccount,
	type BrowserAccount,
} from "@/lib/auth/accounts-client";
import {
	PROFILE_AVATAR_CHANGED_EVENT,
	getProfileAvatarUrl,
} from "@/lib/profile/avatar-client";
import { PROFILE_NAME_CHANGED_EVENT } from "@/lib/profile/name-client";
import type {
	ProfileAvatarChangedDetail,
	ProfileNameChangedDetail,
} from "@/lib/profile/types";
import { MAILBOX_AVATAR_CHANGED_EVENT } from "@/lib/mailboxes/avatar-client";
import type { MailboxAvatarChangedDetail } from "@/lib/mailboxes/avatar-client-types";
import { Skeleton } from "@/components/ui/skeleton";

import type {
	AccountAvatarProps,
	MailboxSelectorUser,
	MailboxSelectorProps,
} from "./mailbox-selector-types";
import {
	getAccountInitial,
	getMailboxAddress,
	getMailboxName,
} from "./mailbox-selector-utils";

function AccountAvatar({
	name,
	hasAvatar = false,
	avatarUrl = "/api/profile/avatar",
	size = "small",
	onAvatarError,
}: AccountAvatarProps) {
	const { t } = useLanguage();
	return (
		<Avatar className={size === "large" ? "size-12" : "size-8"}>
			{hasAvatar && (
				<AvatarImage
					src={avatarUrl}
					alt={t("account.profilePicture", { name })}
					onError={onAvatarError}
				/>
			)}
			<AvatarFallback>{getAccountInitial(name)}</AvatarFallback>
		</Avatar>
	);
}

export function MailboxSelector({ initialUser }: MailboxSelectorProps = {}) {
	const { t } = useLanguage();
	const { selectedMailbox, setSelectedMailbox, mailboxes, isLoading } =
		useSelectedMailbox();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [user, setUser] = useState<MailboxSelectorUser | null>(
		initialUser ?? null,
	);
	const [hasAvatar, setHasAvatar] = useState(!!initialUser?.hasAvatar);
	const [avatarUrl, setAvatarUrl] = useState("/api/profile/avatar");
	const [mailboxAvatarUrls, setMailboxAvatarUrls] = useState<
		Record<string, string>
	>({});
	const mobile = useIsMobile();
	const [browserAccounts, setBrowserAccounts] = useState<BrowserAccount[]>([]);

	useEffect(() => {
		if (!open) return;
		let active = true;
		void fetchBrowserAccounts().then((accounts) => {
			if (active) setBrowserAccounts(accounts);
		});
		return () => {
			active = false;
		};
	}, [open]);
	const otherAccounts = browserAccounts.filter(
		(account) => !account.active && account.userId !== user?.id,
	);

	const { counts } = useMessageCounts(null, open);

	useEffect(() => {
		let active = true;
		void fetchCurrentUser()
			.then((user) => {
				if (!active) return;
				setUser(user);
				setHasAvatar(!!user?.hasAvatar);
			})
			.catch(() => {
				if (active) setUser(null);
			});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		function onAvatarChanged(event: Event) {
			clearCurrentUserCache();
			const detail = (event as CustomEvent<ProfileAvatarChangedDetail>).detail;
			setAvatarUrl(detail?.url ?? getProfileAvatarUrl());
			setHasAvatar(true);
			setMailboxAvatarUrls((current) => {
				const next = { ...current };
				const version = Date.now();
				for (const mailbox of mailboxes) {
					if (isIdentityMailbox(mailbox)) {
						next[mailbox.id] =
							`/api/mailboxes/${mailbox.id}/avatar?v=${version}`;
					}
				}
				return next;
			});
		}

		window.addEventListener(PROFILE_AVATAR_CHANGED_EVENT, onAvatarChanged);
		return () =>
			window.removeEventListener(PROFILE_AVATAR_CHANGED_EVENT, onAvatarChanged);
	}, [mailboxes]);

	useEffect(() => {
		function onNameChanged(event: Event) {
			clearCurrentUserCache();
			const { name } = (event as CustomEvent<ProfileNameChangedDetail>).detail;
			setUser((current) => (current ? { ...current, name } : current));
		}

		window.addEventListener(PROFILE_NAME_CHANGED_EVENT, onNameChanged);
		return () =>
			window.removeEventListener(PROFILE_NAME_CHANGED_EVENT, onNameChanged);
	}, []);

	useEffect(() => {
		function onMailboxAvatarChanged(event: Event) {
			const detail = (event as CustomEvent<MailboxAvatarChangedDetail>).detail;
			if (!detail?.mailboxId || !detail.url) return;
			setMailboxAvatarUrls((current) => ({
				...current,
				[detail.mailboxId]: detail.url,
			}));
		}

		window.addEventListener(
			MAILBOX_AVATAR_CHANGED_EVENT,
			onMailboxAvatarChanged,
		);
		return () =>
			window.removeEventListener(
				MAILBOX_AVATAR_CHANGED_EVENT,
				onMailboxAvatarChanged,
			);
	}, []);

	if (isLoading && !initialUser) {
		return <Skeleton className="h-10 w-10 rounded-full" />;
	}

	const selectedName = selectedMailbox
		? getMailboxName(selectedMailbox)
		: (user?.name ?? t("account.fallbackName"));
	const selectedEmail = selectedMailbox
		? getMailboxAddress(selectedMailbox)
		: (user?.email ?? "");
	const selectedMailboxAvatarUrl = selectedMailbox
		? mailboxAvatarUrls[selectedMailbox.id]
		: undefined;
	const selectedHasAvatar = selectedMailbox
		? !!selectedMailbox.hasAvatar || !!selectedMailboxAvatarUrl
		: hasAvatar;
	const selectedAvatarUrl = selectedMailbox
		? (selectedMailboxAvatarUrl ??
			`/api/mailboxes/${selectedMailbox.id}/avatar`)
		: avatarUrl;
	const otherMailboxes = mailboxes.filter(
		(mailbox) => mailbox.id !== selectedMailbox?.id,
	);

	async function logout() {
		const switched = await logoutClientSession();
		setOpen(false);
		router.replace(switched ? "/inbox" : "/login");
		router.refresh();
	}

	async function switchAccount(userId: string) {
		const error = await switchBrowserAccount(userId);
		setOpen(false);
		if (error) {
			router.push("/login?add=1");
			return;
		}
		router.replace("/inbox");
		router.refresh();
	}

	const trigger = (
		<Button
			variant="ghost"
			size="icon"
			className="size-11 shrink-0"
			aria-label={t("account.openMenu")}
			aria-expanded={open}
		>
			<AccountAvatar
				name={selectedName}
				hasAvatar={selectedHasAvatar}
				avatarUrl={selectedAvatarUrl}
				onAvatarError={() => {
					if (!selectedMailbox) setHasAvatar(false);
				}}
			/>
		</Button>
	);
	const destinations = [
		{ href: "/inbox", label: t("navigation.inbox"), icon: Inbox },
		{ href: "/calendar", label: t("account.calendar"), icon: CalendarDays },
		{ href: "/drive", label: t("account.drive"), icon: HardDrive },
		{ href: "/settings/account", label: t("account.settings"), icon: Settings },
		...(user?.role === "admin"
			? [{ href: "/admin", label: t("account.admin"), icon: ShieldCheck }]
			: []),
		{ href: "/login?add=1", label: t("account.addAnother"), icon: UserPlus },
	];
	// Both surfaces share actions; Radix owns desktop menu keyboard navigation, Vaul owns phone focus and dismissal.
	const actions = (phone: boolean) => (
		<>
			{destinations.map(({ href, label, icon: Icon }) =>
				phone ? (
					<Button
						key={href}
						variant="ghost"
						asChild
						className="min-h-11 w-full justify-start"
					>
						<Link href={href} onClick={() => setOpen(false)}>
							<Icon data-icon="inline-start" />
							{label}
						</Link>
					</Button>
				) : (
					<DropdownMenuItem key={href} asChild>
						<Link href={href} onClick={() => setOpen(false)}>
							<Icon />
							{label}
						</Link>
					</DropdownMenuItem>
				),
			)}
			{phone ? (
				<Button
					variant="ghost"
					onClick={logout}
					className="min-h-11 w-full justify-start"
				>
					<LogOut data-icon="inline-start" />
					{t("account.signOut")}
				</Button>
			) : (
				<DropdownMenuItem onSelect={() => void logout()}>
					<LogOut />
					{t("account.signOut")}
				</DropdownMenuItem>
			)}
		</>
	);
	const accounts = (phone: boolean) => (
		<>
			{otherMailboxes.length > 0 && (
				<p className="px-2 py-2 text-xs text-muted-foreground">
					{t("account.inboxes", { count: otherMailboxes.length })}
				</p>
			)}
			{otherMailboxes.map((mailbox) => {
				const unread =
					counts.mailboxes.find((count) => count.mailboxId === mailbox.id)
						?.unread ?? 0;
				const content = (
					<>
						<AccountAvatar
							name={getMailboxName(mailbox)}
							hasAvatar={!!mailbox.hasAvatar || !!mailboxAvatarUrls[mailbox.id]}
							avatarUrl={
								mailboxAvatarUrls[mailbox.id] ??
								`/api/mailboxes/${mailbox.id}/avatar`
							}
						/>
						<span className="min-w-0 flex-1 text-left">
							<span className="block truncate">{getMailboxName(mailbox)}</span>
							<span className="block truncate text-xs text-muted-foreground">
								{getMailboxAddress(mailbox)}
							</span>
						</span>
						{mailbox.type === "shared" && (
							<UsersRound aria-label={t("account.sharedInbox")} />
						)}
						{unread > 0 && (
							<Badge variant="secondary">{unread > 99 ? "99+" : unread}</Badge>
						)}
					</>
				);
				const select = () => {
					setSelectedMailbox(mailbox);
					setOpen(false);
					router.push("/inbox");
				};
				return phone ? (
					<Button
						key={mailbox.id}
						variant="ghost"
						className="h-auto min-h-11 w-full justify-start py-2"
						onClick={select}
					>
						{content}
					</Button>
				) : (
					<DropdownMenuItem key={mailbox.id} onSelect={select}>
						{content}
					</DropdownMenuItem>
				);
			})}
			{otherAccounts.length > 0 && (
				<p className="px-2 py-2 text-xs text-muted-foreground">
					{t("account.otherAccounts")}
				</p>
			)}
			{otherAccounts.map((account) => {
				const content = (
					<>
						<AccountAvatar
							name={account.name}
							hasAvatar={account.hasAvatar}
							avatarUrl={`/api/auth/accounts/${account.userId}/avatar`}
						/>
						<span className="min-w-0 flex-1 text-left">
							<span className="block truncate">{account.name}</span>
							<span className="block truncate text-xs text-muted-foreground">
								{account.email}
							</span>
						</span>
					</>
				);
				return phone ? (
					<Button
						key={account.userId}
						variant="ghost"
						className="h-auto min-h-11 w-full justify-start py-2"
						onClick={() => void switchAccount(account.userId)}
					>
						{content}
					</Button>
				) : (
					<DropdownMenuItem
						key={account.userId}
						onSelect={() => void switchAccount(account.userId)}
					>
						{content}
					</DropdownMenuItem>
				);
			})}
		</>
	);
	const identity = (
		<div className="flex min-w-0 items-center gap-3 px-2 py-3">
			<AccountAvatar
				name={selectedName}
				hasAvatar={selectedHasAvatar}
				avatarUrl={selectedAvatarUrl}
				size="large"
			/>
			<div className="min-w-0">
				<p className="truncate font-medium">{selectedName}</p>
				<p className="truncate text-xs text-muted-foreground">
					{selectedEmail}
				</p>
			</div>
		</div>
	);
	if (mobile)
		return (
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerTrigger asChild>{trigger}</DrawerTrigger>
				<DrawerContent aria-describedby={undefined}>
					<DrawerHeader>
						<DrawerTitle>{t("account.openMenu")}</DrawerTitle>
					</DrawerHeader>
					<div className="max-h-[75dvh] overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
						{identity}
						{accounts(true)}
						{actions(true)}
					</div>
				</DrawerContent>
			</Drawer>
		);
	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				sideOffset={8}
				className="w-80 max-w-[calc(100vw-1rem)]"
			>
				{identity}
				<DropdownMenuSeparator />
				<DropdownMenuGroup>{accounts(false)}</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>{actions(false)}</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
