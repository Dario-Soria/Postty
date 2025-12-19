#!/bin/bash

# Test script for the new /generate-with-image-and-publish endpoint

echo "Testing /generate-with-image-and-publish endpoint..."
echo ""
echo "This will:"
echo "1. Upload an image"
echo "2. Analyze it with GPT-4 Vision"
echo "3. Generate a new AI image"
echo "4. Create a caption"
echo "5. Upload to S3"
echo "6. Publish to Instagram"
echo ""
echo "Expected time: 20-45 seconds"
echo ""
echo "Starting request..."
echo ""

curl -X POST http://localhost:3000/generate-with-image-and-publish \
  -F "image=@TestImage/Nalgene.jpg" \
  -F "prompt=I want to promote this new product for summer holidays. Create a hyper realistic image of a man drinking water from the botle in the picturewhile recovering from an ultra marathon in the mountains" \
  | jq '.'

echo ""
echo "Test completed!"

