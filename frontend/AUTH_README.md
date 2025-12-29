# Firebase Authentication System

Complete authentication system for Postty v4.0 with Google OAuth and email/password authentication.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Components](#components)
5. [Setup Instructions](#setup-instructions)
6. [Usage Examples](#usage-examples)
7. [Security](#security)
8. [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

**TL;DR**: Set up Firebase, add credentials to `.env.local`, run `npm run dev`

👉 See [QUICKSTART_AUTH.md](./QUICKSTART_AUTH.md) for fastest setup  
👉 See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for detailed instructions  
👉 See [AUTHENTICATION_IMPLEMENTATION.md](./AUTHENTICATION_IMPLEMENTATION.md) for technical details

## ✨ Features

### Authentication Methods
- ✅ **Google OAuth** - One-click sign-in with Google
- ✅ **Email/Password** - Traditional authentication
- ✅ **Gmail Detection** - Auto-redirects Gmail users to Google OAuth
- ✅ **Password Validation** - Real-time strength checking

### User Experience
- ✅ **Beautiful Sign-Up Modal** - Glass-morphism design
- ✅ **User Profile Menu** - Avatar with dropdown
- ✅ **Route Protection** - Secure authenticated routes
- ✅ **Persistent Sessions** - Auth state survives page refresh
- ✅ **Loading States** - Smooth transitions
- ✅ **Error Handling** - User-friendly error messages

### Security
- ✅ **Firebase Authentication** - Industry-standard security
- ✅ **Firestore Security Rules** - User data protection
- ✅ **Environment Variables** - Secure credential storage
- ✅ **Password Requirements** - Strong password enforcement

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 16 + React 19
- **Authentication**: Firebase Auth
- **Database**: Firebase Firestore
- **Styling**: Tailwind CSS
- **UI Components**: Custom glass-morphism components

### File Structure
```
frontend/src/
├── lib/firebase/
│   ├── config.ts          # Firebase initialization
│   ├── auth.ts            # Auth functions
│   └── firestore.ts       # Database functions
├── contexts/
│   └── AuthContext.tsx    # Global auth state
└── app/v2/_components/
    ├── WelcomeScreen.tsx       # Login screen
    ├── SignUpModal.tsx         # Sign-up modal
    └── ui/
        └── UserProfileMenu.tsx # Profile menu
```

### Data Flow
```
User Action → Auth Function → Firebase → Firestore → AuthContext → UI Update
```

## 🧩 Components

### AuthContext
Global authentication state management.

```typescript
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { user, userProfile, loading, signOut } = useAuth();
  
  if (loading) return <Loading />;
  if (!user) return <Login />;
  
  return <Dashboard user={user} />;
}
```

### WelcomeScreen
Login interface with Google and email/password options.

```typescript
<WelcomeScreen 
  onContinue={() => setStep(2)} 
  showToast={showToast} 
/>
```

### SignUpModal
Modal for creating new accounts with Gmail detection.

```typescript
<SignUpModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onSuccess={handleSuccess}
  showToast={showToast}
/>
```

### UserProfileMenu
Profile avatar button with dropdown menu.

```typescript
<UserProfileMenu onSignOut={handleSignOut} />
```

## 📖 Setup Instructions

### Prerequisites
- Node.js 18+
- npm or yarn
- Firebase account

### Installation

1. **Install Dependencies** (already done):
   ```bash
   cd frontend
   npm install firebase
   ```

2. **Create Firebase Project**:
   - Go to https://console.firebase.google.com
   - Create new project
   - Enable Authentication (Email/Password + Google)
   - Create Firestore database
   - Get your config credentials

3. **Configure Environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Firebase credentials
   ```

4. **Run Development Server**:
   ```bash
   npm run dev
   ```

5. **Test**:
   - Visit http://localhost:3000/v2
   - Try signing up/in

### Firebase Console Setup

#### Authentication
1. Enable Email/Password provider
2. Enable Google provider
3. Add authorized domains (localhost, your domain)

#### Firestore
1. Create database in production mode
2. Add security rules:
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

## 💡 Usage Examples

### Check Authentication Status
```typescript
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Please login</div>;
  
  return <div>Welcome {user.displayName}!</div>;
}
```

### Sign In with Google
```typescript
import { signInWithGoogle } from '@/lib/firebase/auth';
import { createUserProfile } from '@/lib/firebase/firestore';

async function handleGoogleSignIn() {
  try {
    const result = await signInWithGoogle();
    await createUserProfile(result.user, 'google');
    console.log('Signed in:', result.user);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Sign Up with Email
```typescript
import { signUpWithEmail } from '@/lib/firebase/auth';
import { createUserProfile } from '@/lib/firebase/firestore';

async function handleEmailSignUp(email: string, password: string) {
  try {
    const result = await signUpWithEmail(email, password, 'John Doe');
    await createUserProfile(result.user, 'email');
    console.log('Account created:', result.user);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Validate Password
```typescript
import { validatePassword } from '@/lib/firebase/auth';

const { isValid, checks } = validatePassword('MyPass123!');
console.log('Valid:', isValid);
console.log('Has uppercase:', checks.hasUppercase);
console.log('Has number:', checks.hasNumber);
```

### Sign Out
```typescript
import { useAuth } from '@/contexts/AuthContext';

function SignOutButton() {
  const { signOut } = useAuth();
  
  return (
    <button onClick={signOut}>
      Sign Out
    </button>
  );
}
```

## 🔒 Security

### Best Practices Implemented
- ✅ Environment variables for credentials
- ✅ Firestore security rules
- ✅ Password strength validation
- ✅ Firebase built-in security
- ✅ No credentials in source code

### Recommendations for Production
- 🔲 Add email verification
- 🔲 Implement password reset
- 🔲 Add rate limiting
- 🔲 Enable two-factor authentication
- 🔲 Set up monitoring and alerts
- 🔲 Regular security audits

### Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Future: Add rules for references, brand, posts
    // match /references/{refId} {
    //   allow read, write: if request.auth != null;
    // }
  }
}
```

## 🐛 Troubleshooting

### Common Issues

#### 1. "Configuration not found" Error
**Problem**: Firebase credentials not loaded  
**Solution**: 
- Check that `.env.local` exists
- Verify all variables are set
- Restart dev server

#### 2. "Unauthorized domain" Error
**Problem**: Current domain not authorized  
**Solution**:
- Firebase Console → Authentication → Settings → Authorized domains
- Add `localhost` and your production domain

#### 3. Users Not Appearing in Firestore
**Problem**: Database not updating  
**Solution**:
- Check browser console for errors
- Verify Firestore security rules
- Make sure `createUserProfile()` is called after sign-in

#### 4. "Popup closed by user"
**Problem**: User closed Google OAuth popup  
**Solution**: This is normal user behavior, no fix needed

#### 5. TypeScript Errors
**Problem**: Import errors or type issues  
**Solution**:
- Make sure all files are created
- Restart TypeScript server in VS Code
- Check import paths use `@/` alias

### Debug Checklist
- [ ] `.env.local` file exists
- [ ] All Firebase credentials are set
- [ ] Dev server restarted after `.env.local` creation
- [ ] Firebase Authentication enabled
- [ ] Google provider configured
- [ ] Firestore database created
- [ ] Security rules published
- [ ] Authorized domains configured
- [ ] Browser console checked for errors

## 📊 Database Structure

### Users Collection
```typescript
users/{userId}
  ├── email: string
  ├── displayName: string | null
  ├── photoURL: string | null
  ├── provider: 'google' | 'email'
  ├── createdAt: Timestamp
  ├── references: []      // Placeholder
  ├── brand: {}          // Placeholder
  └── posts: []          // Placeholder
```

### Future Collections (To Be Implemented)
```
references/{refId}
  └── userId: string
  └── images: []
  └── ...

brand/{userId}
  └── colors: []
  └── fonts: []
  └── ...

posts/{postId}
  └── userId: string
  └── imageUrl: string
  └── ...
```

## 🎨 Design System

All components follow your existing design:

### Colors
- Background: Radial gradients (peach, purple, blue)
- Glass: White with 55% opacity + backdrop blur
- Text: Slate-900 for primary, Slate-700 for secondary
- Accent: Sky-400, Cyan-400, Emerald-400 gradient

### Components
- **GlassCard**: Frosted glass effect containers
- **GradientButton**: Colorful gradient buttons
- **Inputs**: Rounded-full with glass effect
- **Shadows**: Soft, elevated (0_12px_35px)
- **Borders**: White with 70% opacity

### Typography
- Headers: Font-black, tracking-tight
- Body: Font-medium, text-base/lg
- Buttons: Font-semibold

## 🧪 Testing

### Manual Testing Checklist
- [ ] Sign up with email/password
- [ ] Sign in with email/password
- [ ] Sign in with Google
- [ ] Gmail detection works
- [ ] Can cancel Gmail redirect
- [ ] Password validation shows errors
- [ ] Profile menu opens
- [ ] Profile picture displays
- [ ] Sign out works
- [ ] Auth persists on refresh
- [ ] Route protection works
- [ ] Error messages are friendly

### Test Users
Create test users in Firebase Console → Authentication:
1. Email user: `test@example.com` / `TestPass123!`
2. Google user: Use your Google account

## 🚀 Next Steps

### Immediate
1. ✅ Set up Firebase (see FIREBASE_SETUP.md)
2. ✅ Configure .env.local
3. ✅ Test authentication flows

### Short Term
1. Implement "My references" page
2. Implement "My brand" page
3. Implement "My posts" page
4. Add password reset flow
5. Add email verification

### Long Term
1. Advanced profile management
2. Social media integrations
3. Analytics dashboard
4. Admin panel
5. Multi-tenancy support

## 📚 Resources

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)

## 🤝 Support

For issues or questions:
1. Check this documentation
2. Review browser console
3. Check Firebase Console logs
4. Review the implementation files

## 📝 License

Part of Postty v4.0 project.

---

**Authentication system ready to use!** 🎉

Start with [QUICKSTART_AUTH.md](./QUICKSTART_AUTH.md) to get up and running in minutes.

