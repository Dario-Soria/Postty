# Firebase Authentication Setup Guide

This guide will walk you through setting up Firebase Authentication for your Postty v4.0 application.

## Prerequisites

- A Google account
- Node.js and npm installed
- The Postty v4.0 frontend project

## Step 1: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com)
2. Click "Add project" or "Create a project"
3. Enter a project name (e.g., "Postty")
4. (Optional) Enable Google Analytics
5. Click "Create project"

## Step 2: Register Your Web App

1. In your Firebase project dashboard, click the **Web** icon (`</>`) to add a web app
2. Enter an app nickname (e.g., "Postty Web App")
3. **Do NOT** check "Also set up Firebase Hosting" (unless you want to)
4. Click "Register app"
5. You'll see your Firebase configuration object - **keep this page open**, you'll need these values

## Step 3: Enable Authentication Providers

### Enable Email/Password Authentication

1. In the Firebase Console, go to **Authentication** → **Sign-in method**
2. Click on **Email/Password**
3. Toggle **Enable** to ON
4. Click **Save**

### Enable Google Authentication

1. In the same **Sign-in method** page, click on **Google**
2. Toggle **Enable** to ON
3. Select a **Project support email** from the dropdown
4. Click **Save**

### Configure Authorized Domains (Important!)

1. In **Authentication** → **Settings** → **Authorized domains**
2. Make sure `localhost` is in the list (it should be by default)
3. When you deploy, add your production domain here

## Step 4: Set Up Firestore Database

1. In the Firebase Console, go to **Firestore Database**
2. Click **Create database**
3. Select **Start in production mode** (we'll add security rules next)
4. Choose a Cloud Firestore location (pick one closest to your users)
5. Click **Enable**

### Add Security Rules

1. Go to **Firestore Database** → **Rules**
2. Replace the existing rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read and write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Click **Publish**

## Step 5: Configure Your Frontend Application

### Create Environment File

1. In the `frontend` directory, copy the example file:
   ```bash
   cd frontend
   cp .env.example .env.local
   ```

2. Open `.env.local` and add your Firebase credentials from Step 2:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here
```

**Important:** 
- Never commit `.env.local` to version control
- The `.env.example` file is safe to commit (it has placeholders)

## Step 6: Install Dependencies & Run

If you haven't already installed the Firebase SDK:

```bash
cd frontend
npm install
```

Start the development server:

```bash
npm run dev
```

Visit `http://localhost:3000/v2` to see your authentication in action!

## Testing Your Setup

### Test Email/Password Sign-Up

1. Go to the welcome screen
2. Click "Registrarme" (Sign Up)
3. Enter a name, email, and password (must meet requirements)
4. Click "Crear cuenta"
5. Check Firebase Console → Authentication → Users to see the new user

### Test Gmail Detection

1. Click "Registrarme"
2. Enter an email ending in `@gmail.com`
3. Watch as it detects Gmail and offers to redirect to Google OAuth

### Test Google Sign-In

1. Click the Google icon on the welcome screen
2. Select your Google account
3. Grant permissions
4. You should be logged in and see the user profile menu

### Test User Profile Menu

1. After logging in, look for your profile picture in the top-right corner
2. Click it to open the dropdown menu
3. You should see:
   - My references
   - My brand
   - My posts
   - Sign out

### Test Sign Out

1. Click "Cerrar sesión" (Sign Out) in the profile menu
2. You should return to the welcome screen
3. Check that you're no longer authenticated

## Troubleshooting

### Error: "Firebase: Error (auth/popup-closed-by-user)"

This is normal - the user closed the Google sign-in popup. No action needed.

### Error: "Firebase: Error (auth/configuration-not-found)"

Check that you've:
1. Created the `.env.local` file
2. Added all the Firebase credentials correctly
3. Restarted the dev server after creating `.env.local`

### Error: "Firebase: Error (auth/unauthorized-domain)"

1. Go to Firebase Console → Authentication → Settings → Authorized domains
2. Add your domain (e.g., `localhost` for development)

### Users Not Showing in Firestore

This is expected on first sign-in. The Firestore document is created automatically when:
1. The user signs in for the first time
2. The `createUserProfile` function is called

Check the browser console for any errors.

### "Permission Denied" Errors in Firestore

Make sure you've set up the security rules correctly (Step 4).

## Database Structure

Your Firestore database will have this structure:

```
users (collection)
  └── {userId} (document)
      ├── email: string
      ├── displayName: string | null
      ├── photoURL: string | null
      ├── provider: "google" | "email"
      ├── createdAt: timestamp
      ├── references: [] (placeholder for future)
      ├── brand: {} (placeholder for future)
      └── posts: [] (placeholder for future)
```

## Next Steps

Now that authentication is set up, you can:

1. Implement the "My references" page
2. Implement the "My brand" page
3. Implement the "My posts" page
4. Add password reset functionality
5. Add email verification
6. Add profile editing

## Security Best Practices

1. ✅ Never commit `.env.local` to version control
2. ✅ Use environment variables for all Firebase credentials
3. ✅ Keep your Firestore security rules strict
4. ✅ Validate user input on both client and server
5. ✅ Use Firebase's built-in security features
6. 🔒 Consider adding rate limiting for authentication attempts
7. 🔒 Consider adding email verification before allowing full access
8. 🔒 Regularly review your Firebase Console security settings

## Support

If you encounter issues:

1. Check the browser console for error messages
2. Check the Firebase Console for authentication/database errors
3. Review the [Firebase Documentation](https://firebase.google.com/docs)
4. Check that all environment variables are set correctly

## Files Modified/Created

### Created Files
- `frontend/src/lib/firebase/config.ts` - Firebase initialization
- `frontend/src/lib/firebase/auth.ts` - Authentication helpers
- `frontend/src/lib/firebase/firestore.ts` - Firestore helpers
- `frontend/src/contexts/AuthContext.tsx` - Auth state management
- `frontend/src/app/v2/_components/SignUpModal.tsx` - Sign-up modal
- `frontend/src/app/v2/_components/ui/UserProfileMenu.tsx` - User profile menu
- `frontend/.env.example` - Environment variables template

### Modified Files
- `frontend/src/app/providers.tsx` - Added AuthProvider
- `frontend/src/app/v2/_components/WelcomeScreen.tsx` - Added authentication
- `frontend/src/app/v2/page.tsx` - Added route protection and profile menu

---

**Congratulations!** 🎉 Your Firebase Authentication is now set up and ready to use!

