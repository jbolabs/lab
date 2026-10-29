export interface ParsedRecipientAddress {
	original: string;
	localPart: string;
	domain: string;
	normalizedAddress: string;
}
