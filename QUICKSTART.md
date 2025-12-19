# Quick Start Guide

## Prerequisites Checklist

Before making your first post, ensure you have:

### ✅ Instagram Setup (DONE - if you've added to .env)
- [ ] Instagram Business/Creator Account
- [ ] Connected to a Facebook Page
- [ ] `INSTAGRAM_USER_ID` in `.env`
- [ ] `INSTAGRAM_ACCESS_TOKEN` in `.env`

### 🔧 AWS S3 Setup (TODO)
- [ ] AWS Account created
- [ ] S3 Bucket created
- [ ] Bucket configured for public-read access
- [ ] IAM User created with S3 permissions
- [ ] AWS credentials added to `.env`:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_REGION`
  - `AWS_BUCKET_NAME`

### 📦 Project Setup
- [ ] Dependencies installed: `npm install`
- [ ] TypeScript compiled: `npm run build` (optional for dev)

## Step-by-Step: Create Your First Post

### 1. Verify Your .env File

Your `.env` should look like this:

```env
# Instagram (you have these)
INSTAGRAM_USER_ID=17841405309211844
INSTAGRAM_ACCESS_TOKEN=EAAxxxxxxxxxxxxx

# AWS S3 (add these)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxx...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=my-instagram-images

# AI (required for /generate*, /generate-with-image*)
# OpenAI is still used for caption generation and uploaded-image analysis
OPENAI_API_KEY=sk-proj-xxxxx...

# Optional: voice transcription (used by /transcribe)
# OPENAI_TRANSCRIBE_MODEL=whisper-1
# TRANSCRIBE_MAX_BYTES=10485760

# Gemini (recommended for image generation)
GEMINI_API_KEY=xxxxx...

# Optional: Pixabay enrichment (opt-in, generation-only)
# - ENABLE_PIXABAY must be true AND the request must include use_pixabay=true
# - Pixabay API: https://pixabay.com/api/docs/
PIXABAY_API_KEY=xxxxx...
ENABLE_PIXABAY=false
# PIXABAY_QUERY_MODEL=gpt-4o-mini
# GEMINI_TEXT_MODEL=gemini-2.0-flash

# Optional (default: gemini if GEMINI_API_KEY is set, else openai)
# IMAGE_GENERATION_PROVIDER=gemini
# IMAGE_GENERATION_PROVIDER=openai
# GEMINI_IMAGE_MODEL=imagen-4.0-generate-001

# Optional
PORT=8080
GRAPH_API_VERSION=v19.0
```

### 2. Install Dependencies

```bash
cd "/Users/dariosoria/Code/Postty v2"
npm install
```

### 3. Prepare a Test Image

Find or create an image:
- Format: JPG, PNG, or GIF
- Max size: 8MB
- Recommended: Square (1:1 ratio) or portrait (4:5)
- Save it somewhere accessible, e.g., `/Users/dariosoria/Desktop/test.jpg`

### 4. Start the Development Server

```bash
npm run dev
```

You should see:
```
Server listening on http://0.0.0.0:8080
Available routes:
  POST /publish-instagram - Publish image to Instagram
  GET  /health - Health check
```

### 5. Test the Health Endpoint

In a new terminal:
```bash
curl http://localhost:8080/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-15T10:30:00.000Z"}
```

### 6. Make Your First Post!

```bash
curl -X POST http://localhost:8080/publish-instagram \
  -H "Content-Type: application/json" \
  -d '{
    "image_path": "/Users/dariosoria/Desktop/test.jpg",
    "caption": "My first automated Instagram post! 🚀 #automation"
  }'
```

Expected response:
```json
{
  "status": "success",
  "uploaded_image_url": "https://your-bucket.s3.amazonaws.com/instagram/1234567890-test.jpg",
  "instagram_response": {
    "id": "17895695668004550"
  }
}
```

## Optional: test generation with Pixabay opt-in (no publish)

Pixabay has rate limits, requires **24h caching**, and does not allow permanent hotlinking; we download images server-side. See [Pixabay API documentation](https://pixabay.com/api/docs/).

### Generate from text (opt-in)

```bash
curl -X POST http://localhost:8080/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A bottle on a river stream in snowy mountains","use_pixabay":true}'
```

### Generate with uploaded image (opt-in)

```bash
curl -X POST http://localhost:8080/generate-with-image \
  -F "image=@TestImage/Nalgene.jpg" \
  -F "prompt=A bottle on a river stream in snowy mountains" \
  -F "use_pixabay=true"
```

## Quick AWS S3 Setup

If you don't have S3 configured yet:

### Option 1: AWS Console (Easiest)

1. **Create S3 Bucket:**
   - Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
   - Click "Create bucket"
   - Name: `instagram-poster-images-yourname`
   - Region: `us-east-1` (or your preferred region)
   - Uncheck "Block all public access" ⚠️
   - Check "I acknowledge..."
   - Click "Create bucket"

2. **Set Bucket Policy:**
   - Click your bucket name
   - Go to "Permissions" tab
   - Scroll to "Bucket policy"
   - Click "Edit" and paste:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/instagram/*"
       }
     ]
   }
   ```
   
   - Replace `YOUR-BUCKET-NAME` with your actual bucket name
   - Click "Save changes"

3. **Create IAM User:**
   - Go to [IAM Console](https://console.aws.amazon.com/iam/)
   - Click "Users" → "Create user"
   - Username: `instagram-poster`
   - Click "Next"
   - Select "Attach policies directly"
   - Search and select: `AmazonS3FullAccess` (or create a custom policy with only S3 permissions)
   - Click "Next" → "Create user"

4. **Create Access Keys:**
   - Click the user you just created
   - Go to "Security credentials" tab
   - Under "Access keys", click "Create access key"
   - Select "Application running outside AWS"
   - Click "Next" → "Create access key"
   - **IMPORTANT:** Copy the Access Key ID and Secret Access Key
   - Add them to your `.env` file

### Option 2: AWS CLI (For Advanced Users)

```bash
# Create bucket
aws s3 mb s3://instagram-poster-images-yourname --region us-east-1

# Create bucket policy file
cat > bucket-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::instagram-poster-images-yourname/instagram/*"
    }
  ]
}
EOF

# Apply bucket policy
aws s3api put-bucket-policy --bucket instagram-poster-images-yourname --policy file://bucket-policy.json

# Create IAM user and access key
aws iam create-user --user-name instagram-poster
aws iam attach-user-policy --user-name instagram-poster --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
aws iam create-access-key --user-name instagram-poster
```

## Troubleshooting

### "AWS_BUCKET_NAME environment variable is not set"
- Double-check your `.env` file has all AWS variables
- Restart the server after updating `.env`

### "Failed to upload image to S3"
- Verify AWS credentials are correct
- Check IAM user has S3 permissions
- Ensure bucket name matches `.env`

### "Failed to create media container"
- Verify Instagram token is valid and not expired
- Ensure Instagram account is Business/Creator type
- Check account is connected to Facebook Page

### "File does not exist"
- Use absolute paths (e.g., `/Users/dariosoria/Desktop/image.jpg`)
- Check file exists and is readable

## Alternative: Test Without Real Instagram

If you want to test the S3 upload part first without posting to Instagram:

1. Comment out the Instagram publish step in `src/routes/publish-instagram.ts` (lines 56-61)
2. Change the response to just show the uploaded URL
3. Test that S3 uploads work before going live on Instagram

## Next Steps

Once your first post works:

- Set up long-lived tokens (60 days) instead of short-lived ones
- Explore batch posting multiple images
- Integrate AI-generated captions
- Add image generation capabilities
- Set up post scheduling

Enjoy your automated Instagram posting! 🎉

