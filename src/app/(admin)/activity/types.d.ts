export interface ActivityMetadata {
	ipAddress?: string;
	city?: string | null;
	country?: string | null;
	device?: string;
	platform?: string;
	userAgent?: string;
}

export interface ActivityLog {
	id: string;
	action: "auth.login" | "auth.logout" | string;
	metadata: string | null;
	createdAt: string;
	actorEmail: string | null;
}
