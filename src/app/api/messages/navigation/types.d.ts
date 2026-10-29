export interface MessageNavigationEntry {
	id: string;
	unread: boolean;
}

export interface MessageNavigationResponse {
	messages: MessageNavigationEntry[];
}
