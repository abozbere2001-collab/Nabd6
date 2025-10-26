
"use client";

import { 
  signOut as firebaseSignOut, 
  updateProfile,
  type User, 
  getAuth,
} from "firebase/auth";
import { doc, setDoc, getDoc, Firestore, writeBatch, serverTimestamp, updateDoc as firestoreUpdateDoc } from 'firebase/firestore';
import type { UserProfile, UserScore, Favorites } from './types';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { getLocalFavorites, clearLocalFavorites } from './local-favorites';
import { getDatabase, ref, set } from 'firebase/database';
import { GUEST_MODE_KEY } from "@/app/screens/WelcomeScreen";


export const handleNewUser = async (user: User, firestore: Firestore) => {
    const userRef = doc(firestore, 'users', user.uid);
    const favoritesRef = doc(firestore, 'users', user.uid, 'favorites', 'data');
    const localFavorites = getLocalFavorites();
    const hasLocalFavorites = Object.keys(localFavorites.teams || {}).length > 0 || Object.keys(localFavorites.leagues || {}).length > 0;

    try {
        const userDoc = await getDoc(userRef);

        // If user document already exists, just merge local favorites if any
        if (userDoc.exists()) {
            if (hasLocalFavorites) {
                await setDoc(favoritesRef, localFavorites, { merge: true });
                clearLocalFavorites();
            }
            return; // Existing user flow ends here
        }

        // --- New User Creation Logic ---
        const batch = writeBatch(firestore);

        // 1. Create User Profile
        const displayName = user.displayName || `مستخدم_${user.uid.substring(0, 5)}`;
        const photoURL = user.photoURL || '';
        const userProfileData: UserProfile = {
            displayName: displayName,
            email: user.email || 'N/A', // Ensure email is not null
            photoURL: photoURL,
            isProUser: false,
            onboardingComplete: hasLocalFavorites, // Consider onboarding complete if they have favs
        };
        batch.set(userRef, userProfileData);

        // 2. Create Favorites Subcollection Document
        const favoritesData: Partial<Favorites> = { userId: user.uid };
        if (hasLocalFavorites) {
            Object.assign(favoritesData, localFavorites);
        }
        batch.set(favoritesRef, favoritesData);

        // 3. Commit all changes at once
        await batch.commit();

        // 4. Clear local data after successful migration
        if (hasLocalFavorites) {
            clearLocalFavorites();
        }

    } catch (error: any) {
        // Broad catch for any failure during the new user setup
        const permissionError = new FirestorePermissionError({
            path: `users/${user.uid}`,
            operation: 'write',
            requestResourceData: {
                profile: { displayName: user.displayName, email: user.email },
                favorites: localFavorites
            }
        });
        errorEmitter.emit('permission-error', permissionError);
        console.error("Failed to create new user documents:", error);
    }
};


export const signOut = (): Promise<void> => {
    // Also clear guest mode flag on sign out.
    localStorage.removeItem(GUEST_MODE_KEY);
    const auth = getAuth();
    return firebaseSignOut(auth);
};


export const updateUserDisplayName = async (user: User, newDisplayName: string): Promise<void> => {
    if (!user) throw new Error("User not authenticated.");

    const { firestore } = await import('@/firebase');
    const db = firestore;

    if (!db) {
        console.error("Firestore not available for updateUserDisplayName");
        throw new Error("Database service is not available.");
    }

    await updateProfile(user, { displayName: newDisplayName });

    const userRef = doc(db, 'users', user.uid);
    
    const userProfileUpdateData = { displayName: newDisplayName };
    firestoreUpdateDoc(userRef, userProfileUpdateData)
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: userRef.path,
                operation: 'update',
                requestResourceData: userProfileUpdateData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
};
