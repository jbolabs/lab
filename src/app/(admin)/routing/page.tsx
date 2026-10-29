"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { DomainRouting } from "@/components/settings/domain-routing/domain-routing";
import { RoutingRuleSelect } from "@/components/settings/domain-routing/routing-rule-select";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

import { fetchAdminRoutingDomains } from "./utils";

export default function RoutingPage() {
	const { t } = useLanguage();
	const [domainId, setDomainId] = useState("");
	const domains = useQuery({
		queryFn: fetchAdminRoutingDomains,
		queryKey: ["admin-routing-domains"],
	});
	const availableDomains = domains.data?.domains ?? [];
	const selectedDomain =
		availableDomains.find((domain) => domain.id === domainId) ??
		availableDomains[0];

	return (
		<div className="flex flex-col gap-8">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("routingAdmin.title")}</PageTitle>
					<PageDescription>{t("routingAdmin.description")}</PageDescription>
				</PageHeaderText>
			</PageHeader>

			<section className="flex flex-col gap-4">
				<div>
					<h2 className="text-xl font-semibold text-foreground">
						{t("routingAdmin.domain")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("routingAdmin.chooseDomain")}
					</p>
				</div>
				<div>
					{(() => {
						if (domains.isLoading) {
							return <Skeleton className="h-10 w-full" />;
						}
						if (domains.isError) {
							return (
								<p role="alert" className="text-sm text-destructive">
									{domains.error.message}
								</p>
							);
						}
						if (availableDomains.length === 0) {
							return (
								<p className="text-sm text-muted-foreground">
									{t("routingAdmin.addDomainFirst")}
								</p>
							);
						}
						return (
							<Field>
								<FieldLabel htmlFor="routing-domain">
									{t("routingAdmin.managedDomain")}
								</FieldLabel>
								<RoutingRuleSelect
									id="routing-domain"
									value={selectedDomain?.id ?? ""}
									onChange={(event) => setDomainId(event.target.value)}
								>
									{availableDomains.map((domain) => (
										<option key={domain.id} value={domain.id}>
											{domain.hostname}
										</option>
									))}
								</RoutingRuleSelect>
							</Field>
						);
					})()}
				</div>
			</section>

			{selectedDomain && (
				<DomainRouting key={selectedDomain.id} domain={selectedDomain} />
			)}
		</div>
	);
}
