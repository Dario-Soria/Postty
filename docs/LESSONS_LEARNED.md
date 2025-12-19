# Lessons Learned - Instagram Auto-Poster Setup

This document captures the key issues encountered during initial setup and their solutions. It serves as a reference for future troubleshooting and onboarding.

---

## Critical Issues & Solutions

### 1. Wrong Token Type (Most Common Issue)

**Problem:**
- Users often generate an **Instagram token** (starts with `IGAA`) instead of a **Facebook Page token** (starts with `EAAT`)
- Instagram Graph API requires a Facebook Page token to publish content
- Error message: `"Invalid OAuth access token - Cannot parse access token"`

**Why This Happens:**
- Instagram Graph API documentation can be confusing
- There are multiple token types in the Facebook ecosystem
- Graph API Explorer defaults to "User Token" instead of Page token

**Solution:**
```
1. Go to Graph API Explorer
2. Select your app
3. CRITICAL: Click "User or Page" dropdown → Select your Facebook Page
4. Add permissions: instagram_content_publish, instagram_basic
5. Generate Access Token
6. Verify token starts with EAAT (not IGAA)
```

**How to Verify:**
- Click (i) icon next to token
- Should show: "Page: Your Page Name"
- Should NOT show: "User: Your Name"

---

### 2. S3 ACL Not Supported

**Problem:**
- Modern S3 buckets have ACLs disabled by default
- Original code tried to set `ACL: 'public-read'` on uploads
- Error: `"AccessControlListNotSupported: The bucket does not allow ACLs"`

**Why This Happens:**
- AWS security best practice is to disable ACLs
- Bucket policies are now preferred over ACLs
- New buckets created after April 2023 have ACLs disabled by default

**Solution:**
```typescript
// BEFORE (doesn't work):
const uploadParams = {
  Bucket: bucketName,
  Key: s3Key,
  Body: fileContent,
  ContentType: contentType,
  ACL: 'public-read', // ❌ Not supported
};

// AFTER (works):
const uploadParams = {
  Bucket: bucketName,
  Key: s3Key,
  Body: fileContent,
  ContentType: contentType,
  // No ACL - bucket policy handles public access
};
```

**Bucket Policy Instead:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::bucket-name/instagram/*"
    }
  ]
}
```

---

### 3. Instagram Account Not Connected to Facebook Page

**Problem:**
- Instagram Business account must be linked to a Facebook Page
- Graph API can't find Instagram account
- Error: `"instagram_business_account" field is empty`

**Why This Happens:**
- Users convert to Business account but don't complete Facebook Page connection
- Connection gets disconnected
- Connected to wrong Facebook Page

**Solution:**
```
1. Instagram app → Settings → Account Center
2. Accounts → Add accounts → Facebook
3. Select the correct Facebook Page (not personal profile)
4. Verify: Facebook Page → Settings → Instagram should show your IG account
```

**Verification Query:**
```
// In Graph API Explorer:
YOUR_PAGE_ID?fields=instagram_business_account

// Should return:
{
  "instagram_business_account": {
    "id": "17841404255523928"
  }
}
```

---

### 4. Missing instagram_content_publish Permission

**Problem:**
- Token generated without required permission
- Can query data but can't publish posts
- Error: Various permission-related errors

**Why This Happens:**
- Users skip adding the permission
- Permission not approved for the app
- Token generated before permission was added

**Solution:**
```
1. Graph API Explorer → Permissions tab
2. Add a Permission → Search "instagram_content_publish"
3. Click to add it
4. Generate new token
5. Verify: Token Info should show this permission in Scopes
```

**Critical Permissions:**
- ✅ `instagram_content_publish` - REQUIRED for posting
- ✅ `instagram_basic` - Basic read access
- ✅ `pages_read_engagement` - For Page token
- ✅ `pages_show_list` - For Page token

---

### 5. Token Expiration Not Monitored

**Problem:**
- Short-lived tokens expire in ~1 hour
- Long-lived tokens expire in 60 days
- Service suddenly stops working
- Error: `"Error validating access token: Session has expired"`

**Why This Happens:**
- No monitoring set up for token expiration
- Users forget to renew tokens
- No automated renewal process

**Solution:**
```bash
# Exchange for long-lived token (60 days):
curl "https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN"

# Set calendar reminder: Renew token every 50 days
```

**Best Practice:**
- Always exchange for long-lived tokens immediately
- Set up monitoring/alerts for token expiration
- Document token renewal process
- Store token expiration date

---

### 6. AWS Credentials in Wrong Format

**Problem:**
- Credentials copied with extra spaces, quotes, or line breaks
- Credentials from wrong AWS account
- Error: `"InvalidAccessKeyId: The AWS Access Key Id you provided does not exist"`

**Why This Happens:**
- Copy-paste errors
- Multiple AWS accounts
- Old/deleted credentials

**Solution:**
```bash
# Test credentials separately:
./check-aws.sh

# Or manually:
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
aws s3 ls

# Verify format:
# Access Key: Starts with AKIA, 20 characters
# Secret Key: 40 characters, alphanumeric + symbols
```

**Verification:**
```env
# CORRECT:
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# WRONG:
AWS_ACCESS_KEY_ID="AKIA..." # ❌ No quotes
AWS_ACCESS_KEY_ID= AKIA...  # ❌ No spaces
AWS_ACCESS_KEY_ID=your_aws_access_key # ❌ Not a placeholder
```

---

## Architecture Decisions

### Why S3 Instead of Direct Upload?

**Decision:** Upload to S3 first, then provide URL to Instagram

**Reasoning:**
- Instagram Graph API requires a publicly accessible HTTPS URL
- Instagram doesn't accept direct file uploads
- Instagram's servers fetch the image from the URL
- S3 provides reliable, fast, and scalable hosting

**Alternatives Considered:**
- Direct server hosting: Requires public domain, SSL, always-on server
- Imgur API: Terms of service restrictions, rate limits
- Other cloud storage: All viable (Cloudflare R2, DigitalOcean Spaces)

### Why Facebook Page Token, Not Instagram Token?

**Decision:** Use Facebook Page Access Token (EAAT) for all API calls

**Reasoning:**
- Instagram Graph API is technically part of Facebook Graph API
- Instagram Business accounts are linked to Facebook Pages
- API authentication happens through Facebook's infrastructure
- Page tokens have the necessary permissions for content publishing

**Key Point:**
- Instagram tokens (IGAA) are for Instagram Basic Display API (read-only)
- Facebook Page tokens (EAAT) are for Instagram Graph API (publish)

### Why No ACLs on S3?

**Decision:** Use bucket policies instead of per-object ACLs

**Reasoning:**
- AWS security best practice
- Simpler permission management
- Better control and auditing
- Modern S3 default (ACLs disabled)
- One policy instead of ACL per object

**Implementation:**
- Bucket policy grants public read to `instagram/*` path
- No ACL parameter in upload request
- Cleaner, more maintainable code

---

## Common Pitfalls

### 1. Not Adding Yourself as App Tester
- **Symptom:** Can't generate token or get "Insufficient Developer Role" error
- **Fix:** App Dashboard → Roles → Add yourself as Tester → Accept invitation

### 2. Using Personal Account Instead of Business Account
- **Symptom:** Can't find Instagram account in Graph API
- **Fix:** Convert Instagram to Business/Creator account in app settings

### 3. Wrong Facebook Page Selected
- **Symptom:** Can't find Instagram account or permission errors
- **Fix:** Ensure Instagram is connected to the SAME Facebook Page used for token

### 4. Image Path Issues
- **Symptom:** "File does not exist" error
- **Fix:** Use absolute paths (`/Users/...`), not relative paths (`./image.jpg`)

### 5. Bucket Not Publicly Accessible
- **Symptom:** Instagram can't fetch image, container status = ERROR
- **Fix:** Test S3 URL in incognito browser, should load without login

### 6. Image Doesn't Meet Requirements
- **Symptom:** Container processing fails or ERROR status
- **Fix:** Verify format (JPG/PNG), size (<8MB), dimensions (>320px)

---

## Verification Checklist

Use these checks before reporting issues:

```bash
# 1. Check all environment variables
npm run verify

# 2. Test AWS credentials
./check-aws.sh

# 3. Test Instagram token
./check-token.sh

# 4. Test server health
curl http://localhost:3000/health

# 5. Verify image file
ls -lh /path/to/image.jpg
file /path/to/image.jpg

# 6. Test S3 access (after upload)
curl -I https://bucket.s3.amazonaws.com/instagram/file.jpg
```

---

## Future Improvements

### Token Management
- Implement automatic token renewal
- Add token expiration monitoring
- Implement token refresh flow

### Error Handling
- Better error messages for common issues
- Retry logic for transient failures
- Circuit breaker for rate limits

### Monitoring
- Track upload success rate
- Monitor API latency
- Alert on repeated failures
- Log token usage and expiration

### Developer Experience
- Better onboarding docs (✅ Done)
- Setup wizard for first-time users
- Automated credential validation
- Interactive troubleshooting guide

---

## Key Takeaways

1. **Token type matters:** EAAT (Facebook Page) not IGAA (Instagram)
2. **Always verify tokens:** Use Graph API Explorer info icon
3. **Use bucket policies:** Not ACLs for S3 public access
4. **Facebook Page is required:** Instagram Business must be connected
5. **Absolute paths for files:** Always use full paths
6. **Test credentials separately:** Before running full workflow
7. **Monitor token expiration:** Set up alerts and reminders
8. **Read error messages carefully:** They often point to the exact issue

---

## Success Indicators

When everything is set up correctly:

- ✅ `npm run verify` shows all green checkmarks
- ✅ `./check-aws.sh` shows valid credentials
- ✅ `./check-token.sh` shows valid token
- ✅ Server starts without errors
- ✅ Health endpoint responds with 200
- ✅ First post succeeds within 30 seconds
- ✅ Post visible on Instagram immediately
- ✅ Image loads properly on Instagram
- ✅ Caption displays correctly with emojis and hashtags

---

**Last Updated:** December 2024  
**Based on:** Real setup experience and troubleshooting session

