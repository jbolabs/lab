import { useParams } from "@tanstack/react-router";

import DraftsPage from "../page";
import { OpenDraftOnRoute } from "./open-draft-on-route";

export default function DraftMessagePage() {
	const { messageId } = useParams({ from: "/_dashboard/drafts/$messageId/" });
	return (
		<>
			<DraftsPage />
			<OpenDraftOnRoute draftId={messageId} />
		</>
	);
}
