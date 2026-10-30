#!/bin/sh
# Captures a clean baseline while you have uncommitted work: sets the work aside in a tagged stash,
# captures the groups from HEAD, then puts the work back. The stash is applied by SHA, never popped,
# because the stash stack is shared with other worktrees.
#
#   scripts/ui-scan/capture-base.sh <label> <group>...
set -eu
label="$1"
shift
tag="ui-scan-base-$$"
sha=""
if [ -n "$(git status --porcelain)" ]; then
	git stash push -u -q -m "$tag"
	sha="$(git stash list --format='%H %gs' | grep "$tag" | cut -d' ' -f1)"
fi
restore() {
	if [ -n "$sha" ]; then
		git stash apply -q "$sha"
		ref="$(git stash list --format='%gd %gs' | grep "$tag" | cut -d' ' -f1)"
		[ -n "$ref" ] && git stash drop -q "$ref"
	fi
}
trap restore EXIT
sleep 2 # let the dev server pick up the reverted files
printf '%s\n' "$@" | xargs -P 3 -I{} node scripts/ui-scan/capture.mjs --group {} --label "$label"
