export interface WebhookRouteParams {
	params: Promise<{ id: string }>;
}

export interface WebhookDeliveryRouteParams {
	params: Promise<{ id: string; deliveryId: string }>;
}
