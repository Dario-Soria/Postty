#!/bin/bash
echo "🔍 Testing AWS credentials..."
echo ""
echo "Current AWS configuration in .env:"
echo "AWS_ACCESS_KEY_ID: $(grep AWS_ACCESS_KEY_ID .env | cut -d'=' -f2)"
echo "AWS_REGION: $(grep AWS_REGION .env | cut -d'=' -f2)"
echo "AWS_BUCKET_NAME: $(grep AWS_BUCKET_NAME .env | cut -d'=' -f2)"
echo ""
echo "Attempting to list S3 buckets with these credentials..."
echo ""
export AWS_ACCESS_KEY_ID=$(grep AWS_ACCESS_KEY_ID .env | cut -d'=' -f2)
export AWS_SECRET_ACCESS_KEY=$(grep AWS_SECRET_ACCESS_KEY .env | cut -d'=' -f2)
export AWS_REGION=$(grep AWS_REGION .env | cut -d'=' -f2)

if command -v aws &> /dev/null; then
    aws s3 ls 2>&1
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ AWS credentials are valid!"
    else
        echo "❌ AWS credentials test failed"
    fi
else
    echo "⚠️  AWS CLI not installed. Install it to test credentials directly."
    echo "   Install: brew install awscli"
fi
