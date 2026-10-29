export interface SetupStatus {
	hasAdminAccount: boolean;
	hasPrimaryDomain: boolean;
	primaryDomain?: { hostname: string; sendingRequested: boolean } | null;
	error?: string;
}

export interface SetupRequirementCheck {
	key: string;
	configured: boolean;
	message: string;
}

export interface SetupPreparationResult {
	checks?: SetupRequirementCheck[];
	migrated?: boolean;
	error?: string;
}

export interface DomainPreflight {
	hostname: string;
	zone: { id: string; name: string };
}

export interface DomainSetupResult {
	domain?: DomainPreflight;
	error?: string;
}

export interface MxCheckResult {
	hasExistingMx?: boolean;
	error?: string;
}

export interface RegisterResult {
	redirect?: string;
	error?: string;
	code?: "MX_RECORDS_CONFLICT";
}
