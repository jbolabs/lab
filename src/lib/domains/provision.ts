import {
	enableEmailRouting,
	findZoneByHostname,
	getEmailRoutingSettings,
} from "@/lib/cloudflare-api";
import {
	ensureEmailRoutingCatchAllToWorker,
	getEmailRoutingCatchAll,
} from "@/lib/domains/catch-all-routing";
import { removeMxRecords } from "@/lib/domains/mx-records";
import { rollbackDomainProvisioning } from "@/lib/domains/rollback";
import { ensureSendingSubdomain } from "@/lib/domains/sending-subdomain";
import type {
	DomainProvisioningChanges,
	DomainProvisioningResult,
} from "@/lib/domains/types";
import { isZoneApex } from "@/lib/domains/utils";
import { hasCloudflareCredentials, isNodeRuntime } from "@/lib/runtime";

import { MANUAL_ZONE_ID } from "./manual-zone";

/** Node/Docker has no Email Worker; a catch-all PUT to one 404s (CF 2016). */
export function shouldBindEmailCatchAllToWorker(
	env?: Pick<CloudflareEnv, "MAILFLARE_RUNTIME">
): boolean {
	return !isNodeRuntime(env);
}

/**
 * Zone id recorded for domains the app does not manage on Cloudflare (a
 * self-hosted install without API credentials). Every Cloudflare call that
 * receives it is a no-op, and the DNS page shows records to set by hand.
 */
export { MANUAL_ZONE_ID, isManualZone } from "./manual-zone";

export async function provisionDomainOnCloudflare(
	env: CloudflareEnv,
	hostname: string,
	options?: {
		enableRouting?: boolean;
		enableSending?: boolean;
		replaceMxRecords?: boolean;
		skipDns?: boolean;
	}
): Promise<DomainProvisioningResult> {
	const normalized = hostname.toLowerCase().trim();
	if (options?.skipDns || !hasCloudflareCredentials(env)) {
		// Nothing to provision: the operator points MX at this server themselves,
		// or chose to skip DNS for now.
		return {
			changes: {
				createdAddressRules: [],
				createdSendingSubdomainTag: null,
				deletedMxRecords: [],
				enabledEmailRouting: false,
				previousCatchAll: null,
				zoneId: MANUAL_ZONE_ID,
			},

			hostname: normalized,

			// Mail arrives whenever MX points at this server, so the domain is live at once.
			routingEnabled: options?.enableRouting ?? true,

			routingStatus: "manual",

			sendingEnabled: false,

			sendingRequested: options?.enableSending ?? true,

			sendingSubdomainTag: null,

			zone: { id: MANUAL_ZONE_ID, name: normalized },
		};
	}
	const zone = await findZoneByHostname(env, normalized);
	if (!zone) {
		throw new Error(
			`Zone not found for "${normalized}". The domain must use Cloudflare DNS on this account.`
		);
	}
	const configureDomainDns = async (): Promise<DomainProvisioningResult> => {
		const enableRouting = options?.enableRouting ?? true;
		const enableSending = options?.enableSending ?? true;

		let routingEnabled = false;
		let sendingEnabled = false;
		let sendingSubdomainTag: string | null = null;
		let routingStatus: string | undefined;
		const changes: DomainProvisioningChanges = {
			createdAddressRules: [],
			createdSendingSubdomainTag: null,
			deletedMxRecords: [],
			enabledEmailRouting: false,
			previousCatchAll: null,
			zoneId: zone.id,
		};

		try {
			if (enableRouting) {
				// Record the zone's prior state before changing it: rolling back must only
				// undo what this call did, never Email Routing the account already had.
				// If the state cannot be read, assume it was already on — leaving an orphan
				// behind is far cheaper than disabling a zone someone else's mail depends on.
				let routingWasEnabled = true;
				try {
					const settings = await getEmailRoutingSettings(env, zone.id);
					routingWasEnabled = settings.enabled === true;
				} catch {
					// Keep the fail-safe default.
				}
				// The catch-all is a singleton and the PUT below overwrites it, so keep a copy.
				changes.previousCatchAll = routingWasEnabled
					? await getEmailRoutingCatchAll(env, zone.id)
					: null;

				const routingName = isZoneApex(normalized, zone.name)
					? undefined
					: normalized;
				if (options?.replaceMxRecords) {
					await removeMxRecords(
						env,
						zone.id,
						routingName ?? zone.name,
						changes.deletedMxRecords
					);
				}
				const routing = await enableEmailRouting(env, zone.id, routingName);
				changes.enabledEmailRouting = !routingWasEnabled;
				routingEnabled = routing.enabled ?? true;
				routingStatus = routing.status;
				if (shouldBindEmailCatchAllToWorker(env)) {
					await ensureEmailRoutingCatchAllToWorker(env, zone.id);
				}
			}

			if (enableSending) {
				// Cloudflare refuses (401, code 2036) while another service's MX records
				// are on the hostname; replacing them follows the same consent as routing.
				const { subdomain, created } = await ensureSendingSubdomain(
					env,
					zone.id,
					normalized,
					{
						deletedMx: changes.deletedMxRecords,
						replaceMx: options?.replaceMxRecords,
					}
				);
				sendingSubdomainTag = subdomain.tag;
				sendingEnabled = subdomain.enabled;
				if (created) {
					changes.createdSendingSubdomainTag = subdomain.tag;
				}
			}
		} catch (error) {
			await rollbackDomainProvisioning(env, changes);
			throw error;
		}

		return {
			changes,
			hostname: normalized,
			routingEnabled,
			routingStatus,
			sendingEnabled,
			sendingRequested: enableSending,
			sendingSubdomainTag,
			zone,
		};
	};
	return await configureDomainDns();
}
