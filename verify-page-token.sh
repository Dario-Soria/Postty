#!/bin/bash
echo "🔍 Token Verification Script"
echo ""
echo "Paste your Facebook Page Access Token (starts with EAAT):"
read -r TOKEN

if [[ ! $TOKEN =~ ^EAAT ]]; then
    echo "⚠️  Warning: Token doesn't start with EAAT. Make sure you're using a Facebook Page token, not an Instagram token."
fi

echo ""
echo "Testing token..."
echo ""

# Get Instagram User ID from .env
USER_ID=$(grep INSTAGRAM_USER_ID .env | cut -d'=' -f2 2>/dev/null)

if [ -z "$USER_ID" ]; then
    echo "❌ Could not find INSTAGRAM_USER_ID in .env"
    exit 1
fi

# Test the token
RESPONSE=$(curl -s "https://graph.facebook.com/v19.0/$USER_ID?fields=id,username,name&access_token=$TOKEN")

echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q "error"; then
    echo ""
    echo "❌ Token validation failed!"
    echo ""
    echo "Make sure:"
    echo "1. You're using a Facebook Page token (EAAT), not Instagram token (IGAA)"
    echo "2. The token has 'instagram_content_publish' permission"
    echo "3. Your Instagram account is connected to the Facebook Page"
else
    echo ""
    echo "✅ Token is VALID!"
    echo ""
    echo "Add this to your .env file:"
    echo "INSTAGRAM_ACCESS_TOKEN=$TOKEN"
fi
