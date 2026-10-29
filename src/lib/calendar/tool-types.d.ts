import type { SessionUser } from "@/lib/auth/types";

export interface CalendarToolContext {
	env: CloudflareEnv;
	user: SessionUser;
	timeZone?: string;
}
export type CalendarToolName =
	| "get_schedule"
	| "search_events"
	| "get_event"
	| "create_event"
	| "update_events"
	| "delete_events"
	| "find_free_time"
	| "get_calendars";
