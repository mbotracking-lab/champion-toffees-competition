#!/bin/bash
# Setup Vercel Environment Variables for Champion Toffees Competition
# Run this script after logging into Vercel CLI

# Step 1: Login to Vercel
echo "Step 1: Logging into Vercel..."
vercel login

# Step 2: Link the project
echo "Step 2: Linking project..."
vercel link --yes

# Step 3: Add environment variables
echo "Step 3: Setting environment variables..."

# DATABASE_URL - You need to get this from your Neon dashboard
# Visit https://console.neon.tech/ → your project → Dashboard → Connection string
read -p "Enter your Neon DATABASE_URL: " DATABASE_URL
vercel env add DATABASE_URL production <<< "$DATABASE_URL"

# ZAI SDK variables
vercel env add ZAI_BASE_URL production <<< "https://internal-api.z.ai/v1"
vercel env add ZAI_API_KEY production <<< "Z.ai"

read -p "Enter ZAI_TOKEN (from .z-ai-config): " ZAI_TOKEN
vercel env add ZAI_TOKEN production <<< "$ZAI_TOKEN"

read -p "Enter ZAI_USER_ID (from .z-ai-config): " ZAI_USER_ID
vercel env add ZAI_USER_ID production <<< "$ZAI_USER_ID"

read -p "Enter ZAI_CHAT_ID (from .z-ai-config): " ZAI_CHAT_ID
vercel env add ZAI_CHAT_ID production <<< "$ZAI_CHAT_ID"

# Admin credentials
vercel env add ADMIN_USERNAME production <<< "admin"
vercel env add ADMIN_PASSWORD production <<< "champion2026"

echo "Environment variables set! Deploying..."
vercel --prod

echo "Done! Visit your app and test the VLM validation."
