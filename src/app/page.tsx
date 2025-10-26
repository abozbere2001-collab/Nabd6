
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
import { WelcomeScreen } from './screens/WelcomeScreen';
import { handleNewUser } from '@/lib/firebase-client';
import { type User } from 'firebase/auth';

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


const OnboardingFlow = ({ user }: { user: User }) => {
    const { db } = useFirestore();
    const [onboardingComplete, setOnboardingComplete] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkOnboarding = async () => {
            if (!user || !db) {
                setIsLoading(false);
                return;
            };

            if (user.isAnonymous) {
                const guestOnboardingComplete = localStorage.getItem(GUEST_ONBOARDING_COMPLETE_KEY) === 'true';
                setOnboardingComplete(guestOnboardingComplete);
                setIsLoading(false);
                return;
            }

            const userDocRef = doc(db, 'users', user.uid);
            try {
                const userDoc = await getDoc(userDocRef);
                setOnboardingComplete(userDoc.exists() && userDoc.data().onboardingComplete);
            } catch (error) {
                console.error("Error checking onboarding status:", error);
                // Assume onboarding is not complete if there's an error,
                // which is safer than getting stuck.
                setOnboardingComplete(false);
            } finally {
                setIsLoading(false);
            }
        };
        checkOnboarding();
    }, [user, db]);

    const handleOnboardingComplete = async () => {
        if (!user || !db) {
            // Handle case for guest users when db might not be ready
             if (user?.isAnonymous) {
                localStorage.setItem(GUEST_ONBOARDING_COMPLETE_KEY, 'true');
                setOnboardingComplete(true);
            }
            return;
        }
        
        if (user.isAnonymous) {
            localStorage.setItem(GUEST_ONBOARDING_COMPLETE_KEY, 'true');
        } else {
            const userDocRef = doc(db, 'users', user.uid);
            try {
                // Set onboarding as complete in the user's document
                await setDoc(userDocRef, { onboardingComplete: true }, { merge: true });
            } catch (error) {
                const permissionError = new FirestorePermissionError({ path: userDocRef.path, operation: 'update', requestResourceData: { onboardingComplete: true } });
                errorEmitter.emit('permission-error', permissionError);
            }
        }
        setOnboardingComplete(true);
    };

    if (isLoading) {
        return <LoadingSplashScreen />;
    }

    if (!onboardingComplete) {
        return <FavoriteSelectionScreen onOnboardingComplete={handleOnboardingComplete} />;
    }

    return (
        <AdProvider>
            <AppContentWrapper />
        </AdProvider>
    );
};


export default function Home() {
    const { user, isUserLoading } = useAuth();
    
    if (isUserLoading) {
        return <LoadingSplashScreen />;
    }

    if (!user) {
        return <WelcomeScreen />;
    }

    return <OnboardingFlow user={user} />;
}
