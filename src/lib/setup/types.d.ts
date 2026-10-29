export interface SetupRequirementCheck {
	key: string;
	configured: boolean;
	message: string;
}

export interface SetupPreparationResult {
	checks: SetupRequirementCheck[];
	migrated: boolean;
}
