export interface TimeZoneFormProps {
	userId: string;
	initialTimeZone: string | null;
}

export interface TimeZoneUpdateResponse {
	timeZone?: string | null;
	error?: string;
}
