const avatarColors = [
	{ background: "#FFCDD2", foreground: "#202124" },
	{ background: "#F8BBD0", foreground: "#202124" },
	{ background: "#E1BEE7", foreground: "#202124" },
	{ background: "#C5CAE9", foreground: "#202124" },
	{ background: "#BBDEFB", foreground: "#202124" },
	{ background: "#B2DFDB", foreground: "#202124" },
	{ background: "#C8E6C9", foreground: "#202124" },
	{ background: "#FFE0B2", foreground: "#202124" },
	{ background: "#D7CCC8", foreground: "#202124" },
	{ background: "#CFD8DC", foreground: "#202124" },
];

export function getAvatarColorStyle(identity: string): {
	backgroundColor: string;
	color: string;
} {
	let hash = 0;
	const stableIdentity = identity.trim().toLowerCase();

	for (let i = 0; i < stableIdentity.length; i += 1) {
		// oxlint-disable-next-line unicorn/prefer-code-point -- Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
		hash = Math.trunc(Math.imul(hash, 31) + stableIdentity.charCodeAt(i));
	}

	// oxlint-disable-next-line eslint/no-bitwise -- The persisted hash uses exact 32-bit integer arithmetic; changing it changes stable CSS or avatar identities.
	const color = avatarColors[(hash >>> 0) % avatarColors.length];
	return { backgroundColor: color.background, color: color.foreground };
}
