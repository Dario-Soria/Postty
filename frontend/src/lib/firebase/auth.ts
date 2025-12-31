import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  UserCredential,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  sendEmailVerification,
} from "firebase/auth";
import { getFirebaseAuth } from "./config";

/**
 * Set authentication persistence based on "Remember Me" preference
 */
async function setAuthPersistence(rememberMe: boolean = true): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence
    );
  } catch (error) {
    console.error("Error setting persistence:", error);
  }
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(
  rememberMe: boolean = true
): Promise<UserCredential> {
  await setAuthPersistence(rememberMe);
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });
  return signInWithPopup(auth, provider);
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
  rememberMe: boolean = true
): Promise<UserCredential> {
  await setAuthPersistence(rememberMe);
  const auth = getFirebaseAuth();
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
  
  // Update profile with display name if provided
  if (displayName && userCredential.user) {
    await updateProfile(userCredential.user, { displayName });
  }
  
  // Send verification email automatically
  try {
    await sendEmailVerification(userCredential.user, {
      url: typeof window !== 'undefined' ? window.location.origin + '/v2' : 'http://localhost:3000/v2',
      handleCodeInApp: false,
    });
  } catch (error) {
    console.error("Error sending verification email:", error);
    // Don't throw - account is created, user can resend email later
  }
  
  return userCredential;
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string,
  rememberMe: boolean = true
): Promise<UserCredential> {
  await setAuthPersistence(rememberMe);
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  return firebaseSignOut(auth);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  isValid: boolean;
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasNumber: boolean;
    hasSpecialChar: boolean;
  };
} {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  return {
    isValid: Object.values(checks).every(Boolean),
    checks,
  };
}

/**
 * Check if email is a Gmail address
 */
export function isGmailAddress(email: string): boolean {
  return email.toLowerCase().endsWith("@gmail.com");
}

/**
 * Send email verification to current user
 */
export async function sendVerificationEmail(): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("No user is currently signed in");
  }
  
  if (user.emailVerified) {
    throw new Error("Email is already verified");
  }

  try {
    await sendEmailVerification(user, {
      url: typeof window !== 'undefined' ? window.location.origin + '/v2' : 'http://localhost:3000/v2',
      handleCodeInApp: false,
    });
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw error;
  }
}

/**
 * Check if user's email is verified
 */
export function isEmailVerified(): boolean {
  const auth = getFirebaseAuth();
  return auth.currentUser?.emailVerified || false;
}

/**
 * Reload user to get latest email verification status
 */
export async function reloadUser(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) {
    await auth.currentUser.reload();
  }
}
