import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { OAuthConnections } from "@/components/settings/oauth-connections";

export default function ApiKeysSettingsPage() {
	return (
		<div className="flex flex-col gap-8 py-4">
			<ApiKeysSettings />
			<OAuthConnections />
		</div>
	);
}
