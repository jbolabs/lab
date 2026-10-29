"use client";
import { Field, FieldLabel } from "@/components/ui/field";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { DomainRouting } from "@/components/settings/domain-routing/domain-routing";
import { RoutingRuleSelect } from "@/components/settings/domain-routing/routing-rule-select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAdminRoutingDomains } from "./utils";

export default function RoutingPage() {
	const { t } = useLanguage();
	const [domainId, setDomainId] = useState("");
	const domains = useQuery({
		queryKey: ["admin-routing-domains"],
		queryFn: fetchAdminRoutingDomains,
	});
	const availableDomains = domains.data?.domains ?? [];
	const selectedDomain = availableDomains.find((domain) => domain.id === domainId) ?? availableDomains[0];

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="text-2xl md:text-3xl font-medium text-foreground">{t("routingAdmin.title")}</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("routingAdmin.description")}
				</p>
			</div>

			<section className="flex flex-col gap-4">
				<div>
					<h2 className="text-xl font-semibold text-foreground">{t("routingAdmin.domain")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("routingAdmin.chooseDomain")}</p>
				</div>
				<div className="rounded-lg bg-card p-6">
					{domains.isLoading ? (
						<Skeleton className="h-10 w-full" />
					) : domains.isError ? (
						<p role="alert" className="text-sm text-red-600">{domains.error.message}</p>
					) : availableDomains.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t("routingAdmin.addDomainFirst")}</p>
					) : (
						<Field className="grid gap-2">
							<FieldLabel htmlFor="routing-domain">{t("routingAdmin.managedDomain")}</FieldLabel>
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
					)}
				</div>
			</section>

			{selectedDomain && <DomainRouting key={selectedDomain.id} domain={selectedDomain} />}
		</div>
	);
}
