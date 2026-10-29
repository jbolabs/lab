"use client";

import { Plus, Trash2 } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldTitle,
} from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";

import type { AccountAliasesProps } from "./types";

export function AccountAliases({
	domains,
	domainId,
	username,
	useAllDomains,
	onUseAllDomainsChange,
	aliases,
	onAliasesChange,
}: AccountAliasesProps) {
	const { t } = useLanguage();
	const availableDomains = domains.filter(
		(domain) => domain.status === "active"
	);
	return (
		<div className="flex flex-col gap-4 border-t border-border pt-4">
			<FieldLabel>
				<Field orientation="horizontal">
					<Checkbox
						checked={useAllDomains}
						onCheckedChange={(checked) =>
							onUseAllDomainsChange(checked === true)
						}
					/>
					<FieldContent>
						<FieldTitle>{t("aliases.useAll")}</FieldTitle>
						<FieldDescription>{t("aliases.useAllHint")}</FieldDescription>
					</FieldContent>
				</Field>
			</FieldLabel>
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<p className="text-sm font-medium">
						{t("aliases.additional")}{" "}
						<span className="font-normal text-muted-foreground">
							{t("aliases.optional")}
						</span>
					</p>
					<FieldDescription>{t("aliases.hint")}</FieldDescription>
				</div>
				{aliases.map((alias, index) => (
					<div key={alias.id} className="flex items-center gap-2">
						<InputGroup className="min-w-0 flex-1">
							<InputGroupInput
								aria-label={t("aliases.usernameLabel", { n: index + 1 })}
								value={alias.localPart}
								onChange={(event) =>
									onAliasesChange(
										aliases.map((item) =>
											item.id === alias.id
												? { ...item, localPart: event.target.value }
												: item
										)
									)
								}
								placeholder={t("accounts.username")}
								pattern="[a-zA-Z0-9._%+\-]+"
								maxLength={64}
								required
							/>
							<InputGroupAddon align="inline-end">
								<InputGroupText>@</InputGroupText>
							</InputGroupAddon>
						</InputGroup>
						<NativeSelect
							aria-label={t("aliases.domainLabel", { n: index + 1 })}
							value={alias.domainId}
							onChange={(event) =>
								onAliasesChange(
									aliases.map((item) =>
										item.id === alias.id
											? { ...item, domainId: event.target.value }
											: item
									)
								)
							}
							containerClassName="min-w-0 flex-1"
							required
						>
							{availableDomains.map((domain) => (
								<option key={domain.id} value={domain.id}>
									{domain.hostname}
								</option>
							))}
						</NativeSelect>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={t("aliases.remove", { n: index + 1 })}
							onClick={() =>
								onAliasesChange(aliases.filter((item) => item.id !== alias.id))
							}
						>
							<Trash2 data-icon="inline-start" />
						</Button>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					disabled={!availableDomains.length}
					onClick={() =>
						onAliasesChange([
							...aliases,
							{
								domainId: (
									availableDomains.find((domain) => domain.id !== domainId) ??
									availableDomains[0]
								).id,
								id: crypto.randomUUID(),
								localPart: username.trim(),
							},
						])
					}
				>
					<Plus data-icon="inline-start" /> {t("aliases.add")}
				</Button>
			</div>
		</div>
	);
}
