#!/bin/sh
# Captures a clean baseline while you have uncommitted app work: sets src/ and public/ aside in a
# tagged stash (the harness stays, so both captures measure the same things),
# captures the groups from HEAD, then puts the work back. The stash is applied by SHA, never popped,
# because the stash stack is shared with other worktrees.
#
#   scripts/ui-scan/capture-base.sh <label> [<group>...]   (no groups: every group, which is what
#   a change to a shared component needs)
set -eu
label="$1"
shift
tag="ui-scan-base-$$"
sha=""
if [ -n "$(git status --porcelain -- src public)" ]; then
	git stash push -u -q -m "$tag" -- src public
	sha="$(git stash list --format='%H %gs' | grep "$tag" | cut -d' ' -f1)"
fi
restore() {
	if [ -n "$sha" ]; then
		git stash apply -q "$sha"
		ref="$(git stash list --format='%gd %gs' | grep "$tag" | cut -d' ' -f1)"
		[ -n "$ref" ] && git stash drop -q "$ref"
		sleep 5 # the dev server reloads the restored files; let it settle before the next capture
	fi
}
trap restore EXIT
sleep 2 # let the dev server pick up the reverted files
if [ "$#" -eq 0 ]; then
	set -- admin auth calendar compose drive mail settings
fi
printf '%s\n' "$@" | xargs -P 3 -I{} node scripts/ui-scan/capture.mjs --group {} --label "$label"
