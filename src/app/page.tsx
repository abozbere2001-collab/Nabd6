
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { AppContentWrapper } from './AppContentWrapper';
import { AdProvider } from '@/components/AdProvider';
import { Loader2 } from 'lucide-react';
import { FavoriteSelectionScreen } from './screens/FavoriteSelectionScreen';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { NabdAlMalaebLogo } from '@/components/icons/NabdAlMalaebLogo';
import { WelcomeScreen, GUEST_MODE_KEY } from './screens/WelcomeScreen';
import { handleNewUser } from '@/lib/firebase-client';
import { type User } from 'firebase/auth';
import { ProfileScreen } from './screens/ProfileScreen';

export type ScreenKey = 'Welcome' | 'SignUp' | 'Matches' | 'Competitions' | 'AllCompetitions' | 'News' | 'Settings' | 'CompetitionDetails' | 'TeamDetails' | 'PlayerDetails' | 'AdminFavoriteTeamDetails' | 'Profile' | 'SeasonPredictions' | 'SeasonTeamSelection' | 'SeasonPlayerSelection' | 'AddEditNews' | 'ManageTopScorers' | 'MatchDetails' | 'NotificationSettings' | 'GeneralSettings' | 'ManagePinnedMatch' | 'PrivacyPolicy' | 'TermsOfService' | 'FavoriteSelection' | 'GoPro' | 'MyCountry' | 'Predictions';

export type ScreenProps = {
  navigate: (screen: ScreenKey, props?: Record<string, any>) => void;
  goBack: () => void;
  canGoBack: boolean;
};

const GUEST_ONBOARDING_COMPLETE_KEY = 'goalstack_guest_onboarding_complete';

const LoadingSplashScreen = () => (
    <div className="flex flex-col items-center justify-center h-screen bg-background text-center">
        <NabdAlMalaebLogo className="h-24 w-24 mb-4" />
        <h1 className="text-2xl font-bold font-headline mb-8 text-primary">نبض الملاعب</h1>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
);


const OnboardingFlow = ({ user, isGuest }: { user: User | null, isGuest: boolean }) => {
    const { db } = useFirestore();
    const [onboardingComplete, setOnboardingComplete] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [needsDisplayName, setNeedsDisplayName] = useState(false);

    useEffect(() => {
        const checkOnboarding = async () => {
            setIsLoading(true);
            if (isGuest) {
                const guestOnboardingComplete = localStorage.getItem(GUEST_ONBOARDING_COMPLETE_KEY) === 'true';
                setOnboardingComplete(guestOnboardingComplete);
                setIsLoading(false);
                return;
            }

            if (!user || !db) {
                setIsLoading(false);
                return;
            };

            const userDocRef = doc(db, 'users', user.uid);
            try {
                const userDoc = await getDoc(userDocRef);
                const userData = userDoc.data();
                setOnboardingComplete(userData?.onboardingComplete || false);
                setNeedsDisplayName(!userData?.displayName);
            } catch (error) {
                console.error("Error checking onboarding status:", error);
                setOnboardingComplete(false);
            } finally {
                setIsLoading(false);
            }
        };
        checkOnboarding();
    }, [user, db, isGuest]);

    const handleOnboardingComplete = async () => {
        if (isGuest) {
            localStorage.setItem(GUEST_ONBOARDING_COMPLETE_KEY, 'true');
            setOnboardingComplete(true);
            return;
        }

        if (!user || !db) return;
        
        const userDocRef = doc(db, 'users', user.uid);
        try {
            await setDoc(userDocRef, { onboardingComplete: true }, { merge: true });
            setOnboardingComplete(true);
            // After completing favorite selection, check if they still need a display name
            const userDoc = await getDoc(userDocRef);
            if (!userDoc.data()?.displayName) {
                setNeedsDisplayName(true);
            }
        } catch (error) {
            const permissionError = new FirestorePermissionError({ path: userDocRef.path, operation: 'update', requestResourceData: { onboardingComplete: true } });
            errorEmitter.emit('permission-error', permissionError);
        }
    };
    
    const handleDisplayNameSet = () => {
        setNeedsDisplayName(false);
    }

    if (isLoading) {
        return <LoadingSplashScreen />;
    }

    if (!onboardingComplete) {
        return <FavoriteSelectionScreen onOnboardingComplete={handleOnboardingComplete} />;
    }
    
    if (needsDisplayName) {
        // A simplified version of navigate/goBack for this specific flow
        const pseudoNavigate = () => {};
        const pseudoGoBack = () => handleDisplayNameSet();
        return <ProfileScreen navigate={pseudoNavigate} goBack={pseudoGoBack} canGoBack={false} />;
    }

    return (
        <AdProvider>
            <AppContentWrapper />
        </AdProvider>
    );
};


export default function Home() {
    const { user, isUserLoading } = useAuth();
    const [isGuest, setIsGuest] = useState(false);
    const [isCheckingGuest, setIsCheckingGuest] = useState(true);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const guestMode = localStorage.getItem(GUEST_MODE_KEY) === 'true';
            setIsGuest(guestMode);
        }
        setIsCheckingGuest(false);
    }, []);
    
    if (isUserLoading || isCheckingGuest) {
        return <LoadingSplashScreen />;
    }

    if (!user && !isGuest) {
        return <WelcomeScreen />;
    }

    // Pass isGuest flag to OnboardingFlow
    return <OnboardingFlow user={user} isGuest={isGuest} />;
}
