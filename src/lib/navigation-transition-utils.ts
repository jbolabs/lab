// Direction of a navigation for the phone push/pop view transition (styled in globals.css).
// Opening something a list contains (`/inbox` → `/inbox/msg_1`, `/settings` → `/settings/account`)
// pushes; going back up pops. Sideways moves (next message, another folder) have no spatial
// relationship, so they get no transition.
export type NavigationTransitionType = "push" | "pop";

function trimSlash(path: string) {
	return path.length > 1 ? path.replace(/\/+$/u, "") : path;
}

export function getNavigationTransitionType(
	from: string | undefined,
	to: string
): NavigationTransitionType | null {
	if (!from) {
		return null;
	}
	const a = trimSlash(from);
	const b = trimSlash(to);
	if (a === b) {
		return null;
	}
	if (b.startsWith(`${a}/`)) {
		return "push";
	}
	if (a.startsWith(`${b}/`)) {
		return "pop";
	}
	return null;
}
