import { OAuthConnections } from "@/components/settings/oauth-connections";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";

export default function ApiKeysSettingsPage() {
	return <div className="py-4"><ApiKeysSettings /><div className="mt-8"><OAuthConnections /></div></div>;
}
