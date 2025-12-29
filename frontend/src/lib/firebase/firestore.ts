import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  DocumentData,
} from "firebase/firestore";
import { db } from "./config";
import { User } from "firebase/auth";

export interface UserProfile {
  email: string;
  displayName: string | null;
  photoURL: string | null;
  provider: "google" | "email";
  emailVerified?: boolean;
  createdAt: any;
  references?: any[];
  brand?: Record<string, any>;
  posts?: any[];
}

/**
 * Create or update user profile in Firestore
 */
export async function createUserProfile(
  user: User,
  provider: "google" | "email"
): Promise<void> {
  const userRef = doc(db, "users", user.uid);
  
  // Check if user already exists
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    // Create new user profile
    const userProfile: UserProfile = {
      email: user.email || "",
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      provider,
      emailVerified: user.emailVerified,
      createdAt: serverTimestamp(),
      references: [],
      brand: {},
      posts: [],
    };
    
    await setDoc(userRef, userProfile);
  } else {
    // Update existing user profile (in case of changes)
    await updateDoc(userRef, {
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      emailVerified: user.emailVerified,
    });
  }
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    return userSnap.data() as UserProfile;
  }
  
  return null;
}

/**
 * Update user profile in Firestore
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>
): Promise<void> {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, updates as DocumentData);
}

