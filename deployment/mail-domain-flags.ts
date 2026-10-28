import type { MailDomain } from "./config.ts";
/** Existing external DMARC policy must not be duplicated. */
export const publishesDmarc = (domain: MailDomain): boolean => domain.ownsDmarc;
