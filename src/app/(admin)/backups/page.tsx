"use client";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";

import { AdminRowActions } from "../admin-row-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Empty } from "@/components/ui/empty";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  DatabaseBackup,
  Download,
  MoreVertical,
  Play,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { BACKUP_TABLE_GROUPS } from "@/lib/backups/table-groups";
import type { TranslationKey } from "@/lib/i18n/types";
import type { BackupItem, BackupSettings } from "./types";
import {
  WEEKDAYS,
  downloadBackup,
  fetchBackups,
  formatBackupDate,
  formatBackupSize,
  removeBackup,
  restoreBackup,
  saveBackupSettings,
  startBackup,
} from "./utils";

export default function BackupsPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const restoreInput = useRef<HTMLInputElement | null>(null);
  const savedSettings = useRef<BackupSettings | null>(null);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const backups = useQuery({
    queryKey: ["backups"],
    queryFn: fetchBackups,
    refetchInterval: (query) =>
      query.state.data?.backups.some(
        (backup) => backup.status === "queued" || backup.status === "running",
      )
        ? 5000
        : false,
  });

  useEffect(() => {
    if (backups.data?.settings && !settings) {
      savedSettings.current = backups.data.settings;
      setSettings(backups.data.settings);
    }
  }, [backups.data?.settings, settings]);

  const saveSettings = useMutation({
    mutationFn: saveBackupSettings,
    onSuccess: (_data, nextSettings) => {
      savedSettings.current = nextSettings;
      setSettingsOpen(false);
      return queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
  });

  const autoSaveSettings = useMutation({
    mutationFn: saveBackupSettings,
    onMutate: (nextSettings) => setSettings(nextSettings),
    onSuccess: (_data, nextSettings) => { savedSettings.current = nextSettings; },
    onError: () => { if (savedSettings.current) setSettings(savedSettings.current); },
  });

  const runBackup = useMutation({
    mutationFn: startBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });

  const deleteBackup = useMutation({
    mutationFn: removeBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });

  const download = useMutation({ mutationFn: downloadBackup });
  const restore = useMutation({
    mutationFn: restoreBackup,
    onSuccess: () => window.location.assign("/login"),
  });
  const error =
    backups.error ||
    saveSettings.error ||
    autoSaveSettings.error ||
    runBackup.error ||
    deleteBackup.error ||
    download.error ||
    restore.error;
  const configuration = backups.data?.configuration;
  const backupConfigured = configuration?.configured === true;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-medium text-foreground">
            {t("backups.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("backups.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            ref={restoreInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) setRestoreFile(file);
            }}
          />
          <Button onClick={() => runBackup.mutate()} disabled={runBackup.isPending || !backupConfigured}>
            <Play size={18} />
            {runBackup.isPending ? t("backups.starting") : t("backups.backUp")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="size-10 px-0" aria-label={t("backups.actions")}>
                <MoreVertical data-icon="inline-start" />
              </Button>
            </DropdownMenuTrigger>

              <DropdownMenuContent align="end" sideOffset={6} ><DropdownMenuGroup>
                <DropdownMenuItem className="min-h-11" disabled={restore.isPending} onSelect={() => restoreInput.current?.click()}>
                  <Upload className="size-4" />
                  {restore.isPending ? t("backups.restoring") : t("backups.restore")}
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" disabled={!settings || autoSaveSettings.isPending} onSelect={() => setSettingsOpen(true)}>
                  <Settings className="size-4" />
                  {t("backups.settings")}
                </DropdownMenuItem>
              </DropdownMenuGroup></DropdownMenuContent>

          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={!!restoreFile} onOpenChange={(open) => { if (!open && !restore.isPending) setRestoreFile(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("backups.restore")}</AlertDialogTitle><AlertDialogDescription>{t("backups.restoreConfirm")}</AlertDialogDescription></AlertDialogHeader>{restore.error && <p role="alert" className="text-destructive">{restore.error.message}</p>}<AlertDialogFooter><AlertDialogCancel disabled={restore.isPending}>{t("common.cancel")}</AlertDialogCancel><Button variant="destructive" disabled={restore.isPending} onClick={() => { if (restoreFile) restore.mutate(restoreFile); }}>{restore.isPending ? t("backups.restoring") : t("backups.restore")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("backups.tablesTitle")}</DialogTitle>
            <DialogDescription>{t("backups.tablesDescription")}</DialogDescription>
          </DialogHeader>
          {settings && <div className="flex flex-col gap-5">
            <div className="divide-y divide-border">
              {BACKUP_TABLE_GROUPS.map((group) => {
                const enabled = !settings.excludedTableGroups.includes(group.id);
                const lastEnabled = enabled && settings.excludedTableGroups.length === BACKUP_TABLE_GROUPS.length - 1;
                return <div key={group.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0"><p className="text-sm font-medium text-foreground">{group.label}</p><p className="mt-1 break-words text-xs text-muted-foreground">{t("backups.tables", { list: group.tables.join(", ") })}</p></div>
                  <Switch checked={enabled} disabled={lastEnabled} onCheckedChange={(checked) => setSettings({ ...settings, excludedTableGroups: checked ? settings.excludedTableGroups.filter((id) => id !== group.id) : [...settings.excludedTableGroups, group.id] })} aria-label={t("backups.backUpGroup", { group: group.label })} />
                </div>;
              })}
            </div>
            {saveSettings.error && <p role="alert" className="text-sm text-destructive">{saveSettings.error instanceof Error ? saveSettings.error.message : t("backups.saveSettingsFailed")}</p>}
            <Button onClick={() => saveSettings.mutate(settings)} disabled={saveSettings.isPending}><Save data-icon="inline-start" />{saveSettings.isPending ? t("common.saving") : t("backups.saveSettings")}</Button>
          </div>}
        </DialogContent>
      </Dialog>

      {error && (
        <p className="rounded-lg border   px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : t("backups.operationFailed")}
        </p>
      )}

      {configuration && !configuration.configured && (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 " />
              <div>
                <CardTitle >
                  {t("backups.setupTitle")}
                </CardTitle>
                <CardDescription className="mt-1 ">
                  {t("backups.setupDescription")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-center gap-2">
              {configuration.missing.map((item) => (
                <Badge
                  key={item}
                  variant="outline"
                  className=" bg-background/70 "
                >
                  {item}
                </Badge>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto  bg-background/70"
                disabled={backups.isFetching}
                onClick={() => void backups.refetch()}
              >
                <RefreshCw
                  className={`h-4 w-4 ${backups.isFetching ? "animate-spin" : ""}`}
                />
                {t("backups.checkAgain")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("backups.automatic")}</CardTitle>
          <CardDescription>
            {t("backups.scheduleNote")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5">
          {settings && (
            <>
              <Field orientation="horizontal" className="flex items-center justify-between gap-4 border-t border-border pt-5">
                <FieldLabel htmlFor="automatic-backup-switch">{t("backups.enableAutomatic")}</FieldLabel>
                <Switch
                  id="automatic-backup-switch"
                  checked={settings.enabled}
                  disabled={autoSaveSettings.isPending}
                  onCheckedChange={(enabled) => autoSaveSettings.mutate({ ...settings, enabled })}
                />
              </Field>
              {settings.enabled && (
                <>
                  <FieldGroup className="grid gap-4">
                    <Field orientation="horizontal" className="flex items-center justify-between gap-4">
                      <FieldLabel htmlFor="schedule-type" className="flex-1">{t("backups.frequency")}</FieldLabel>
                      <NativeSelect
                        id="schedule-type"
                        value={settings.scheduleType}
                        containerClassName="w-1/2 max-w-52 shrink-0 text-sm"
                        disabled={autoSaveSettings.isPending}
                        onChange={(event) => {
                          const scheduleType = event.target
                            .value as BackupSettings["scheduleType"];
                          autoSaveSettings.mutate({
                            ...settings,
                            scheduleType,
                            scheduleValue:
                              scheduleType === "weekly"
                                ? 1
                                : scheduleType === "monthly"
                                  ? 1
                                  : null,
                          });
                        }}
                        className="px-3 py-2"
                      >
                        <option value="daily">{t("backups.daily")}</option>
                        <option value="weekly">{t("backups.weekly")}</option>
                        <option value="monthly">{t("backups.monthly")}</option>
                      </NativeSelect>
                    </Field>

                    {settings.scheduleType === "weekly" && (
                      <Field orientation="horizontal" className="flex items-center justify-between gap-4">
                        <FieldLabel htmlFor="weekday">{t("backups.dayOfWeek")}</FieldLabel>
                        <NativeSelect
                          id="weekday"
                          value={settings.scheduleValue ?? 1}
                          containerClassName="w-1/2 max-w-52 shrink-0"
                          disabled={autoSaveSettings.isPending}
                          onChange={(event) =>
                            autoSaveSettings.mutate({
                              ...settings,
                              scheduleValue: Number(event.target.value),
                            })
                          }

                        className="px-3 py-2 text-sm"
                        >
                          {WEEKDAYS.map((day) => (
                            <option key={day.value} value={day.value}>
                              {t(day.labelKey)}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                    )}

                    {settings.scheduleType === "monthly" && (
                      <Field orientation="horizontal" className="flex items-center justify-between gap-4">
                        <FieldLabel htmlFor="month-day">{t("backups.dayOfMonth")}</FieldLabel>
                        <Input
                          id="month-day"
                          className="w-1/2 max-w-52 shrink-0"
                          type="number"
                          min={1}
                          max={28}
                          value={settings.scheduleValue ?? 1}
                          disabled={autoSaveSettings.isPending}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              scheduleValue: Number(event.target.value),
                            })
                          }
                          onBlur={(event) => {
                            if (event.currentTarget.checkValidity()) autoSaveSettings.mutate(settings);
                            else setSettings({ ...settings, scheduleValue: savedSettings.current?.scheduleValue ?? 1 });
                          }}
                        />
                      </Field>
                    )}
                  </FieldGroup>

                  <FieldGroup className="grid gap-4 border-t border-border pt-5">
                    <Field orientation="horizontal" className="flex items-center justify-between gap-4">
                      <FieldLabel htmlFor="retention-switch">{t("backups.deleteOld")}</FieldLabel>
                      <Switch
                        id="retention-switch"
                        checked={settings.retentionEnabled}
                        disabled={autoSaveSettings.isPending}
                        onCheckedChange={(retentionEnabled) =>
                          autoSaveSettings.mutate({
                            ...settings,
                            retentionEnabled,
                          })
                        }
                      />
                    </Field>

                    <Field orientation="horizontal" className="flex items-center justify-between gap-4">
                      <FieldLabel htmlFor="retention-days">
                        {t("backups.deleteOlderThan")}
                      </FieldLabel>
                      <div className="flex w-1/2 max-w-52 shrink-0 items-center gap-2 relative">
                        <Input
                          id="retention-days"
                          className="min-w-0"
                          type="number"
                          min={1}
                          max={3650}
                          value={settings.retentionDays}
                          disabled={!settings.retentionEnabled || autoSaveSettings.isPending}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              retentionDays: Number(event.target.value),
                            })
                          }
                          onBlur={(event) => {
                            if (event.currentTarget.checkValidity()) autoSaveSettings.mutate(settings);
                            else setSettings({ ...settings, retentionDays: savedSettings.current?.retentionDays ?? 30 });
                          }}
                        />
                        <span className="text-sm text-muted-foreground absolute z-10 right-6">{t("backups.days")}</span>
                      </div>
                    </Field>
                  </FieldGroup>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <section className="overflow-hidden rounded-lg bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-4">
          <DatabaseBackup className="size-5 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">{t("backups.history")}</h2>
        </div>
        <Table className="max-md:[&_tbody]:flex max-md:[&_tbody]:flex-col max-md:[&_tr]:flex max-md:[&_tr]:flex-wrap max-md:[&_tr]:gap-2 max-md:[&_tr]:p-4 max-md:[&_td]:whitespace-normal max-md:[&_td]:p-0">
          <TableHeader className="max-md:hidden"><TableRow><TableHead>{t("backups.col.file")}</TableHead><TableHead>{t("backups.col.status")}</TableHead><TableHead>{t("backups.col.size")}</TableHead><TableHead>{t("backups.col.created")}</TableHead><TableHead>{t("backups.col.actions")}</TableHead></TableRow></TableHeader><TableBody>
        {backups.isLoading && <TableRow><TableCell colSpan={5}><SkeletonRows count={5} /></TableCell></TableRow>}
        {!backups.isLoading && (backups.data?.backups ?? []).length === 0 && (
          <TableRow><TableCell colSpan={5}><Empty>{t("backups.none")}</Empty></TableCell></TableRow>
        )}
        {(backups.data?.backups ?? []).map((backup: BackupItem) => (
          <TableRow key={backup.id}>
            <TableCell className="min-w-0 max-md:basis-full">
              <p className="truncate text-sm font-medium text-foreground">
                {backup.filename ?? backup.id}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {backup.trigger === "manual" ? t("backups.manual") : t("backups.scheduled")}
                {backup.error ? `: ${backup.error}` : ""}
              </p>
            </TableCell>
            <TableCell><Badge variant={backup.status === "failed" ? "destructive" : backup.status === "completed" ? "outline" : "secondary"}>
              {t(`backups.status.${backup.status}` as TranslationKey)}
            </Badge></TableCell>
            <TableCell className="text-muted-foreground">
              {formatBackupSize(backup.size)}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatBackupDate(backup.createdAt)}</TableCell>
			<TableCell><AdminRowActions title={t("backups.delete")} description={backup.filename ?? backup.id} confirmLabel={t("backups.delete")} onConfirm={() => deleteBackup.mutateAsync(backup.id)} disabled={deleteBackup.isPending || backup.status === "queued" || backup.status === "running"}>
				<DropdownMenuItem className="min-h-11" disabled={backup.status !== "completed" || download.isPending} onSelect={() => download.mutate(backup)}><Download />{t("backups.download")}</DropdownMenuItem>
			</AdminRowActions></TableCell>
          </TableRow>
        ))}</TableBody></Table>
      </section>
    </div>
  );
}
