import { mobilePrimaryActionClass as sharedPrimaryActionClass, mobilePrimaryActionAboveNavClass as sharedPrimaryActionAboveNavClass } from "@/components/page-header-utils";
import { cn } from "@/lib/utils";

export const mobilePrimaryActionClass = cn(sharedPrimaryActionClass, "max-md:bottom-[calc(1rem+env(safe-area-inset-bottom))]");
export const mobilePrimaryActionAboveNavClass = cn(sharedPrimaryActionAboveNavClass, "max-md:bottom-[calc(5rem+env(safe-area-inset-bottom))]");
