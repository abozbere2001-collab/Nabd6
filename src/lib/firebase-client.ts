
"use client";

import { 
  signOut as firebaseSignOut, 
  updateProfile,
  type User, 
  getAuth,
} from "firebase/auth";
import { doc, setDoc, getDoc, Firestore, writeBatch, serverTimestamp } from 'firebase/firestore';
import type { UserProfile, UserScore, Favorites } from './types';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { getLocalFavorites, clearLocalFavorites } from './local-favorites';
import { getDatabase, ref, set } from 'firebase/database';


export const handleNewUser = async (user: User, firestore: Firestore) => {
    const userRef = doc(firestore, 'users', user.uid);

    try {
        const userDoc = await getDoc(userRef);
        
        const localFavorites = getLocalFavorites();
        const hasLocalFavorites = Object.keys(localFavorites.teams || {}).length > 0 || Object.keys(localFavorites.leagues || {}).length > 0;

        if (userDoc.exists()) {
            // If user exists and is not anonymous, merge local favorites and clear them.
            if (!user.isAnonymous && hasLocalFavorites) {
                 const favoritesRef = doc(firestore, 'users', user.uid, 'favorites', 'data');
                 // Important: merge only if there are local favs to prevent overwriting cloud with empty object
                 await setDoc(favoritesRef, localFavorites, { merge: true });
                 clearLocalFavorites();
            }
            return;
        }

        // --- New User Logic ---
        const batch = writeBatch(firestore);

        const displayName = user.displayName || `مستخدم_${user.uid.substring(0, 5)}`;
        const photoURL = user.photoURL || '';

        const userProfileData: UserProfile = {
            displayName: displayName,
            email: user.email!,
            photoURL: photoURL,
            isProUser: false,
            isAnonymous: user.isAnonymous,
            onboardingComplete: false,
        };
        batch.set(userRef, userProfileData);
        
        // Handle favorites for new user
        const favoritesRef = doc(firestore, 'users', user.uid, 'favorites', 'data');
        if (hasLocalFavorites && !user.isAnonymous) {
            // New registered user who had guest favorites: merge them.
            batch.set(favoritesRef, { userId: user.uid, ...localFavorites }, { merge: true });
            clearLocalFavorites();
        } else {
            // Brand new user (or anonymous user) with no local data.
            batch.set(favoritesRef, { userId: user.uid });
        }
        
        await batch.commit();

    } catch (error: any) {
        const permissionError = new FirestorePermissionError({
            path: `users/${user.uid}`,
            operation: 'write',
            requestResourceData: { displayName: user.displayName, email: user.email }
        });
        errorEmitter.emit('permission-error', permissionError);
        console.error("Failed to create new user documents:", error);
    }
}


export const signOut = (): Promise<void> => {
    const auth = getAuth();
    // Do NOT clear local favorites on sign out, so they can be merged if the user signs back in.
    return firebaseSignOut(auth);
};


export const updateUserDisplayName = async (user: User, newDisplayName: string): Promise<void> => {
    if (!user) throw new Error("User not authenticated.");

    const { firestore } = await import('@/firebase');
    const db = firestore;

    await updateProfile(user, { displayName: newDisplayName });

    const userRef = doc(db, 'users', user.uid);
    const rtdbUserRef = ref(getDatabase(), `users/${user.uid}`);
    
    const userProfileUpdateData = { displayName: newDisplayName };
    setDoc(userRef, userProfileUpdateData, { merge: true })
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: userRef.path,
                operation: 'update',
                requestResourceData: userProfileUpdateData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });

    set(rtdbUserRef, { displayName: newDisplayName, photoURL: user.photoURL }).catch(console.error);
};
