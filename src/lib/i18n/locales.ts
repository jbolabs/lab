interface LocaleEntry {
	/** The language's own name, shown in the selector. */
	label: string;
	/** Set for right-to-left scripts. */
	dir?: "rtl";
}

// Register a language here with its native name, and add its catalog as `public/locales/<code>.json`.
// English ships in the bundle; other catalogs are static assets fetched when first needed, so they
// do not count toward the Worker size limit.
// Types, validation, cookies, SSR and the selector all derive from this registry.
export const locales = {
	ar: { dir: "rtl", label: "العربية" },
	bn: { label: "বাংলা" },
	de: { label: "Deutsch" },
	en: { label: "English" },
	es: { label: "Español" },
	fa: { dir: "rtl", label: "فارسی" },
	fr: { label: "Français" },
	gu: { label: "ગુજરાતી" },
	ha: { label: "Hausa" },
	hi: { label: "हिन्दी" },
	id: { label: "Bahasa Indonesia" },
	it: { label: "Italiano" },
	ja: { label: "日本語" },
	kn: { label: "ಕನ್ನಡ" },
	ko: { label: "한국어" },
	ml: { label: "മലയാളം" },
	mr: { label: "मराठी" },
	ms: { label: "Bahasa Melayu" },
	nl: { label: "Nederlands" },
	pa: { label: "ਪੰਜਾਬੀ" },
	pl: { label: "Polski" },
	"pt-BR": { label: "Português (Brasil)" },
	"pt-PT": { label: "Português (Portugal)" },
	ru: { label: "Русский" },
	si: { label: "සිංහල" },
	sw: { label: "Kiswahili" },
	ta: { label: "தமிழ்" },
	te: { label: "తెలుగు" },
	th: { label: "ไทย" },
	tr: { label: "Türkçe" },
	uk: { label: "Українська" },
	ur: { dir: "rtl", label: "اردو" },
	vi: { label: "Tiếng Việt" },
	"zh-CN": { label: "中文（简体）" },
} satisfies Record<string, LocaleEntry>;

export type Locale = keyof typeof locales;
export const DEFAULT_LOCALE = "en" satisfies Locale;
export const supportedLocales = Object.keys(locales) as Locale[];
