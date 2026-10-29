"use client";

import { useEffect, useState } from "react";
import { CircleX, Database } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { applyDatabaseMigrations, getMigrationStatus } from "./database-migrations-notice-utils";
import type { MigrationStatusResponse } from "./database-migrations-notice-types";

/** Shown only when the database schema needs an operator: pending migrations, or ones this release does not know. */
export function DatabaseMigrationsNotice() {
	const { t } = useLanguage();
	const [status, setStatus] = useState<MigrationStatusResponse>();
	const [error, setError] = useState("");
	const [isMigrating, setIsMigrating] = useState(false);

	useEffect(() => {
		let active = true;
		getMigrationStatus()
			.then((next) => { if (active) setStatus(next); })
			.catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : t("update.migrationCheckFailed")); });
		return () => { active = false; };
	}, []);

	async function migrate() {
		setError("");
		setIsMigrating(true);
		try {
			setStatus(await applyDatabaseMigrations());
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : t("update.migrateFailed"));
		} finally {
			setIsMigrating(false);
		}
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
	if (!status?.pending.length) return null;
	return (
		<Alert>
			<Database />
			<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
				{t("update.pendingMigrations", { count: status.pending.length })}
				<Button size="sm" onClick={migrate} disabled={isMigrating}>
					{isMigrating && <Spinner data-icon="inline-start" />}
					{isMigrating ? t("update.updatingDatabase") : t("update.updateDatabase")}
				</Button>
			</AlertDescription>
		</Alert>
	);
}
