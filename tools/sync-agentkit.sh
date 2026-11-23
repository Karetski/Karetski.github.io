#!/usr/bin/env bash
#
# sync-agentkit.sh — copy the project-neutral skills and coding conduct from agentkit
# into this repo, verbatim, and record the agentkit commit they came from.
#
# The copies are vendored (not symlinked) so that every session — including cloud
# sessions without ~/.claude or a sibling agentkit checkout — sees the same skills.
# Never edit the copies here: change them upstream in agentkit and re-run this script.
#
#   tools/sync-agentkit.sh [path-to-agentkit]     (default: ../../agentkit)

set -euo pipefail

cd "$(dirname "$0")/.."

AGENTKIT=${1:-../../agentkit}
SKILLS="architecture-canon behavioral-testing commit-discipline debugging-methodology function-shape hot-path-budget-audit principle-review simplify-ruthless"

if [ ! -d "$AGENTKIT/skills" ] || [ ! -f "$AGENTKIT/CLAUDE.md" ]; then
	echo "sync-agentkit: $AGENTKIT is not an agentkit checkout" >&2
	exit 1
fi
if [ -n "$(git -C "$AGENTKIT" status --porcelain 2>/dev/null)" ]; then
	echo "sync-agentkit: $AGENTKIT has uncommitted changes; commit them upstream first" >&2
	exit 1
fi

COMMIT=$(git -C "$AGENTKIT" rev-parse --short HEAD)

for skill in $SKILLS; do
	rm -rf ".claude/skills/$skill"
	cp -R "$AGENTKIT/skills/$skill" ".claude/skills/$skill"
done
cp "$AGENTKIT/CLAUDE.md" .claude/agentkit-conduct.md

{
	echo "# Vendored from agentkit — do not edit here; edit upstream and run tools/sync-agentkit.sh"
	echo "commit: $COMMIT"
	echo "conduct: .claude/agentkit-conduct.md"
	for skill in $SKILLS; do
		echo "skill: $skill"
	done
} > .claude/agentkit.lock

echo "sync-agentkit: vendored agentkit@$COMMIT ($SKILLS)"
