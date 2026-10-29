"use client";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

import { useQuery } from "@tanstack/react-query";
import { LogIn, LogOut } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchActivity,
  formatActivityDate,
  getActivityLabel,
  getActivityMetadata,
} from "./utils";

export default function ActivityPage() {
  const { t } = useLanguage();
  const activity = useQuery({
    queryKey: ["activity"],
    queryFn: fetchActivity,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-medium text-foreground">{t("activity.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("activity.description")}
        </p>
      </div>

      <section role="region" tabIndex={0} aria-label={t("activity.title")} className="overflow-x-auto rounded-lg bg-card">
        <Table className="w-full min-w-[760px] table-fixed text-left">
          <TableHeader className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <TableRow>
              <TableHead scope="col" className="w-32 px-5 py-3">{t("activity.col.activity")}</TableHead>
              <TableHead scope="col" className="px-5 py-3">{t("activity.col.user")}</TableHead>
              <TableHead scope="col" className="w-64 px-5 py-3">{t("activity.col.device")}</TableHead>
              <TableHead scope="col" className="w-48 px-5 py-3">{t("activity.col.time")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {activity.isLoading &&
              Array.from({ length: 7 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell className="px-5 py-4">
                    <Skeleton className="h-6 w-20" />
                  </TableCell>
                  <TableCell className="px-5 py-4">
                    <Skeleton className="h-9 w-48" />
                  </TableCell>
                  <TableCell className="px-5 py-4">
                    <Skeleton className="h-9 w-40" />
                  </TableCell>
                  <TableCell className="px-5 py-4">
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                </TableRow>
              ))}
            {!activity.isLoading && (activity.data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="px-5 py-4 text-sm text-muted-foreground">
                  {t("activity.none")}
                </TableCell>
              </TableRow>
            )}
            {(activity.data ?? []).map((log) => {
              const metadata = getActivityMetadata(log);
              const Icon = log.action === "auth.logout" ? LogOut : LogIn;
              return (
                <TableRow key={log.id} className="align-top hover:bg-accent/70">
                  <TableCell className="px-5 py-4">
                    <Badge variant="outline" className="gap-1">
                      <Icon className="size-3" />
                      {getActivityLabel(log.action, t)}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-5 py-4">
                    <p className="flex flex-col truncate no-font-mono">
                      <span>{log.actorEmail ?? t("activity.unknownEmail")}</span>
                    </p>
                    <small className="text-muted-foreground">
                      {metadata.city || t("activity.unknownCity")} •{" "}
                      {metadata.country || t("activity.unknownCountry")}
                    </small>
                  </TableCell>
                  <TableCell className="px-5 py-4">
                    <p className="flex flex-col truncate no-font-mono">
                      {metadata.device ?? t("activity.unknownDevice")}
                    </p>

                    <small className="text-muted-foreground">
                      {metadata.platform || t("activity.unknownPlatform")} •{" "}
                      {metadata.ipAddress ?? t("activity.unknownIp")}
                    </small>
                  </TableCell>
                  <TableCell className="px-5 py-4 text-sm text-muted-foreground">
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
