#!/usr/bin/env bash
# Build the app and publish dist/ to a SEPARATE test repo (GitHub Pages).
# Production repos/branches are never touched.
# Usage: ./deploy-test.sh [test-repo-name]   (default: iapp-react-test)
set -euo pipefail
REPO="${1:-iapp-react-test}"
OWNER="drsakr86-hash"
[ "$REPO" = "iapp" ] && { echo "refusing to deploy over the production repo 'iapp'"; exit 1; }
[ "$REPO" = "I-App-lite" ] && { echo "refusing: use a separate test repo"; exit 1; }
npm test
npm run build
cd dist
touch .nojekyll
rm -rf .git
git init -q
git add -A
git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "Deploy $(date +%Y-%m-%d_%H:%M) from $(git -C .. rev-parse --short HEAD)"
git branch -M main
git remote add origin "https://github.com/$OWNER/$REPO.git"
git push -f origin main
echo
echo "Published. Enable Pages once: GitHub > $REPO > Settings > Pages > Deploy from branch: main / (root)"
echo "URL: https://$OWNER.github.io/$REPO/"
