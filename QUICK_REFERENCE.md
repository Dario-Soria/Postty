# Quick Reference Guide

Quick reference for common tasks after initial setup is complete.

---

## Starting the Server

```bash
npm run dev
```

Server will start on port 3000 (or PORT from `.env`)

---

## Making a Post

### Using curl

```bash
curl -X POST http://localhost:3000/publish-instagram \
  -H "Content-Type: application/json" \
  -d '{
    "image_path": "/absolute/path/to/image.jpg",
    "caption": "Your caption here #hashtag"
  }'
```

### Using JavaScript/TypeScript

```typescript
const response = await fetch('http://localhost:3000/publish-instagram', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image_path: '/path/to/image.jpg',
    caption: 'Your caption here'
  })
});

const result = await response.json();
console.log(result);
```

### Success Response

```json
{
  "status": "success",
  "uploaded_image_url": "https://bucket.s3.amazonaws.com/instagram/123-image.jpg",
  "instagram_response": {
    "id": "17895695668004550"
  }
}
```

### Error Response

```json
{
  "status": "error",
  "message": "Error description"
}
```

---

## Verification Commands

### Check All Configuration

```bash
npm run verify
```

### Test AWS Credentials

```bash
./check-aws.sh
```

### Test Instagram Token

```bash
./check-token.sh
```

### Health Check

```bash
curl http://localhost:3000/health
```

---

## Common Issues & Quick Fixes

### Token Expired

**Symptom:** "Invalid OAuth access token"

**Fix:**
1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Select your **Facebook Page** (not User Token)
4. Add permissions: `instagram_content_publish`, `instagram_basic`
5. Generate Access Token
6. Exchange for long-lived token (optional):
   ```bash
   curl "https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN"
   ```
7. Update `INSTAGRAM_ACCESS_TOKEN` in `.env`
8. Restart server

### AWS Credentials Invalid

**Symptom:** "InvalidAccessKeyId"

**Fix:**
1. Go to AWS IAM Console
2. Find your user → Security credentials
3. Create new access key
4. Update `.env` with new credentials
5. Restart server

### Image Not Found

**Symptom:** "File does not exist"

**Fix:**
- Use absolute paths (e.g., `/Users/username/image.jpg`)
- Verify file exists: `ls -la /path/to/image.jpg`

### S3 Upload Failed

**Symptom:** "Failed to upload image to S3"

**Fix:**
1. Verify bucket name in `.env` matches actual bucket
2. Check AWS credentials: `./check-aws.sh`
3. Ensure bucket policy allows uploads
4. Check IAM user has S3 permissions

---

## Environment Variables Reference

```env
# Instagram Configuration
INSTAGRAM_USER_ID=17841404255523928           # Your Instagram Business Account ID
INSTAGRAM_ACCESS_TOKEN=EAATxxxxxxxxxxxxx      # Facebook Page token (MUST start with EAAT)

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxx           # AWS Access Key
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxx        # AWS Secret Key
AWS_REGION=us-east-1                          # S3 bucket region
AWS_BUCKET_NAME=instagram-poster-images       # S3 bucket name

# Optional Configuration
PORT=3000                                     # Server port
GRAPH_API_VERSION=v19.0                       # Facebook Graph API version
```

---

## Image Requirements

- **Format:** JPG, PNG (GIF for stories only)
- **Max Size:** 8 MB
- **Min Dimensions:** 320px
- **Recommended:** 1080x1080 (square) or 1080x1350 (portrait)
- **Aspect Ratios:**
  - Square: 1:1
  - Portrait: 4:5
  - Landscape: 1.91:1

---

## Token Renewal Schedule

| Token Type | Lifetime | Renewal Action |
|------------|----------|----------------|
| Short-lived | ~1 hour | Exchange for long-lived token |
| Long-lived | 60 days | Generate new token every 50 days |

**Set a calendar reminder** to renew your token before it expires!

---

## Useful Links

- **Graph API Explorer:** https://developers.facebook.com/tools/explorer/
- **Facebook App Dashboard:** https://developers.facebook.com/apps/
- **AWS S3 Console:** https://s3.console.aws.amazon.com/
- **AWS IAM Console:** https://console.aws.amazon.com/iam/
- **Instagram Graph API Docs:** https://developers.facebook.com/docs/instagram-api/

---

## Testing Checklist

Before going live with production posts:

- [ ] Test with sample image
- [ ] Verify post appears on Instagram
- [ ] Check image quality
- [ ] Test caption with emojis and hashtags
- [ ] Verify links in caption work
- [ ] Test with different image formats (JPG, PNG)
- [ ] Test with different image sizes
- [ ] Monitor server logs for errors
- [ ] Set up token expiration monitoring

---

## Production Deployment Notes

When deploying to production:

1. **Use environment variables** - Never hardcode credentials
2. **Enable HTTPS** - Use SSL/TLS certificates
3. **Add authentication** - Protect your API endpoint
4. **Set up monitoring** - Track errors and performance
5. **Configure logging** - Use proper logging service
6. **Add rate limiting** - Prevent API abuse
7. **Use process manager** - pm2 or similar
8. **Set up alerts** - Token expiration, errors, etc.

---

## Support

For detailed setup instructions: [SETUP_GUIDE.md](SETUP_GUIDE.md)

For troubleshooting: [README.md](README.md) → Troubleshooting section

For project overview: [README.md](README.md)

