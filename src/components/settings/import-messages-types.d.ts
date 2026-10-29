export interface ImportMessagesResult {
	imported?: number;
	skipped?: number;
	errors?: string[];
	error?: string;
}

export type ImportProgressHandler = (percentage: number) => void;

export interface ImportMessagesProps {
	destination: string;
	sourceLabel: string;
}
