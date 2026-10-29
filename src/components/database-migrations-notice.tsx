"use client";

import { CircleX, Database } from "lucide-react";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { withCleanup } from "@/lib/async-cleanup";

import type { MigrationStatusResponse } from "./database-migrations-notice-types";
import {
	applyDatabaseMigrations,
	getMigrationStatus,
} from "./database-migrations-notice-utils";

/** Shown only when the database schema needs an operator: pending migrations, or ones this release does not know. */
export function DatabaseMigrationsNotice() {
	const { t } = useLanguage();
	const [status, setStatus] = useState<MigrationStatusResponse>();
	const [error, setError] = useState("");
	const [isMigrating, setIsMigrating] = useState(false);

	useEffect(() => {
		let active = true;
		getMigrationStatus()
			.then((loadedState) => {
				if (active) {
					setStatus(loadedState);
				}

				return null;
			})
			.catch((error_) => {
				if (active) {
					setError(
						error_ instanceof Error
							? error_.message
							: t("update.migrationCheckFailed")
					);
				}
			});
		return () => {
			active = false;
		};
	}, [t]);

	async function migrate() {
		setError("");
		setIsMigrating(true);
		return await withCleanup(
			async () => {
				try {
					setStatus(await applyDatabaseMigrations());
				} catch (error_) {
					setError(
						error_ instanceof Error ? error_.message : t("update.migrateFailed")
					);
				}
			},
			() => {
				setIsMigrating(false);
			}
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<CircleX />
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}
	if (status?.unknown.length) {
		return (
			<Alert variant="destructive">
				<CircleX />
				<AlertDescription>{t("update.deployMatching")}</AlertDescription>
			</Alert>
		);
	}
	if (!status?.pending.length) {
		return null;
	}
	return (
		<Alert>
			<Database />
			<AlertDescription className="flex flex-col flex-wrap items-center justify-between gap-3">
				{t("update.pendingMigrations", { count: status.pending.length })}
				<Button size="sm" onClick={migrate} disabled={isMigrating}>
					{isMigrating && <Spinner data-icon="inline-start" />}
					{isMigrating
						? t("update.updatingDatabase")
						: t("update.updateDatabase")}
				</Button>
			</AlertDescription>
		</Alert>
	);
}
