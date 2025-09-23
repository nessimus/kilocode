#!/usr/bin/env bash
set -euo pipefail

if rg -i "white(?:\s*surface|(?:-)?board)" --hidden --glob '!node_modules/**' --glob '!pnpm-lock.yaml' --glob '!.git/**' ; then
	echo "\n❌ Naming guard failed: found disallowed variant of 'whiteboard/white surface'." >&2
	exit 1
fi

exit 0
