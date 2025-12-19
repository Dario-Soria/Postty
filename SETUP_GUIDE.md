# Complete Setup Guide - Instagram Auto-Poster

This guide provides complete setup instructions for getting the Instagram Auto-Poster working from scratch. It's divided into sections for **Developers** (setting up the service) and **End Users/Customers** (configuring their Instagram accounts).

---

## Table of Contents

- [For Developers](#for-developers)
  - [Installation](#installation)
  - [AWS S3 Setup](#aws-s3-setup)
  - [Verification](#verification)
- [For End Users/Customers](#for-end-userscustomers)
  - [Instagram Business Account Setup](#instagram-business-account-setup)
  - [Facebook App & Token Setup](#facebook-app--token-setup)
  - [Getting Your Credentials](#getting-your-credentials)
- [Testing Your Setup](#testing-your-setup)
- [Troubleshooting](#troubleshooting)

---

## For Developers

### Installation

#### 1. Clone and Install Dependencies

```bash
cd "/path/to/instagram-poster"
npm install
```

#### 2. Create Environment File

```bash
cp .env.example .env
```

Your `.env` file should look like:

```env
# Instagram Configuration (provided by customer/end user)
INSTAGRAM_USER_ID=17841404255523928
INSTAGRAM_ACCESS_TOKEN=EAATxxxxxxxxxxxxxxxxxxxxxx

# AWS S3 Configuration (developer manages)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=instagram-poster-images

# Optional Configuration
PORT=3000
GRAPH_API_VERSION=v19.0
```

---

### AWS S3 Setup

#### Step 1: Create S3 Bucket

Using AWS Console:

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click **"Create bucket"**
3. Configure:
   - **Bucket name**: `instagram-poster-images-[unique-suffix]`
   - **Region**: `us-east-1` (or your preferred region)
   - **Block Public Access**: ⚠️ **UNCHECK** "Block all public access"
   - Acknowledge the warning
4. Click **"Create bucket"**

Using AWS CLI:

```bash
aws s3 mb s3://instagram-poster-images-yourname --region us-east-1
```

#### Step 2: Configure Bucket Policy

The bucket needs to allow public read access to the `instagram/*` path so Instagram can fetch images.

1. Go to your bucket → **Permissions** tab
2. Scroll to **Bucket policy**
3. Click **Edit** and paste:

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

**Important:** Replace `YOUR-BUCKET-NAME` with your actual bucket name.

4. Click **Save changes**

#### Step 3: Disable ACLs (Critical!)

Modern S3 buckets have ACLs disabled by default. Our code is configured to work without ACLs and relies on the bucket policy instead.

1. Go to your bucket → **Permissions** tab
2. Find **Object Ownership**
3. Ensure it's set to **"ACLs disabled (recommended)"**

This is why we removed the `ACL: 'public-read'` line from the upload code.

#### Step 4: Create IAM User

1. Go to [IAM Console](https://console.aws.amazon.com/iam/)
2. Click **Users** → **Create user**
3. Username: `instagram-poster-app`
4. Click **Next**
5. Select **"Attach policies directly"**
6. Search and attach: **`AmazonS3FullAccess`** (or create a custom policy with only S3 permissions)
7. Click **Next** → **Create user**

#### Step 5: Create Access Keys

1. Click the user you just created
2. Go to **Security credentials** tab
3. Under **Access keys**, click **Create access key**
4. Select **"Application running outside AWS"**
5. Click **Next** → **Create access key**
6. **⚠️ COPY BOTH VALUES IMMEDIATELY:**
   - Access key ID (starts with `AKIA`)
   - Secret access key (long random string)
7. Save them to your `.env` file

#### Step 6: Test AWS Configuration

```bash
# Install AWS CLI if needed
brew install awscli  # macOS
# or: apt-get install awscli  # Linux

# Test credentials
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1

aws s3 ls s3://your-bucket-name
```

If successful, you'll see your bucket listed.

---

### Verification

Run the verification script to check all environment variables:

```bash
npm run verify
```

Expected output:
```
✅ Instagram User ID (INSTAGRAM_USER_ID): 17841404255523928
✅ Instagram Access Token (INSTAGRAM_ACCESS_TOKEN): EAATxxxx...
✅ AWS Access Key ID (AWS_ACCESS_KEY_ID): AKIA...
✅ AWS Secret Access Key (AWS_SECRET_ACCESS_KEY): xxxxx...
✅ AWS Region (AWS_REGION): us-east-1
✅ AWS Bucket Name (AWS_BUCKET_NAME): instagram-poster-images
✅ Port (PORT): 3000
✅ Graph API Version (GRAPH_API_VERSION): v19.0

✅ Setup COMPLETE! All variables configured.
```

---

## For End Users/Customers

This section is for the person who owns the Instagram account and wants to enable automated posting.

### Instagram Business Account Setup

#### Step 1: Convert to Instagram Business Account

1. Open **Instagram mobile app**
2. Go to **Profile** → **☰ Menu** → **Settings and privacy**
3. Tap **Account type and tools**
4. If you see "Switch to Professional Account", tap it
5. Choose **Business** or **Creator**
6. Complete the setup process

✅ Your account is now a Business/Creator account.

#### Step 2: Create a Facebook Page

Your Instagram Business account **must** be connected to a Facebook Page.

1. Go to [facebook.com/pages/create](https://www.facebook.com/pages/create)
2. Click **"Create new Page"**
3. Fill in:
   - **Page name**: Your business/brand name
   - **Category**: Choose relevant category
   - **Description**: Brief description
4. Click **Create Page**

✅ You now have a Facebook Page.

#### Step 3: Connect Instagram to Facebook Page

**Via Instagram App (Recommended):**

1. Instagram app → **Settings** → **Account Center**
2. Tap **"Accounts"** → **"Add accounts"**
3. Select **Facebook** → Log in
4. Choose your **Facebook Page** (not your personal profile)
5. Complete the connection

**Verify the connection:**
1. Go to your Facebook Page
2. Click **Settings** → **Instagram**
3. You should see your Instagram account listed

⚠️ **Critical:** If this connection isn't set up correctly, the API won't work.

---

### Facebook App & Token Setup

#### Step 1: Create Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Choose **Business** as app type
4. Fill in:
   - **App Name**: e.g., "Instagram Auto Poster"
   - **App Contact Email**: Your email
5. Click **Create App**

#### Step 2: Configure Instagram API

1. In your app dashboard, go to **Use cases** (left sidebar)
2. Find **"Manage messaging & content on Instagram"**
3. Click **Customize**
4. Follow the setup wizard

#### Step 3: Add App Permissions

1. In the Instagram API setup, go to **Permissions and features**
2. Make sure these are enabled:
   - ✅ `instagram_basic`
   - ✅ `instagram_business_basic`
   - ✅ `instagram_content_publish` ← **CRITICAL!**
   - ✅ `instagram_business_content_publish`
3. All should show "Ready for testing"

#### Step 4: Add Yourself as Tester

1. Left sidebar → **Roles** → **Roles**
2. Go to **Testers** section
3. Click **Add Testers**
4. Search for your Facebook account
5. Add yourself
6. **Check your Facebook notifications** and accept the invitation

---

### Getting Your Credentials

You need two pieces of information:
1. **Instagram User ID** (numeric ID)
2. **Facebook Page Access Token** (starts with EAAT)

#### Get Instagram User ID

##### Method 1: Using Graph API Explorer

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app (top-right dropdown)
3. In the query field, enter: `me/accounts?fields=id,name,instagram_business_account`
4. Click **Submit**
5. Look for `instagram_business_account` → `id` in the response:

```json
{
  "data": [
    {
      "instagram_business_account": {
        "id": "17841404255523928"  ← This is your INSTAGRAM_USER_ID
      },
      "id": "873195522546343",
      "name": "Your Page Name"
    }
  ]
}
```

##### Method 2: Using API Directly

```bash
# First get your Page ID
curl "https://graph.facebook.com/v19.0/me/accounts?access_token=YOUR_USER_TOKEN"

# Then get Instagram Business Account ID
curl "https://graph.facebook.com/v19.0/PAGE_ID?fields=instagram_business_account&access_token=YOUR_USER_TOKEN"
```

---

#### Get Facebook Page Access Token (CRITICAL STEP)

⚠️ **Common Mistake:** Many people try to use an Instagram token (starts with `IGAA`). This will **NOT work**. You need a **Facebook Page token** (starts with `EAAT`).

##### Step-by-Step Using Graph API Explorer

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)

2. **Select Your App** (top-right dropdown)

3. **Switch to Page Token:**
   - Look at the right sidebar
   - Under **"User or Page"**, click the dropdown
   - **Select your Facebook Page** (not "User Token")

4. **Add Instagram Permissions:**
   - Click **"Add a Permission"**
   - Search and add these permissions:
     - `instagram_basic`
     - `instagram_content_publish` ← **MUST HAVE!**
     - `instagram_manage_comments` (optional)
     - `pages_read_engagement`
     - `pages_show_list`

5. **Generate Token:**
   - Click **"Generate Access Token"**
   - Authorize all permissions when prompted
   - Copy the token (starts with `EAAT`)

6. **Verify Token Type:**
   - Click the **(i)** icon next to the token
   - Should show:
     - **Page**: Your page name (not "User: Your name")
     - **Scopes**: Should include `instagram_content_publish`

✅ This is the correct token!

---

#### Exchange for Long-Lived Token (60 Days)

Short-lived tokens expire in ~1 hour. Get a 60-day token:

1. Get your App ID and App Secret:
   - Go to your app → **Settings** → **Basic**
   - Copy **App ID** and **App Secret**

2. Run this command (replace placeholders):

```bash
curl "https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_LIVED_EAAT_TOKEN"
```

3. Response:

```json
{
  "access_token": "EAATxxxxxxxxxxxxxxxx...",
  "token_type": "bearer",
  "expires_in": 5183944
}
```

Use this long-lived token in your `.env` file.

---

#### Provide Credentials to Developer

Send these two values to your developer:

```
INSTAGRAM_USER_ID=17841404255523928
INSTAGRAM_ACCESS_TOKEN=EAATxxxxxxxxxxxxxxxxxxxxxxxx
```

**Security Note:** The access token is sensitive. Send it securely (encrypted email, password manager, etc.).

---

## Testing Your Setup

### Step 1: Verify Configuration

```bash
npm run verify
```

All items should show ✅

### Step 2: Test AWS Credentials

```bash
cd "/path/to/instagram-poster"
./check-aws.sh
```

Should show: `✅ AWS credentials are valid!`

### Step 3: Test Instagram Token

```bash
./check-token.sh
```

Should show: `✅ Token is valid!`

### Step 4: Start the Server

```bash
npm run dev
```

Expected output:
```
Server listening on http://0.0.0.0:3000
Available routes:
  POST /publish-instagram - Publish image to Instagram
  GET  /health - Health check
```

### Step 5: Test Health Endpoint

In a new terminal:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-12-10T..."}
```

### Step 6: Make Your First Post!

```bash
curl -X POST http://localhost:3000/publish-instagram \
  -H "Content-Type: application/json" \
  -d '{
    "image_path": "/absolute/path/to/your/image.jpg",
    "caption": "My first automated Instagram post! 🚀 #automation"
  }'
```

**What happens:**
1. Server validates the request (1 second)
2. Uploads image to S3 (2-5 seconds)
3. Creates Instagram media container (2-3 seconds)
4. Waits for Instagram to process the image (10-30 seconds)
5. Publishes the post (2-3 seconds)

**Total time:** 15-45 seconds

**Expected response:**

```json
{
  "status": "success",
  "uploaded_image_url": "https://your-bucket.s3.amazonaws.com/instagram/1733854123456-image.jpg",
  "instagram_response": {
    "id": "17895695668004550"
  }
}
```

✅ **Check your Instagram** - the post should be live!

---

## Troubleshooting

### AWS Issues

#### "InvalidAccessKeyId: The AWS Access Key Id you provided does not exist"

**Solutions:**
1. Verify the Access Key ID is correct in `.env`
2. Check the IAM user still exists in AWS Console
3. Make sure the access key is **Active** (not Inactive)
4. Regenerate access keys if needed

#### "AccessControlListNotSupported: The bucket does not allow ACLs"

**Solution:** This should be fixed in the code (we removed ACL from uploads). If you see this:
1. Make sure you're running the latest code
2. Verify `src/services/imageUploader.ts` does NOT have `ACL: 'public-read'` in the upload params
3. Ensure your bucket policy allows public read access

#### Images upload but are not accessible

**Solution:**
1. Check bucket policy allows `s3:GetObject` for `instagram/*` path
2. Verify Block Public Access settings allow public access
3. Test URL directly in browser

---

### Instagram API Issues

#### "Invalid OAuth access token - Cannot parse access token"

**Cause:** Using wrong token type or expired token.

**Solutions:**
1. **Check token type:** Must start with `EAAT` (Facebook Page token), not `IGAA` (Instagram token)
2. **Verify in Graph API Explorer:**
   - Token Info should show **Page**, not **User**
   - Must have `instagram_content_publish` permission
3. **Token expired:** Generate a new long-lived token
4. **Check for typos:** No spaces, quotes, or extra characters in `.env`

#### "Unsupported request - Method type: get"

**Cause:** Using User token instead of Page token.

**Solution:** Follow the token generation steps again, making sure to select your **Facebook Page** in Graph API Explorer.

#### "#100 The parameter image_url is required"

**Cause:** S3 upload failed or returned invalid URL.

**Solution:**
1. Check S3 credentials are correct
2. Verify bucket name in `.env` matches actual bucket
3. Check server logs for S3 upload errors

#### "Container status: ERROR"

**Cause:** Instagram can't access or process the image.

**Solutions:**
1. **Check image is publicly accessible:** Open the S3 URL in an incognito browser
2. **Verify image format:** JPG, PNG only (no GIF for feed posts)
3. **Check image size:** Must be under 8MB
4. **Verify image dimensions:** Minimum 320px, recommended 1080px square or 1080x1350 portrait

#### "Instagram account not found" or "Account is not a business account"

**Solution:**
1. Verify Instagram account is Business or Creator type
2. Ensure Instagram is connected to the Facebook Page
3. Check connection in Instagram app → Settings → Account Center
4. Wait a few minutes after connecting, then try again

---

### Connection Issues

#### Can't connect Instagram to Facebook Page

**Solutions:**
1. Make sure the Instagram account is Business/Creator type (not Personal)
2. Try connecting from both Instagram app AND Facebook Page settings
3. Use the same Facebook account that owns the Page
4. Disconnect and reconnect if already connected
5. Try on mobile app (more reliable than web)

#### "Insufficient Developer Role"

**Solution:**
1. Add yourself as a Tester in the Facebook App
2. Go to App Dashboard → Roles → Roles → Testers
3. Accept the invitation in Facebook notifications
4. Wait a few minutes, then try generating token again

---

### Token Renewal

Tokens expire after 60 days. Set a reminder to renew:

1. Go to Graph API Explorer
2. Select your Page
3. Generate new token with same permissions
4. Exchange for long-lived token
5. Update `.env` file
6. Restart server

**Automation tip:** Store token expiration date and set up a monitoring alert.

---

## Best Practices

### For Developers

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Use environment-specific configurations** - Separate dev/prod credentials
3. **Monitor token expiration** - Set up alerts for token renewal
4. **Log errors properly** - Use the logger utility for debugging
5. **Test in development first** - Use a test Instagram account
6. **Keep dependencies updated** - Regularly run `npm audit` and `npm update`

### For End Users

1. **Keep token secure** - Don't share publicly
2. **Use strong App Secret** - Treat it like a password
3. **Review permissions regularly** - Remove unnecessary permissions
4. **Monitor posts** - Set up Instagram notifications
5. **Test images first** - Verify format and size before automating
6. **Renew tokens on time** - Set calendar reminder for 50 days

---

## Production Deployment

When deploying to production:

1. **Use environment variables** - Don't hardcode credentials
2. **Enable HTTPS** - Use SSL certificates
3. **Add rate limiting** - Prevent API abuse
4. **Set up monitoring** - Track errors and performance
5. **Use Process Manager** - pm2 or similar for Node.js
6. **Configure firewall** - Restrict access to API endpoints
7. **Set up logging** - CloudWatch, DataDog, or similar
8. **Enable CORS** - If serving web clients
9. **Add authentication** - Protect the API endpoint
10. **Document API** - Create Swagger/OpenAPI docs

---

## Support & Resources

- **Instagram Graph API Docs**: https://developers.facebook.com/docs/instagram-api
- **AWS S3 Documentation**: https://docs.aws.amazon.com/s3/
- **Graph API Explorer**: https://developers.facebook.com/tools/explorer/
- **Facebook App Dashboard**: https://developers.facebook.com/apps/

For project-specific issues, check the README.md and existing documentation.

---

## Summary Checklist

### Developer Setup
- [ ] Node.js >= 18 installed
- [ ] Dependencies installed (`npm install`)
- [ ] AWS S3 bucket created
- [ ] Bucket policy configured for public read
- [ ] IAM user created with S3 permissions
- [ ] AWS credentials in `.env`
- [ ] Verification passed (`npm run verify`)

### Customer/End User Setup
- [ ] Instagram converted to Business/Creator account
- [ ] Facebook Page created
- [ ] Instagram connected to Facebook Page
- [ ] Facebook App created
- [ ] App permissions configured
- [ ] Added as App Tester
- [ ] Instagram User ID obtained
- [ ] Facebook Page token generated (starts with EAAT)
- [ ] Token exchanged for long-lived version
- [ ] Credentials provided to developer

### Testing
- [ ] `npm run verify` shows all green
- [ ] `./check-aws.sh` succeeds
- [ ] `./check-token.sh` succeeds
- [ ] Server starts without errors
- [ ] Health endpoint responds
- [ ] First test post succeeds
- [ ] Post visible on Instagram

---

**Congratulations! Your Instagram Auto-Poster is fully configured and ready to use! 🎉**

