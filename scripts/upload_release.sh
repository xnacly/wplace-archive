#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
	echo "Usage: $0 <first-arg>" >&2
	exit 1
fi

first_arg="$1"
echo "$first_arg"

cd public/tiles
git init 
git remote add origin https://github.com/samuelscheit/wplace-archive
git checkout --orphan "$first_arg"
git add -A .
git commit -m "initial commit"
git push --force --set-upstream origin "$first_arg"

echo "Upload complete."
