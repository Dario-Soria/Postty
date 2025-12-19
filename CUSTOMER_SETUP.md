# Customer Setup Guide - Instagram Auto-Poster

**For End Users:** This guide helps you set up your Instagram account and get the credentials needed for the Instagram Auto-Poster service.

---

## What You'll Need

At the end of this process, you'll provide two pieces of information:

1. **Instagram User ID** - A numeric ID for your Instagram Business account
2. **Access Token** - A secure code that allows posting to your account

---

## Step 1: Convert to Instagram Business Account

⏱️ **Time:** 5 minutes

1. Open the **Instagram mobile app**
2. Tap your **Profile** picture (bottom right)
3. Tap the **☰ menu** (top right) → **Settings and privacy**
4. Tap **Account type and tools**
5. Tap **Switch to Professional Account**
6. Choose **Business** (or Creator if you prefer)
7. Follow the prompts to complete setup

✅ **Done!** Your account is now a Business account.

---

## Step 2: Create a Facebook Page

⏱️ **Time:** 3 minutes

**Why?** Instagram Business accounts must be linked to a Facebook Page for API access.

1. Go to [facebook.com/pages/create](https://www.facebook.com/pages/create)
2. Click **Create new Page**
3. Enter:
   - **Page name:** Your business/brand name
   - **Category:** Choose the closest match
   - **Bio:** Brief description (optional)
4. Click **Create Page**

✅ **Done!** You have a Facebook Page.

---

## Step 3: Connect Instagram to Facebook Page

⏱️ **Time:** 2 minutes

**Critical Step:** This connection is required for the API to work.

### Via Instagram App (Recommended):

1. Instagram app → **Profile** → **☰ Menu**
2. Tap **Settings and privacy** → **Account Center**
3. Tap **Accounts** → **Add accounts**
4. Select **Facebook** → Log in
5. **Important:** Select your **Facebook Page** (not your personal profile)
6. Complete the connection

### Verify It Worked:

1. Go to your Facebook Page (on computer or mobile)
2. Click **Settings** → **Instagram**
3. You should see your Instagram username listed

✅ **Done!** Your Instagram is connected to your Facebook Page.

---

## Step 4: Create a Facebook App

⏱️ **Time:** 5 minutes

**Why?** You need an app to generate access tokens for API access.

1. Go to [developers.facebook.com](https://developers.facebook.com/)
2. Log in with your Facebook account
3. Click **My Apps** (top right) → **Create App**
4. Choose **Business** as the app type
5. Fill in:
   - **App Name:** "Instagram Auto Poster" (or any name you like)
   - **Contact Email:** Your email address
6. Click **Create App**
7. You might need to verify your identity

✅ **Done!** Your app is created.

---

## Step 5: Configure Instagram API

⏱️ **Time:** 5 minutes

1. In your app dashboard, find **Use cases** in the left sidebar
2. Look for **"Manage messaging & content on Instagram"**
3. Click **Customize**
4. Follow the setup wizard

### Add Permissions:

1. Click on **Permissions and features** (or similar)
2. Make sure these are enabled:
   - ✅ `instagram_content_publish` ← **MUST HAVE!**
   - ✅ `instagram_basic`
3. They should show "Ready for testing"

✅ **Done!** Instagram API is configured.

---

## Step 6: Add Yourself as App Tester

⏱️ **Time:** 2 minutes

1. In your app dashboard, find **Roles** in the left sidebar
2. Click **Roles** → **Testers** section
3. Click **Add Testers**
4. Search for your name (your Facebook account)
5. Add yourself
6. **Check your Facebook notifications** and accept the invitation

✅ **Done!** You can now test the app.

---

## Step 7: Get Your Instagram User ID

⏱️ **Time:** 3 minutes

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app from the dropdown (top right)
3. In the query box, paste:
   ```
   me/accounts?fields=id,name,instagram_business_account
   ```
4. Click **Submit**
5. Look for `instagram_business_account` in the response:
   ```json
   {
     "instagram_business_account": {
       "id": "17841404255523928"  ← THIS IS YOUR INSTAGRAM USER ID
     }
   }
   ```

📝 **Copy this number** - this is your `INSTAGRAM_USER_ID`

**Can't see instagram_business_account?**
- Your Instagram isn't connected to your Facebook Page
- Go back to Step 3 and ensure the connection is complete
- Wait a few minutes and try again

---

## Step 8: Get Your Access Token

⏱️ **Time:** 5 minutes

**⚠️ Important:** You need a **Facebook Page Token** (starts with `EAAT`), NOT an Instagram token.

### Generate the Token:

1. Stay in [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Make sure your app is selected (top right)
3. **Critical Step:** Look at the right sidebar
   - Under "User or Page", click the **dropdown**
   - **Select your Facebook Page name** (NOT "User Token")
4. Click **Permissions** (right sidebar)
5. Click **Add a Permission** and add:
   - `instagram_content_publish`
   - `instagram_basic`
   - `pages_read_engagement`
   - `pages_show_list`
6. Click **Generate Access Token**
7. Authorize when prompted (allow all permissions)
8. Copy the token from the "Access Token" box at the top

### Verify You Have the Right Token:

Click the **(i)** info icon next to your token. It should show:
- ✅ **Page:** [Your Page Name]
- ✅ **Scopes:** Should include `instagram_content_publish`

**Wrong?** If it shows "User: [Your Name]", go back and select your **Page** in step 3 above.

📝 **Copy this token** - this is your `INSTAGRAM_ACCESS_TOKEN`

**Important Notes:**
- ✅ Token should start with `EAAT`
- ❌ If it starts with `IGAA`, it's the wrong token type
- 🔒 Keep this token secure - it's like a password
- ⏰ This token expires in ~1 hour

---

## Step 9: Get a Long-Lived Token (Recommended)

⏱️ **Time:** 2 minutes

Short-lived tokens expire quickly. Let's get one that lasts 60 days.

### Option 1: Ask Your Developer

Send your short-lived token to your developer and ask them to exchange it for a long-lived token.

### Option 2: Do It Yourself

1. In your app dashboard, go to **Settings** → **Basic**
2. Copy your **App ID** and **App Secret** (click Show)
3. Run this command (replace the placeholders):

```bash
curl "https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_TOKEN"
```

4. You'll get a response with a new token - use this one instead

---

## Step 10: Provide Credentials to Your Developer

Send these two values to your developer:

```
INSTAGRAM_USER_ID=17841404255523928
INSTAGRAM_ACCESS_TOKEN=EAATxxxxxxxxxxxxxxxxxxxxxxxx
```

**How to send securely:**
- ✅ Encrypted email
- ✅ Password manager (1Password, LastPass)
- ✅ Secure messaging app (Signal)
- ❌ NOT plain text email
- ❌ NOT Slack/Teams message
- ❌ NOT SMS

---

## Troubleshooting

### Can't Find "Switch to Professional Account"

Your account might already be a Business account. Check:
- Settings → Account type and tools → Should show "Business" or "Creator"

### Can't See My Facebook Page in Graph API Explorer

Possible causes:
1. **Not logged in correctly:** Make sure you're logged into Facebook with the account that owns the Page
2. **Page doesn't exist:** Go create a Page at facebook.com/pages/create
3. **Not a Page admin:** Check your Page roles at your Page → Settings → Page roles

### Token Shows "User" Instead of "Page"

You didn't select your Page in Graph API Explorer:
1. Right sidebar → "User or Page" dropdown
2. Select your Page name from the list
3. Generate token again

### Can't Find instagram_business_account

Your Instagram isn't connected to your Facebook Page:
1. Instagram app → Settings → Account Center
2. Make sure Facebook is connected
3. Verify: Facebook Page → Settings → Instagram should show your account
4. Wait 5-10 minutes after connecting

### "Insufficient Developer Role" Error

You need to add yourself as a Tester:
1. App Dashboard → Roles → Add Testers
2. Accept the invitation in Facebook

---

## What Happens Next?

Once your developer has your credentials:

1. They'll configure the service with your credentials
2. They'll test that everything works
3. You'll be able to post to Instagram automatically!

**Your access token will expire in 60 days.** Set a reminder to renew it by repeating steps 8-9.

---

## Need Help?

Common questions:

**Q: Is this safe?**
A: Yes! You're giving access through Facebook's official API. You can revoke access anytime in your Facebook App settings.

**Q: Can the service delete my posts or access my DMs?**
A: No! It only has permission to create posts. It cannot delete, edit, or access messages.

**Q: What if I want to stop using the service?**
A: Go to your Facebook App dashboard and deactivate the app, or disconnect Instagram from your Facebook Page.

**Q: My token expired, how do I renew?**
A: Just repeat steps 8-9 to generate a new token and send it to your developer.

---

## Summary Checklist

- [ ] Instagram converted to Business account
- [ ] Facebook Page created
- [ ] Instagram connected to Facebook Page (verified!)
- [ ] Facebook App created
- [ ] Instagram API configured with permissions
- [ ] Added yourself as App Tester
- [ ] Got Instagram User ID (numeric, like 17841404255523928)
- [ ] Got Access Token (starts with EAAT)
- [ ] Exchanged for long-lived token (60 days)
- [ ] Sent credentials securely to developer
- [ ] Set reminder to renew token in 50 days

**All done? Great! Your developer can now complete the setup.** 🎉

---

**Questions?** Ask your developer or refer to the detailed [SETUP_GUIDE.md](SETUP_GUIDE.md)

