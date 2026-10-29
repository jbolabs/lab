export interface AiUsageRow {
	id: string;
	createdAt: string;
	provider: string;
	model: string;
	source: string;
	inputTokens: number | null;
	outputTokens: number | null;
	costUsdMicros: number | null;
}
export interface AiUsageDaily {
	date: string;
	requests: number;
	inputTokens: number;
	outputTokens: number;
}
export interface AiUsageTotals {
	requests: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	costUsdMicros: number;
	pricedRequests: number;
}
export interface AiUsageResponse {
	totals: AiUsageTotals;
	daily: AiUsageDaily[];
	timeZone: string;
	rows: AiUsageRow[];
	page: number;
	pageSize: number;
	totalPages: number;
	error?: string;
}
export interface UsageChartProps {
	daily: AiUsageDaily[];
	timeZone?: string;
}
