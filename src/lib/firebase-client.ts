
"use client";

import { 
  signOut as firebaseSignOut, 
  updateProfile,
  type User, 
  getAuth,
} from "firebase/auth";
import { doc, setDoc, getDoc, Firestore, writeBatch } from 'firebase/firestore';
import type { UserProfile, UserScore, Favorites } from './types';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { getLocalFavorites, clearLocalFavorites } from './local-favorites';
import { getDatabase, ref, set } from 'firebase/database';


export const handleNewUser = async (user: User, firestore: Firestore) => {
    const userRef = doc(firestore, 'users', user.uid);

    try {
        const userDoc = await getDoc(userRef);
        // If user document already exists, no need to do anything.
        if (userDoc.exists()) {
            // But if they were anonymous and had local favorites, merge them.
            if (!user.isAnonymous) {
                const localFavorites = getLocalFavorites();
                 if (Object.keys(localFavorites.teams || {}).length > 0 || Object.keys(localFavorites.leagues || {}).length > 0) {
                     const favoritesRef = doc(firestore, 'users', user.uid, 'favorites', 'data');
                     await setDoc(favoritesRef, localFavorites, { merge: true });
                     clearLocalFavorites();
                 }
            }
            return;
        }

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
        
        const favoritesRef = doc(firestore, 'users', user.uid, 'favorites', 'data');
        // Start with a clean slate for favorites, but check local storage for guest data.
        const initialFavorites: Partial<Favorites> = { userId: user.uid, teams: {}, leagues: {} };
        const localFavorites = getLocalFavorites();
        if (Object.keys(localFavorites.teams || {}).length > 0 || Object.keys(localFavorites.leagues || {}).length > 0) {
             const mergedTeams = { ...(initialFavorites.teams || {}), ...(localFavorites.teams || {}) };
             const mergedLeagues = { ...(initialFavorites.leagues || {}), ...(localFavorites.leagues || {}) };
             initialFavorites.teams = mergedTeams;
             initialFavorites.leagues = mergedLeagues;
             clearLocalFavorites(); // Clear local data after merging.
        }

        const batch = writeBatch(firestore);
        batch.set(userRef, userProfileData);
        batch.set(favoritesRef, initialFavorites);

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
    clearLocalFavorites();
    return firebaseSignOut(auth);
};


export const updateUserDisplayName = async (user: User, newDisplayName: string): Promise<void> => {
    if (!user) throw new Error("User not authenticated.");

    // The db object is imported directly from the firebase barrel file now
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
