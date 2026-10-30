// Page groups the UI hill-climb scans. Each group becomes one PR.
// `auth: false` pages are captured logged out. Interactions are captured as a slowed-down
// filmstrip plus the animations `document.getAnimations()` reports, so a judge can read motion
// from stills. `viewports` limits an interaction to one viewport when it only exists there.

const firstRow = 'a[href^="/inbox/"]';

export const GROUPS = {
	admin: {
		interactions: [],
		pages: [
			"admin",
			"accounts",
			"mailboxes",
			"routing",
			"webhooks",
			"activity",
			"branding",
			"general",
			"backups",
			"api-keys",
			"ai-usage",
		].map((p) => ({ name: p, path: `/${p}` })),
	},
	auth: {
		auth: false,
		interactions: [],
		pages: [
			{ name: "login", path: "/login" },
			{ name: "register", path: "/register" },
			{ name: "forgot-password", path: "/forgot-password" },
		],
	},
	calendar: {
		interactions: [],
		pages: [{ name: "calendar", path: "/calendar" }],
	},
	compose: {
		interactions: [],
		pages: [{ name: "compose", path: "/compose" }],
	},
	drive: { interactions: [], pages: [{ name: "drive", path: "/drive" }] },
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
			},
			{ name: "starred", path: "/starred" },
			{ name: "sent", path: "/sent" },
			{ name: "drafts", path: "/drafts" },
			{ name: "snoozed", path: "/snoozed" },
			{ name: "scheduled", path: "/scheduled" },
			{ name: "archived", path: "/archived" },
			{ name: "spam", path: "/spam" },
			{ name: "trash", path: "/trash" },
		],
	},
	settings: {
		interactions: [],
		pages: [
			"",
			"account",
			"security",
			"mailboxes",
			"inbox",
			"rules",
			"auto-reply",
			"api-keys",
			"import-export",
		].map((p) => ({
			name: p || "settings",
			path: `/settings${p ? `/${p}` : ""}`,
		})),
	},
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
