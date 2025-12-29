# Quick Start: Firebase Authentication

## 🚀 Get Started in 3 Steps

### Step 1: Set Up Firebase (5 minutes)

1. **Create Firebase Project**
   - Go to https://console.firebase.google.com
   - Click "Create a project"
   - Name it "Postty" and follow the wizard

2. **Add Web App**
   - Click the Web icon (`</>`)
   - Register app nickname: "Postty Web App"
   - Copy the config values

3. **Enable Authentication**
   - Go to **Authentication** → **Sign-in method**
   - Enable **Email/Password**
   - Enable **Google**
   - Choose support email

4. **Create Firestore Database**
   - Go to **Firestore Database**
   - Click "Create database"
   - Choose "Production mode"
   - Select your region

5. **Add Security Rules**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

### Step 2: Configure Environment Variables (1 minute)

1. Copy the example file:
   ```bash
   cd frontend
   cp .env.example .env.local
   ```

2. Edit `.env.local` and paste your Firebase config:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

### Step 3: Run the App (30 seconds)

```bash
cd frontend
npm run dev
```

Visit http://localhost:3000/v2 and test it out! 🎉

## 🧪 Quick Test

1. **Click "Registrarme"** → Create account with email/password
2. **Or click Google icon** → Sign in with Google
3. **See your profile picture** in top-right corner
4. **Click profile** → Open menu
5. **Click "Cerrar sesión"** → Sign out

## 📚 Full Documentation

- **Setup Guide**: See `FIREBASE_SETUP.md` for detailed instructions
- **Implementation Details**: See `AUTHENTICATION_IMPLEMENTATION.md` for technical details

## ⚠️ Important Notes

- **Never commit `.env.local`** - it's already in `.gitignore`
- **Restart dev server** after creating `.env.local`
- **Check browser console** if you see errors

## 🔍 Troubleshooting

**"Configuration not found" error?**
- Make sure `.env.local` exists and has all variables
- Restart the dev server

**"Unauthorized domain" error?**
- Go to Firebase Console → Authentication → Settings → Authorized domains
- Make sure `localhost` is listed

**Users not showing in Firestore?**
- This is normal - check after first sign-in
- Documents are created automatically

## 🎯 What You Get

✅ Google OAuth sign-in  
✅ Email/password authentication  
✅ Gmail detection (auto-redirects to Google)  
✅ Password strength validation  
✅ User profile menu with avatar  
✅ Protected routes  
✅ Firestore user data storage  
✅ Beautiful UI matching your design  

## 🚧 TODO (Future)

- [ ] Implement "My references" page
- [ ] Implement "My brand" page
- [ ] Implement "My posts" page
- [ ] Add password reset
- [ ] Add email verification

---

**Ready to authenticate users!** 🔐

