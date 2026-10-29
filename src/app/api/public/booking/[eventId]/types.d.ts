export interface PublicBookingRouteContext {
	params: Promise<{ eventId: string }>;
}
export interface PublicBookingSubmission {
	startsAt?: unknown;
	name?: unknown;
	email?: unknown;
	guestEmails?: unknown;
	notes?: unknown;
}
