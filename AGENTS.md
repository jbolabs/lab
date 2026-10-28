# Repository agent instructions

## Database backup and restore

- Whenever a migration creates, renames, or removes a persisted table, update the backup and restore table lists in the same change, even if the feature is unrelated to backups. Review `BACKUP_TABLES` and `INTERNAL_TABLES` in `src/lib/backups/export.ts`, `BACKUP_TABLE_GROUPS` in `src/lib/backups/table-groups.ts`, and `DatabaseBackupTable` in `src/lib/backups/types.d.ts`.
- Put every backed-up table in exactly one group. Keep `BACKUP_TABLES` in foreign-key dependency order so restore inserts parents before children and deletes them in reverse order. Exclude a table only when its contents are derived or internally managed, and document why.
- When adding a table, check backup and restore behavior both before and after its migration is applied. Keep older full backup documents restorable.

## Installation and releases

- The existing inbox runtime is Alchemy `mail` / `prod` in `deployment/alchemy.run.ts`; never change its stack/stage/resource identities or use Wrangler/raw cloud writes. Shared studio infrastructure remains in jbolabs/jbolabs.
- Keep the deployment toolchain isolated in `deployment/`. Read `docs/jbo-deployment.md` before plan/deploy/CI changes. Cloud changes, CI bootstrap and production enablement each need explicit operator authorization; a PR request is not deployment approval.

- Lab display/repository names are separate from compatibility identifiers. Preserve the `mailflare` Worker and persisted resource IDs, storage keys and backup formats during renames.
