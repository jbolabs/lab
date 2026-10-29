import { find as findCss } from "css-tree";
import * as css from "css-tree";
import createDOMPurify from "dompurify";
import parseSrcset from "parse-srcset";
import { parse, serialize } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";

import type { SanitizeEmailHtmlOptions } from "@/app/(dashboard)/inbox/[messageId]/email-html-sanitizer-types";
import { requireValue } from "@/lib/require-value";

const convert = (element: Element, className: string) => {
	const replacement = document.createElement("div");
	for (const attribute of element.attributes) {
		replacement.setAttribute(attribute.name, attribute.value);
	}
	replacement.classList.add(className);
	// oxlint-disable-next-line unicorn/no-useless-spread -- appendChild moves nodes out of this live childNodes collection; iterate a snapshot to avoid skipping nodes.
	for (const child of [...element.childNodes]) {
		// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare Element overloads shadow DOM append; appendChild retains the DOM node signature.
		replacement.appendChild(child);
	}
	element.replaceWith(replacement);
};

function outgoingScope(source: string): string {
	// Stable presentation names keep repeated signature generation comparable. These are
	// not a security boundary; reader containers always use fresh, unpredictable names.
	let hash = 2_166_136_261;
	for (let index = 0; index < source.length; index += 1) {
		// oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-code-point -- Preserve exact 32-bit hashing over UTF-16 code units so presentation identities stay stable.
		hash = Math.imul(hash ^ source.charCodeAt(index), 16_777_619);
	}
	// oxlint-disable-next-line eslint/no-bitwise -- The persisted hash uses exact 32-bit integer arithmetic; changing it changes stable CSS or avatar identities.
	return `outgoing${(hash >>> 0).toString(16)}`;
}

interface MailDocument {
	template: HTMLTemplateElement;
	rootTag: string;
	bodyTag: string;
	needsWrapper: boolean;
}

/** Parse without a browser DOM, then populate an inert template. No network is possible. */
function mailDocument(source: string, outgoing = false): MailDocument {
	const parsed = parse(source);
	const html = requireValue(
		parsed.childNodes.find(
			(node): node is DefaultTreeAdapterTypes.Element =>
				"tagName" in node && node.tagName === "html"
		)
	);
	const head = requireValue(
		html.childNodes.find(
			(node): node is DefaultTreeAdapterTypes.Element =>
				"tagName" in node && node.tagName === "head"
		)
	);
	const body = requireValue(
		html.childNodes.find(
			(node): node is DefaultTreeAdapterTypes.Element =>
				"tagName" in node && node.tagName === "body"
		)
	);
	// Fresh element names avoid collisions with mail classes/IDs and never define custom elements.
	const token = outgoing
		? outgoingScope(source)
		: window.crypto.randomUUID().replaceAll("-", "");
	const rootTag = `mail-root-${token}`;
	const bodyTag = `mail-body-${token}`;
	html.nodeName = rootTag;
	html.tagName = html.nodeName;
	body.nodeName = bodyTag;
	body.tagName = body.nodeName;
	const headContent = head.childNodes.filter(
		(node) => "tagName" in node && ["style", "base"].includes(node.tagName)
	);
	html.childNodes = [...headContent, body];
	for (const child of html.childNodes) {
		child.parentNode = html;
	}
	const template = document.createElement("template");
	template.innerHTML = serialize(parsed);
	return {
		bodyTag,
		needsWrapper:
			!!html.attrs.length ||
			!!body.attrs.length ||
			headContent.some((node) => "tagName" in node && node.tagName === "style"),
		rootTag,
		template,
	};
}

const nameOf = (name: string) => css.ident.decode(name).toLowerCase();

const SAFE_AT_RULES = new Set([
	"media",
	"supports",
	"font-face",
	"keyframes",
	"-webkit-keyframes",
	"layer",
	"container",
	"scope",
	"starting-style",
	"page",
	"property",
	"counter-style",
]);

const BLOCKED_IMAGE =
	"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

/** Only remove unsupported syntax at its declaration/rule boundary, not an entire sheet. */
function transformCss(
	source: string,
	inline: boolean,
	resource: (value: string) => string | null,
	doc?: MailDocument,
	classScope = false,
	allowIndirect = false,
	onIndirect?: () => void
): string {
	try {
		const ast = css.parse(source, {
			context: inline ? "declarationList" : "stylesheet",
			parseCustomProperty: true,
		});
		css.walk(ast, {
			enter(node, item, list) {
				const remove = () => {
					if (item && list) {
						list.remove(item);
					}
				};
				if (
					node.type === "Declaration" &&
					(["behavior", "-moz-binding"].includes(nameOf(node.property)) ||
						findCss(node.value, (child) => child.type === "Raw"))
				) {
					remove();
					return css.walk.skip;
				}
				if (
					node.type === "Rule" &&
					findCss(node.prelude, (child) => child.type === "Raw")
				) {
					remove();
					return css.walk.skip;
				}
				if (node.type === "Atrule") {
					const name = nameOf(node.name);
					if (
						!SAFE_AT_RULES.has(name) ||
						(node.prelude &&
							findCss(node.prelude, (child) => child.type === "Raw"))
					) {
						remove();
						return css.walk.skip;
					}
					node.name = name;
				}
				if (node.type === "Raw") {
					remove();
					return css.walk.skip;
				}
				if (
					node.type === "Selector" &&
					findCss(
						node,
						(child) =>
							(child.type === "PseudoClassSelector" &&
								["host", "host-context"].includes(nameOf(child.name))) ||
							(child.type === "PseudoElementSelector" &&
								["slotted", "part"].includes(nameOf(child.name)))
					)
				) {
					remove();
					return css.walk.skip;
				}
				const rewriteCssResources = () => {
					if (node.type === "Function") {
						const rewriteFunction = () => {
							const name = nameOf(node.name);
							node.name = css.ident.encode(name);
							if (name === "expression") {
								remove();
								return css.walk.skip;
							}
							if (
								["image", "image-set", "-webkit-image-set", "src"].includes(
									name
								)
							) {
								if (
									findCss(
										node,
										(child) =>
											child.type === "Function" &&
											["var", "attr"].includes(nameOf(child.name))
									)
								) {
									onIndirect?.();
									if (!allowIndirect) {
										Object.assign(node, { type: "Url", value: BLOCKED_IMAGE });
										return css.walk.skip;
									}
								}
								for (const child of node.children) {
									if (child.type === "String") {
										child.value = resource(child.value) ?? BLOCKED_IMAGE;
									}
								}
							}
							// Escaped url("...") can be represented as a generic Function by the parser.
							if (name === "url") {
								const { first } = node.children;
								const value =
									first?.type === "String"
										? first.value
										: css.ident.decode(css.generate(node.children));
								Object.assign(node, {
									type: "Url",
									value: resource(value) ?? BLOCKED_IMAGE,
								});
								return css.walk.skip;
							}
						};
						return rewriteFunction();
					}
					if (node.type === "Url") {
						node.value = resource(node.value) ?? BLOCKED_IMAGE;
					}
					if (doc && node.type === "TypeSelector") {
						const name = nameOf(node.name);
						if (name === "html" || name === "body") {
							if (classScope) {
								doc.needsWrapper = true;
							}
							Object.assign(node, {
								name: name === "html" ? doc.rootTag : doc.bodyTag,
								type: classScope ? "ClassSelector" : "TypeSelector",
							});
						}
					}
					if (
						doc &&
						node.type === "PseudoClassSelector" &&
						nameOf(node.name) === "root"
					) {
						if (classScope) {
							doc.needsWrapper = true;
						}
						Object.assign(node, {
							name: doc.rootTag,
							type: classScope ? "ClassSelector" : "TypeSelector",
						});
					}
				};
				return rewriteCssResources();
			},
			leave(node, item, list) {
				if (
					node.type === "Rule" &&
					node.prelude.type === "SelectorList" &&
					node.prelude.children.isEmpty &&
					item &&
					list
				) {
					list.remove(item);
				}
			},
		});
		return css.generate(ast);
	} catch {
		return "";
	}
}

function mapSrcset(
	source: string,
	resource: (value: string) => string | null
): string {
	return parseSrcset(source)
		.flatMap((candidate) => {
			const url = resource(candidate.url);
			return url
				? [
						`${url}${(() => {
							if (candidate.w) {
								return ` ${candidate.w}w`;
							}
							if (candidate.d === undefined) {
								return "";
							}
							return ` ${candidate.d}x`;
						})()}`,
					]
				: [];
		})
		.join(", ");
}

function restoreEditorStyle(current: string, stored: string): string {
	try {
		const original = css.parse(decodeURIComponent(stored), {
			context: "declarationList",
			parseCustomProperty: true,
		});
		const ast = css.parse(current, {
			context: "declarationList",
			parseCustomProperty: true,
		});
		const originals = new Map<string, css.Declaration["value"]>();
		css.walk(original, (node) => {
			if (node.type === "Declaration") {
				originals.set(node.property, node.value);
			}
		});
		css.walk(ast, (node) => {
			if (
				node.type === "Declaration" &&
				findCss(
					node.value,
					(child) => child.type === "Url" && child.value === BLOCKED_IMAGE
				)
			) {
				const value = originals.get(node.property);
				if (value) {
					node.value = value;
				}
			}
		});
		return css.generate(ast);
	} catch {
		return current;
	}
}

function legacyBodyStyles(element: HTMLDivElement) {
	const color = element.getAttribute("text");
	const background = element.getAttribute("bgcolor");
	const image = element.getAttribute("background");
	if (color && !element.style.color) {
		element.style.color = color;
	}
	if (background && !element.style.backgroundColor) {
		element.style.backgroundColor = background;
	}
	if (image && !element.style.backgroundImage) {
		element.style.backgroundImage = `url(${JSON.stringify(image)})`;
	}
	for (const [attribute, property] of [
		["topmargin", "margin-top"],
		["bottommargin", "margin-bottom"],
		["leftmargin", "margin-left"],
		["rightmargin", "margin-right"],
	]) {
		const value = element.getAttribute(attribute);
		if (
			value &&
			/^\d+$/u.test(value) &&
			!element.style.getPropertyValue(property)
		) {
			element.style.setProperty(property, `${value}px`);
		}
	}
}

function restoreDocument(
	template: HTMLTemplateElement,
	doc: MailDocument,
	full: boolean
): string {
	const root = requireValue(template.content.querySelector(doc.rootTag));
	const body = requireValue(root.querySelector(doc.bodyTag));
	const headNodes = [...root.querySelectorAll("style, base")];
	if (!full) {
		return body.innerHTML;
	}
	const html = document.createElement("html");
	const head = document.createElement("head");
	const bodyElement = document.createElement("body");
	for (const attribute of root.attributes) {
		html.setAttribute(attribute.name, attribute.value);
	}
	for (const attribute of body.attributes) {
		bodyElement.setAttribute(attribute.name, attribute.value);
	}
	for (const node of headNodes) {
		// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare Element overloads shadow DOM append; appendChild retains the DOM node signature.
		head.appendChild(node);
	}
	// oxlint-disable-next-line unicorn/no-useless-spread -- Moving nodes mutates the live childNodes collection; snapshot it before iteration.
	for (const child of [...body.childNodes]) {
		// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare Element overloads shadow DOM append; appendChild retains the DOM node signature.
		bodyElement.appendChild(child);
	}
	// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare Element overloads shadow DOM append; appendChild retains the DOM node signature.
	html.appendChild(head);
	// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare Element overloads shadow DOM append; appendChild retains the DOM node signature.
	html.appendChild(bodyElement);
	return html.outerHTML;
}

const RESOURCE_ATTRIBUTES = ["src", "background", "poster"];

export function resolveEmailCidUrls(
	source: string,
	urls: Map<string, string>
): string {
	if (typeof document === "undefined" || !urls.size) {
		return source;
	}
	const doc = mailDocument(source);
	const resolve = (value: string) => {
		if (!/^cid:/iu.test(value)) {
			return value;
		}
		const id = value.slice(4).replaceAll(/^<|>$/gu, "");
		try {
			return urls.get(id) ?? urls.get(decodeURIComponent(id)) ?? value;
		} catch {
			return urls.get(id) ?? value;
		}
	};
	for (const element of doc.template.content.querySelectorAll("*")) {
		for (const attr of RESOURCE_ATTRIBUTES) {
			if (element.hasAttribute(attr)) {
				element.setAttribute(
					attr,
					resolve(requireValue(element.getAttribute(attr)))
				);
			}
		}
		if (element.hasAttribute("srcset")) {
			element.setAttribute(
				"srcset",
				mapSrcset(requireValue(element.getAttribute("srcset")), resolve)
			);
		}
		if (element.hasAttribute("style")) {
			element.setAttribute(
				"style",
				transformCss(
					requireValue(element.getAttribute("style")),
					true,
					resolve,
					undefined,
					false,
					true
				)
			);
		}
		if (element.tagName === "STYLE") {
			element.textContent = transformCss(
				element.textContent ?? "",
				false,
				resolve,
				undefined,
				false,
				true
			);
		}
	}
	// Return a document, not reader-specific containers. Its next consumer may be the sender.
	return restoreDocument(doc.template, doc, true);
}

/** Ordinary divs are portable in signatures and quoted fragments; no nested html/body tags. */
function outgoingFragment(
	template: HTMLTemplateElement,
	doc: MailDocument
): string {
	const root = requireValue(template.content.querySelector(doc.rootTag));
	const body = requireValue(root.querySelector(doc.bodyTag));
	if (!doc.needsWrapper) {
		return body.innerHTML;
	}
	convert(body, doc.bodyTag);
	convert(root, doc.rootTag);
	return template.innerHTML;
}

type Options = SanitizeEmailHtmlOptions & {
	allowRemote?: boolean;
	reader?: boolean;
	editor?: boolean;
};

const EDITOR_ATTRIBUTES = [
	"data-mailflare-src",
	"data-mailflare-background",
	"data-mailflare-poster",
	"data-mailflare-srcset",
	"data-mailflare-style",
	"data-mailflare-sheet",
];

export function prepareEmailHtml(source: string, options: Options = {}) {
	const outgoing = !!options.forOutgoing && !options.editor;
	const doc = mailDocument(source, outgoing);
	const { template, rootTag, bodyTag } = doc;
	let hasRemote = false;
	const allowIndirect = !!options.allowRemote || outgoing;
	const markIndirect = () => {
		hasRemote = true;
	};
	const base = template.content
		.querySelector("base[href]")
		?.getAttribute("href");
	const resource = (value: string): string | null => {
		if (/^data:image\/(?:png|jpeg|gif|webp);base64,/iu.test(value)) {
			return value;
		}
		if (
			!options.forOutgoing &&
			/^\/api\/messages\/[^/]+\/attachments\/[^/?]+\?preview=1$/u.test(value)
		) {
			return value;
		}
		if (value.startsWith("#")) {
			return value;
		}
		try {
			const url = new URL(value, base || "https://invalid.invalid/");
			if (
				!["http:", "https:"].includes(url.protocol) ||
				url.hostname === "invalid.invalid"
			) {
				return null;
			}
			hasRemote = true;
			return options.allowRemote || (options.forOutgoing && !options.editor)
				? url.href
				: null;
		} catch {
			return null;
		}
	};
	const root = requireValue(
		template.content.querySelector<HTMLDivElement>(rootTag)
	);
	const body = requireValue(
		template.content.querySelector<HTMLDivElement>(bodyTag)
	);
	for (const placeholder of template.content.querySelectorAll(
		"[data-mailflare-sheet]"
	)) {
		try {
			const style = document.createElement("style");
			style.textContent = decodeURIComponent(
				// oxlint-disable-next-line unicorn/prefer-dom-node-dataset -- Cloudflare Element overloads have no DOM dataset property; use the attribute API.
				placeholder.getAttribute("data-mailflare-sheet") ?? ""
			);
			placeholder.replaceWith(style);
		} catch {
			placeholder.remove();
		}
	}
	legacyBodyStyles(body);
	const linkColor = body.getAttribute("link");
	if (linkColor && /^#[a-f\d]{3,8}$/iu.test(linkColor)) {
		const style = document.createElement("style");
		style.textContent = `body a:link{color:${linkColor}}`;
		// oxlint-disable-next-line unicorn/prefer-modern-dom-apis -- Cloudflare Element overloads shadow DOM prepend; insertBefore accepts DOM nodes.
		root.insertBefore(style, root.firstChild);
	}
	const editorHeadStyles = document.createDocumentFragment();
	for (const element of template.content.querySelectorAll("*")) {
		const rewriteElement = () => {
			if (element.tagName === "STYLE") {
				if (options.editor) {
					// Keep a non-executable copy for sending; never install mail CSS into the editor document.
					const placeholder = document.createElement("span");
					placeholder.hidden = true;
					// oxlint-disable-next-line unicorn/prefer-dom-node-dataset -- Cloudflare Element overloads have no DOM dataset property; use the attribute API.
					placeholder.setAttribute(
						"data-mailflare-sheet",
						encodeURIComponent(
							transformCss(
								element.textContent ?? "",
								false,
								(value) => value,
								undefined,
								false,
								true
							)
						)
					);
					if (element.parentElement === root) {
						// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare Element overloads shadow DOM append; appendChild retains the DOM node signature.
						editorHeadStyles.appendChild(placeholder);
						element.remove();
					} else {
						element.replaceWith(placeholder);
					}
					return;
				}
				if (!options.reader && !options.forOutgoing) {
					element.remove();
					return;
				}
				element.textContent = transformCss(
					element.textContent ?? "",
					false,
					resource,
					options.reader || outgoing ? doc : undefined,
					outgoing,
					allowIndirect,
					markIndirect
				);
			}
			// Editor placeholders preserve source addresses without loading them. Validate again on send.
			for (const attr of [...RESOURCE_ATTRIBUTES, "srcset", "style"]) {
				const stored = element.getAttribute(`data-mailflare-${attr}`);
				if (stored !== null) {
					element.setAttribute(
						attr,
						attr === "style"
							? restoreEditorStyle(element.getAttribute("style") ?? "", stored)
							: stored
					);
				}
				element.removeAttribute(`data-mailflare-${attr}`);
			}
			if (element.hasAttribute("style")) {
				const original = requireValue(element.getAttribute("style"));
				const safe = transformCss(
					original,
					true,
					resource,
					options.reader ? doc : undefined,
					false,
					allowIndirect,
					markIndirect
				);
				if (options.editor && original !== safe) {
					// oxlint-disable-next-line unicorn/prefer-dom-node-dataset -- Cloudflare globally declares Element for HTMLRewriter without DOM dataset; attributes preserve runtime semantics.
					element.setAttribute(
						"data-mailflare-style",
						encodeURIComponent(
							transformCss(
								original,
								true,
								(value) => {
									try {
										const url = new URL(value);
										return ["http:", "https:"].includes(url.protocol)
											? url.href
											: resource(value);
									} catch {
										return resource(value);
									}
								},
								undefined,
								false,
								true
							)
						)
					);
				}
				element.setAttribute("style", safe);
			}
			const rewriteLinksAndImages = () => {
				for (const attr of RESOURCE_ATTRIBUTES) {
					if (!element.hasAttribute(attr)) {
						continue;
					}
					const original = requireValue(element.getAttribute(attr));
					const value = resource(original);
					if (value) {
						element.setAttribute(attr, value);
					} else {
						if (options.editor) {
							element.setAttribute(`data-mailflare-${attr}`, original);
						}
						element.removeAttribute(attr);
					}
				}
				if (element.hasAttribute("srcset")) {
					const original = requireValue(element.getAttribute("srcset"));
					const value = mapSrcset(original, resource);
					if (options.editor) {
						// oxlint-disable-next-line unicorn/prefer-dom-node-dataset -- Cloudflare globally declares Element for HTMLRewriter without DOM dataset; attributes preserve runtime semantics.
						element.setAttribute("data-mailflare-srcset", original);
					}
					if (value) {
						element.setAttribute("srcset", value);
					} else {
						element.removeAttribute("srcset");
					}
				}
				if (element.tagName === "A") {
					const original = element.getAttribute("href") ?? "";
					if (original.startsWith("#")) {
						element.removeAttribute("target");
						element.removeAttribute("rel");
					} else {
						try {
							const href = new URL(
								original,
								base || "https://invalid.invalid/"
							);
							if (
								!["https:", "http:", "mailto:", "tel:"].includes(
									href.protocol
								) ||
								href.hostname === "invalid.invalid"
							) {
								element.removeAttribute("href");
							} else {
								element.setAttribute("href", href.href);
							}
						} catch {
							element.removeAttribute("href");
						}
						element.setAttribute("target", "_blank");
						element.setAttribute("rel", "noopener noreferrer");
					}
				}
				if (element.tagName === "IMG") {
					element.setAttribute("referrerpolicy", "no-referrer");
					element.setAttribute("loading", "lazy");
				}
			};
			rewriteLinksAndImages();
		};
		rewriteElement();
	}
	if (options.editor) {
		// oxlint-disable-next-line unicorn/prefer-modern-dom-apis -- Cloudflare Element overloads shadow DOM prepend; insertBefore accepts DOM nodes.
		body.insertBefore(editorHeadStyles, body.firstChild);
	}
	const sanitizeAndSerializeDocument = () => {
		const purifier = createDOMPurify(window);
		const cleaned = purifier.sanitize(template.content, {
			ADD_ATTR: [
				"target",
				"loading",
				"referrerpolicy",
				...(options.forOutgoing || options.editor
					? ["data-mailflare-quote", "data-mailflare-signature"]
					: []),
				...(options.editor ? EDITOR_ATTRIBUTES : []),
			],
			ADD_TAGS: ["style", rootTag, bodyTag],
			ALLOW_DATA_ATTR: false,
			FORBID_ATTR: ["is", "slot"],
			FORBID_TAGS: [
				"script",
				"iframe",
				"object",
				"embed",
				"form",
				"input",
				"button",
				"select",
				"textarea",
				"link",
				"base",
				"meta",
				"audio",
				"video",
				"source",
				"template",
			],
			RETURN_DOM_FRAGMENT: true,
			USE_PROFILES: { html: true },
		});
		const result = document.createElement("template");
		// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare Element overloads shadow DOM append; appendChild retains the DOM node signature.
		result.content.appendChild(cleaned);
		// Stable serialization keeps the editor from replacing its DOM just for attribute order.
		for (const element of result.content.querySelectorAll("*")) {
			const attributes = [...element.attributes].toSorted((a, b) =>
				a.name.localeCompare(b.name)
			);
			for (const attribute of attributes) {
				element.removeAttribute(attribute.name);
			}
			for (const attribute of attributes) {
				element.setAttribute(attribute.name, attribute.value);
			}
		}
		// Metadata on a converted body element needs explicit preservation; DOMPurify may drop
		// obsolete body-only attributes, whose visual equivalents were translated above.
		const output = (() => {
			if (options.reader) {
				return result.innerHTML;
			}
			if (outgoing) {
				return outgoingFragment(result, doc);
			}
			return restoreDocument(result, doc, false);
		})();
		return { bodyTag, hasRemote, html: output, rootTag };
	};
	return sanitizeAndSerializeDocument();
}

export function sanitizeEmailHtml(
	html: string | null,
	options: SanitizeEmailHtmlOptions = {}
): string | null {
	if (!html || typeof window === "undefined") {
		return null;
	}
	return prepareEmailHtml(html, options).html;
}

export function sanitizeEditorHtml(html: string): string {
	return prepareEmailHtml(html, { editor: true }).html;
}
