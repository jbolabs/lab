"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SendReview } from "@/components/agent/send-review";
import type { AgentReviewResponse } from "@/components/agent/send-review-types";
import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth/client";

export default function AgentReviewPage() {
	const { t } = useLanguage();
	const { id } = useParams<{ id: string }>();
	const router = useRouter();
	const [request, setRequest] = useState<AgentReviewResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		void authFetch(`/api/agent/approvals/${id}`)
			.then(async (response) => {
				const data = (await response.json()) as AgentReviewResponse;
				if (!response.ok) {
					throw new Error(data.error || t("agent.review.loadFailed"));
				}
				setRequest(data);

				return null;
			})
			.catch((error_) =>
				setError(
					error_ instanceof Error
						? error_.message
						: t("agent.review.loadFailed")
				)
			);
	}, [id, t]);
	return (
		<div className="flex flex-col gap-4 p-8">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("agent.review.title")}</PageTitle>
				</PageHeaderText>
			</PageHeader>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{!error && !request && (
				<div aria-label={t("agent.review.loading")}>
					<SkeletonRows count={3} />
				</div>
			)}
			{request &&
				(request.status !== "pending" ||
					request.stale ||
					!request.snapshot) && (
					<p>
						{request.stale
							? t("agent.review.stale")
							: t("agent.review.status", { status: request.status })}
					</p>
				)}
			{request?.status === "pending" && !request.stale && request.snapshot && (
				<SendReview
					approvalId={id}
					snapshot={request.snapshot}
					onClose={() => router.push("/drafts")}
					onSent={() => router.push("/sent")}
				/>
			)}
		</div>
	);
}
