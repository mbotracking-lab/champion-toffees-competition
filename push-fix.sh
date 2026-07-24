#!/bin/bash
# Push the ZAI VLM fix to GitHub and trigger Vercel deployment
# Run this from the champion-toffees-competition project directory

cd "$(dirname "$0")"
git push origin main

echo "✅ Push complete! Vercel should auto-deploy within 1-2 minutes."
echo "After deployment, test at: https://champion-toffees-competition-f8tl.vercel.app"
echo ""
echo "If git push fails, you may need to authenticate with GitHub:"
echo "  1. Create a Personal Access Token at: https://github.com/settings/tokens"
echo "  2. Run: git remote set-url origin https://<TOKEN>@github.com/mbotracking-lab/champion-toffees-competition.git"
echo "  3. Then run this script again"
