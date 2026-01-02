#!/bin/bash

echo "🔍 Testing Agent Connection..."
echo ""

# Check if backend is running
echo "1. Checking backend (port 8080)..."
if curl -s http://localhost:8080/health > /dev/null; then
    echo "   ✅ Backend is running"
else
    echo "   ❌ Backend is NOT running"
    echo "   → Start with: npm start"
    exit 1
fi

echo ""
echo "2. Checking Flask agent server (port 5001)..."
if curl -s http://localhost:5001/health > /dev/null; then
    echo "   ✅ Flask server is running"
    curl -s http://localhost:5001/health | jq .
else
    echo "   ⚠️  Flask server not running (will auto-start on first request)"
fi

echo ""
echo "3. Testing agent chat endpoint..."
response=$(curl -s -X POST http://localhost:8080/agent-chat \
  -F "agentType=product-showcase" \
  -F "message=Hola" \
  -F "conversationHistory=[]")

if echo "$response" | grep -q '"type"'; then
    echo "   ✅ Agent endpoint responding"
    echo "$response" | jq .
else
    echo "   ❌ Agent endpoint error"
    echo "$response"
fi

echo ""
echo "4. Checking Python dependencies..."
cd "Agents/Product Showcase"
if python3 -c "import flask" 2>/dev/null; then
    echo "   ✅ Flask installed"
else
    echo "   ❌ Flask not installed"
    echo "   → Run: pip3 install -r requirements-server.txt"
fi

if python3 -c "from agent import NanoBananaAgent" 2>/dev/null; then
    echo "   ✅ Agent module working"
else
    echo "   ❌ Agent module error"
    echo "   → Run: pip3 install -r requirements.txt"
fi

cd ../..

echo ""
echo "✨ Connection test complete!"

