#!/bin/bash
echo "🔍 Checking Instagram Access Token..."
echo ""
export TOKEN=$(grep INSTAGRAM_ACCESS_TOKEN .env | cut -d'=' -f2)
export USER_ID=$(grep INSTAGRAM_USER_ID .env | cut -d'=' -f2)

echo "Token starts with: ${TOKEN:0:20}..."
echo "Token length: ${#TOKEN} characters"
echo "User ID: $USER_ID"
echo ""
echo "Testing token with Instagram Graph API..."
echo ""

RESPONSE=$(curl -s "https://graph.facebook.com/v19.0/$USER_ID?fields=id,username&access_token=$TOKEN")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q "error"; then
    echo ""
    echo "❌ Token validation failed!"
    echo ""
    echo "Common issues:"
    echo "1. Token has expired (short-lived tokens last ~1 hour)"
    echo "2. Token format is incorrect"
    echo "3. Token doesn't have proper permissions"
    echo "4. Token was generated for a different Instagram account"
else
    echo ""
    echo "✅ Token is valid!"
fi
