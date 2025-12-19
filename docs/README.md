# Documentation Index

This directory contains technical documentation for the Instagram Auto-Poster project.

## Documentation Overview

### For Getting Started

| Document | Audience | Purpose |
|----------|----------|---------|
| [../README.md](../README.md) | Everyone | Project overview, features, and quick start |
| [../SETUP_GUIDE.md](../SETUP_GUIDE.md) | Developers & End Users | Complete setup instructions from scratch |
| [../CUSTOMER_SETUP.md](../CUSTOMER_SETUP.md) | End Users/Customers | Simplified, non-technical setup guide |
| [../QUICK_REFERENCE.md](../QUICK_REFERENCE.md) | Developers | Quick commands and daily usage reference |

### Technical Documentation

| Document | Purpose |
|----------|---------|
| [context.md](context.md) | Project architecture, design decisions, and Cursor AI guidance |
| [LESSONS_LEARNED.md](LESSONS_LEARNED.md) | Issues encountered, solutions, and technical insights |

## When to Use Each Document

### Setting Up for the First Time?

1. **Developers:** Start with [SETUP_GUIDE.md](../SETUP_GUIDE.md) (Developer section)
2. **End Users:** Start with [CUSTOMER_SETUP.md](../CUSTOMER_SETUP.md)

### Running the Service Daily?

Use [QUICK_REFERENCE.md](../QUICK_REFERENCE.md) for commands and common tasks

### Troubleshooting Issues?

1. Check [README.md](../README.md) → Troubleshooting section
2. Review [LESSONS_LEARNED.md](LESSONS_LEARNED.md) for detailed issue analysis
3. Check [SETUP_GUIDE.md](../SETUP_GUIDE.md) → Troubleshooting section

### Understanding the Architecture?

Read [context.md](context.md) for design decisions and project structure

### Onboarding New Customers?

Give them [CUSTOMER_SETUP.md](../CUSTOMER_SETUP.md) - it's written in non-technical language with time estimates

## Key Concepts Explained

### Token Types

The project requires a **Facebook Page Access Token** (starts with `EAAT`), not an Instagram token (starts with `IGAA`).

- ✅ Use: Facebook Page Token (EAAT) - for Instagram Graph API
- ❌ Don't use: Instagram Token (IGAA) - for Instagram Basic Display API only

See [LESSONS_LEARNED.md](LESSONS_LEARNED.md#1-wrong-token-type-most-common-issue) for detailed explanation.

### AWS S3 Setup

The service uses AWS S3 to temporarily host images before Instagram fetches them. The setup requires:

- S3 bucket with bucket policy (not ACLs) for public read access
- IAM user with S3 upload permissions
- Proper credentials in `.env` file

See [SETUP_GUIDE.md](../SETUP_GUIDE.md#aws-s3-setup) for step-by-step instructions.

### Instagram Business Account Requirements

Instagram Business or Creator account must be:
1. Converted from personal account
2. Connected to a Facebook Page
3. Linked through Facebook's Account Center

See [CUSTOMER_SETUP.md](../CUSTOMER_SETUP.md#step-3-connect-instagram-to-facebook-page) for user-friendly instructions.

## Common Issues & Quick Fixes

### "Invalid OAuth access token"

**Quick Fix:** You're using the wrong token type. Get a Facebook Page token (EAAT) from Graph API Explorer.

See: [LESSONS_LEARNED.md](LESSONS_LEARNED.md#1-wrong-token-type-most-common-issue)

### "AccessControlListNotSupported"

**Quick Fix:** Already fixed in code. Update to latest version.

See: [LESSONS_LEARNED.md](LESSONS_LEARNED.md#2-s3-acl-not-supported)

### "instagram_business_account not found"

**Quick Fix:** Instagram isn't connected to Facebook Page. Reconnect in Instagram settings.

See: [LESSONS_LEARNED.md](LESSONS_LEARNED.md#3-instagram-account-not-connected-to-facebook-page)

## Verification Tools

The project includes helpful verification scripts:

```bash
# Check all environment variables
npm run verify

# Test AWS credentials
./check-aws.sh

# Test Instagram token
./check-token.sh
```

See [QUICK_REFERENCE.md](../QUICK_REFERENCE.md#verification-commands) for details.

## Contributing to Documentation

When updating documentation:

1. **Keep it simple:** Use clear, non-technical language where possible
2. **Add examples:** Show actual commands and expected outputs
3. **Document errors:** Include error messages and solutions
4. **Update all relevant docs:** Changes may affect multiple files
5. **Test instructions:** Follow your own instructions to verify they work

## Documentation Maintenance

### When to Update

- **New feature added:** Update README.md and QUICK_REFERENCE.md
- **Bug fixed:** Add to LESSONS_LEARNED.md
- **Setup process changed:** Update SETUP_GUIDE.md and CUSTOMER_SETUP.md
- **New error discovered:** Add to troubleshooting sections
- **Architecture decision:** Document in context.md

### Keeping Documentation Current

- Review quarterly for outdated information
- Update API versions and links
- Verify external links still work
- Check screenshots are current (if added in future)
- Update token expiration guidelines

## Support Resources

- **Instagram Graph API:** https://developers.facebook.com/docs/instagram-api
- **AWS S3 Documentation:** https://docs.aws.amazon.com/s3/
- **Graph API Explorer:** https://developers.facebook.com/tools/explorer/
- **Facebook Developers:** https://developers.facebook.com/

---

**Last Updated:** December 2024  
**Documentation Version:** 1.0  
**Based on:** Real-world setup and troubleshooting experience

