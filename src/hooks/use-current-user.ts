"use client";

import { useEffect, useState } from "react";

import { AUTH_SESSION_CHANGED_EVENT, authFetch } from "@/lib/auth/client";

export interface CurrentUser {
	id: string;
	email: string;
	name: string;
	role: "admin" | "user";
	isPrimaryAdmin: boolean;
	canManageMailboxes: boolean;
	canManageDomains: boolean;
	canManageUsers: boolean;
	hasAvatar: boolean;
}

let cachedUser: CurrentUser | null = null;
let inflight: Promise<CurrentUser | null> | null = null;
let generation = 0;

export function clearCurrentUserCache(): void {
	generation += 1;
	cachedUser = null;
	inflight = null;
}

export function fetchCurrentUser(): Promise<CurrentUser | null> {
	if (cachedUser) {
		return Promise.resolve(cachedUser);
	}
	if (!inflight) {
		const requestGeneration = generation;
		const request = authFetch("/api/auth/me", { redirectOnUnauthorized: false })
			.then((response) => (response.ok ? response.json() : null))
			.then((data) => {
				if (requestGeneration !== generation) {
					return null;
				}
				cachedUser = (data as { user?: CurrentUser } | null)?.user ?? null;
				return cachedUser;
			})
			.catch(() => null)
			.finally(() => {
				if (inflight === request) {
					inflight = null;
				}
			});
		inflight = request;
	}
	return inflight;
}

export function useCurrentUser(): CurrentUser | null {
	const [user, setUser] = useState<CurrentUser | null>(cachedUser);

	useEffect(() => {
		let active = true;
		async function load() {
			const requestGeneration = generation;
			const next = await fetchCurrentUser();
			if (active && requestGeneration === generation) {
				setUser(next);
			}
		}
		function onSessionChanged() {
			clearCurrentUserCache();
			setUser(null);
			void load();
		}
		void load();
		window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionChanged);
		return () => {
			active = false;
			window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionChanged);
		};
	}, []);
	return user;
}
