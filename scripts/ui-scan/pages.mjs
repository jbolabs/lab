// Page groups the UI hill-climb scans; together they cover every page route in src/routes
// (tests/ui-scan-coverage.test.mjs keeps it that way). `path` may be a function of the signed-in
// request context for pages addressed by a generated id.
// `auth: false` pages are captured logged out. Interactions are captured as a slowed-down
// filmstrip plus the animations `document.getAnimations()` reports, so a judge can read motion
// from stills. `viewports` limits an interaction to one viewport when it only exists there.

const firstRow = 'a[href^="/inbox/"]';

// Opens the first link under `prefix` on the current page (detail pages with generated ids).
const openFirst = (prefix) => async (page) => {
	await page
		.locator(`main a[href^="${prefix}"]`)
		.filter({ visible: true })
		.first()
		.click();
	await page.waitForURL((url) => url.pathname.startsWith(prefix));
};

// The first button whose accessible name starts with one of `names` (an "Add …" or "New …").
const firstButton = (page, names) =>
	page.getByRole("button", { name: new RegExp(`^(${names})`, "iu") }).first();

const signedInUserId = async (request) => {
	const response = await request.get("/api/auth/me");
	const body = await response.json();
	return body.user.id;
};

export const GROUPS = {
	admin: {
		interactions: [
			{
				name: "open-dialog",
				path: "/accounts",
				trigger: (page) => firstButton(page, "add|new|create|invite").click(),
			},
		],
		pages: [
			...[
				"admin",
				"accounts",
				"mailboxes",
				"domains",
				"routing",
				"webhooks",
				"activity",
				"branding",
				"general",
				"backups",
				"api-keys",
				"agent",
				"ai-usage",
			].map((p) => ({ name: p, path: `/${p}` })),
			{
				name: "account",
				open: openFirst("/accounts/"),
				path: "/accounts",
				route: "/accounts/$id",
			},
			{
				name: "mailbox",
				open: openFirst("/mailboxes/"),
				path: "/mailboxes",
				route: "/mailboxes/$id",
			},
		],
	},
	auth: {
		auth: false,
		interactions: [],
		pages: [
			{ name: "home", path: "/" },
			{ name: "login", path: "/login" },
			{ name: "register", path: "/register" },
			{ name: "forgot-password", path: "/forgot-password" },
			{
				name: "reset-password",
				path: "/reset-password?token=invalid",
				route: "/reset-password",
			},
			{ name: "setup", path: "/setup" },
		],
	},
	calendar: {
		interactions: [
			{
				name: "new-event",
				path: "/calendar",
				trigger: (page) => firstButton(page, "new|create|add").click(),
			},
		],
		pages: [
			{ name: "calendar", path: "/calendar" },
			{ name: "booking", path: "/booking" },
			{
				name: "public-booking",
				path: async (request) => `/book/${await signedInUserId(request)}`,
				route: "/book/$userId",
			},
			{ name: "public-profile", path: "/c/admin", route: "/c/$username" },
		],
	},
	compose: {
		interactions: [
			{
				name: "open-compose",
				path: "/inbox",
				trigger: (page) => firstButton(page, "compose").click(),
			},
		],
		pages: [{ name: "compose", path: "/compose" }],
	},
	drive: {
		interactions: [],
		pages: [
			{ name: "drive", path: "/drive" },
			{ name: "document", path: "/drive/document" },
		],
	},
	mail: {
		interactions: [
			{
				name: "open-message",
				path: "/inbox",
				trigger: (page) => page.locator(firstRow).first().click(),
			},
			{
				name: "back-to-list",
				path: "/inbox",
				setup: async (page) => {
					await page.locator(firstRow).first().click();
					await page.waitForURL(/\/inbox\/.+/u);
				},
				trigger: (page) =>
					page.locator("[data-edge-swipe-back]").first().click(),
				viewports: ["phone"],
			},
			{
				name: "open-drawer",
				path: "/inbox",
				trigger: (page) => page.locator("[data-mobile-menu]").first().click(),
				viewports: ["phone"],
			},
		],
		pages: [
			{ name: "inbox", path: "/inbox" },
			{
				name: "message",
				open: async (page) => {
					await page.locator(firstRow).first().click();
					await page.waitForURL(/\/inbox\/.+/u);
				},
				path: "/inbox",
				route: "/inbox/$messageId",
			},
			{ name: "starred", path: "/starred" },
			{ name: "sent", path: "/sent" },
			{ name: "drafts", path: "/drafts" },
			{ name: "snoozed", path: "/snoozed" },
			{ name: "scheduled", path: "/scheduled" },
			{ name: "archived", path: "/archived" },
			{ name: "spam", path: "/spam" },
			{ name: "trash", path: "/trash" },
			{ name: "rules", path: "/rules" },
			{ name: "import-export", path: "/import-export" },
		],
	},
	settings: {
		interactions: [
			{
				name: "open-section",
				path: "/settings",
				trigger: (page) =>
					page.locator('main a[href="/settings/account"]').first().click(),
				viewports: ["phone"],
			},
		],
		pages: [
			...[
				"",
				"account",
				"security",
				"app-passwords",
				"mailboxes",
				"inbox",
				"rules",
				"auto-reply",
				"api-keys",
				"import",
				"export",
				"import-export",
			].map((p) => ({
				name: p || "settings",
				path: `/settings${p ? `/${p}` : ""}`,
			})),
			{
				name: "mailbox",
				open: openFirst("/settings/mailboxes/"),
				path: "/settings/mailboxes",
				route: "/settings/mailboxes/$id",
			},
		],
	},
};

// Page routes deliberately not captured, with the reason. Everything else in src/routes must be
// in GROUPS (as `route`, or `path` for static pages).
export const UNSCANNED = {
	"/$folder/$messageId":
		"every folder's reader is the inbox reader (archived, drafts, scheduled, sent, snoozed, spam, starred, trash, folders/$folderId)",
	"/accounts/$id/mailboxes": "tab of the account page",
	"/accounts/$id/password": "tab of the account page",
	"/accounts/$id/permissions": "tab of the account page",
	"/audit-logs": "redirects to /activity",
	"/agent/review/$id": "needs an agent approval; none are seeded",
	"/book/$userId/$eventId": "needs a booking event; none are seeded",
	"/c/$username/$slug": "needs a booking event; none are seeded",
	"/d/$token": "needs a shared drive link; none are seeded",
	"/folders/$folderId": "same list as the inbox; no folders are seeded",
	"/oauth/consent": "only reachable inside an OAuth authorization request",
	"/onboarding": "redirects once setup is done",
};

// Equal weight: the rubric averages phone and desktop.
export const VIEWPORTS = {
	desktop: { deviceScaleFactor: 1, viewport: { height: 900, width: 1440 } },
	phone: {
		deviceScaleFactor: 2,
		hasTouch: true,
		isMobile: true,
		// iPhone Pro-class insets; the app runs standalone and draws under the status bar.
		safeArea: { bottom: 34, left: 0, right: 0, top: 59 },
		viewport: { height: 932, width: 430 },
	},
};

export const SCHEMES = ["light", "dark"];
