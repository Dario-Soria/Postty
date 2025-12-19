#!/bin/bash
echo "🔍 Checking S3 bucket policy..."
echo ""
export AWS_ACCESS_KEY_ID=$(grep AWS_ACCESS_KEY_ID .env | cut -d'=' -f2)
export AWS_SECRET_ACCESS_KEY=$(grep AWS_SECRET_ACCESS_KEY .env | cut -d'=' -f2)
export AWS_REGION=$(grep AWS_REGION .env | cut -d'=' -f2)
BUCKET_NAME=$(grep AWS_BUCKET_NAME .env | cut -d'=' -f2)

echo "Bucket: $BUCKET_NAME"
echo ""
echo "Current bucket policy:"
aws s3api get-bucket-policy --bucket "$BUCKET_NAME" --query Policy --output text 2>&1 | jq . 2>/dev/null || echo "No policy found or jq not installed"
