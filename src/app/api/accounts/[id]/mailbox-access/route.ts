import { NextResponse } from "next/server";

const accountsRemovedResponse = () =>
	NextResponse.json(
		{ error: "Multiple accounts are not available in this build" },
		{ status: 410 }
	);

export function GET() {
	return accountsRemovedResponse();
}

export function POST() {
	return accountsRemovedResponse();
}

export function DELETE() {
	return accountsRemovedResponse();
}
