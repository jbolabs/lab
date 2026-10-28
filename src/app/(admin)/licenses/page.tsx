import { getServerTranslator } from "@/lib/i18n/server";
import { Check, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LicenseActivation } from "./license-activation";
import { LICENSE_PLANS } from "./utils";

export default async function LicensesPage() {
  const t = await getServerTranslator();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-medium text-foreground">{t("licenses.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("licenses.description")}
        </p>
      </div>
      <LicenseActivation>
      <div className="grid gap-4 md:grid-cols-2">
        {LICENSE_PLANS.map((plan) => {
          const Icon = plan.icon;
          return (
            <Card
              key={plan.name}
              className="rounded-lg border-0 bg-card p-6 flex flex-col"
            >
              <CardHeader className="flex flex-col gap-4 py-0">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-full bg-signal-soft text-signal">
                    <Icon className="size-5" />
                  </span>
                </div>
                <div className="relative">
                  <CardTitle>{plan.name}</CardTitle>
                  <p className="mt-2 text-6xl text-foreground flex">
                    <span className="text-[12px] mt-2">$</span>
                    <b>{plan.price}</b>
                    {plan.originalPrice && (
                      <span className="absolute right-0 bottom-6 line-through text-base opacity-40">
                        ${plan.originalPrice}
                      </span>
                    )}
                  </p>
                </div>
                <CardDescription>{t(plan.descriptionKey)}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-6 flex flex-col flex-1 min-h-0">
                {plan.featureKeys.map((feature) => (
                  <p
                    key={feature}
                    className="flex gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600" />
                    {t(feature)}
                  </p>
                ))}
                <span className="flex-1" />
                <Button asChild className="mt-4 w-full">
                  <a
                    href={plan.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("licenses.get", { plan: plan.name })}
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      </LicenseActivation>
    </div>
  );
}
