export interface ReceivingStep {
	key: string;
	label: string;
	ok: boolean;
	detail?: string;
}

export interface SesReceivingView {
	steps: ReceivingStep[];
	ready: boolean;
	region: string;
	/** MX the domain must point at. */
	mx: string;
	dnsManaged: boolean;
}
