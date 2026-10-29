export interface AdminRoutingDomain {
	id: string;
	hostname: string;
	status: string;
	routingEnabled: boolean;
}

export interface AdminRoutingDomainsResponse {
	domains: AdminRoutingDomain[];
}
