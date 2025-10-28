
"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { MatchesScreen } from './screens/MatchesScreen';
import { CompetitionsScreen } from './screens/CompetitionsScreen';
import { AllCompetitionsScreen } from './screens/AllCompetitionsScreen';
import { NewsScreen } from './screens/NewsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CompetitionDetailScreen } from './screens/CompetitionDetailScreen';
import { TeamDetailScreen } from './screens/TeamDetailScreen';
import { PlayerDetailScreen } from './screens/PlayerDetailScreen';
import { AdminFavoriteTeamScreen } from './screens/AdminFavoriteTeamScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SeasonPredictionsScreen } from './screens/SeasonPredictionsScreen';
import { SeasonTeamSelectionScreen } from './screens/SeasonTeamSelectionScreen';
import { SeasonPlayerSelectionScreen } from './screens/SeasonPlayerSelectionScreen';
import { AddEditNewsScreen } from './screens/AddEditNewsScreen';
import { ManagePinnedMatchScreen } from './screens/ManagePinnedMatchScreen';
import MatchDetailScreen from './screens/MatchDetailScreen';
import { NotificationSettingsScreen } from './screens/NotificationSettingsScreen';
import { GeneralSettingsScreen } from './screens/GeneralSettingsScreen';
import PrivacyPolicyScreen from './privacy-policy/page';
import TermsOfServiceScreen from './terms-of-service/page';
import { GoProScreen } from './screens/GoProScreen';
import type { ScreenKey } from './page';

import { useAd, SplashScreenAd, BannerAd } from '@/components/AdProvider';
import { useAuth, useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, User as UserIcon, Loader2 } from 'lucide-react';
import { signOut } from '@/lib/firebase-client';
import { cn } from '@/lib/utils';
import { ManageTopScorersScreen } from './screens/ManageTopScorersScreen';
import { IraqScreen } from './screens/IraqScreen';
import { PredictionsScreen } from './screens/PredictionsScreen';
import { doc, onSnapshot, getDocs, collection } from 'firebase/firestore';
import type { Favorites } from '@/lib/types';
import { getLocalFavorites, GUEST_MODE_KEY } from '@/lib/local-favorites';
import { AnimatePresence, motion } from 'framer-motion';


const screenConfig: Record<string, { component: React.ComponentType<any>;}> = {
  Matches: { component: MatchesScreen },
  Competitions: { component: CompetitionsScreen },
  AllCompetitions: { component: AllCompetitionsScreen },
  News: { component: NewsScreen },
  Settings: { component: SettingsScreen },
  CompetitionDetails: { component: CompetitionDetailScreen },
  TeamDetails: { component: TeamDetailScreen },
  PlayerDetails: { component: PlayerDetailScreen },
  AdminFavoriteTeamDetails: { component: AdminFavoriteTeamScreen },
  Profile: { component: ProfileScreen },
  SeasonPredictions: { component: SeasonPredictionsScreen },
  SeasonTeamSelection: { component: SeasonTeamSelectionScreen },
  SeasonPlayerSelection: { component: SeasonPlayerSelectionScreen },
  AddEditNews: { component: AddEditNewsScreen },
  ManagePinnedMatch: { component: ManagePinnedMatchScreen },
  MatchDetails: { component: MatchDetailScreen },
  NotificationSettings: { component: NotificationSettingsScreen },
  GeneralSettings: { component: GeneralSettingsScreen },
  PrivacyPolicy: { component: PrivacyPolicyScreen },
  TermsOfService: { component: TermsOfServiceScreen },
  GoPro: { component: GoProScreen },
  ManageTopScorers: { component: ManageTopScorersScreen },
  MyCountry: { component: IraqScreen },
  Predictions: { component: PredictionsScreen },
};


const mainTabs: ScreenKey[] = ['Matches', 'MyCountry', 'Predictions', 'Competitions', 'News', 'Settings'];

type StackItem = {
  key: string;
  screen: ScreenKey;
  props?: Record<string, any>;
};

export const ProfileButton = () => {
    const { user } = useAuth();

    const handleSignOut = async () => {
        await signOut();
    };
    
    const navigateToProfile = () => {
        if ((window as any).appNavigate) {
            (window as any).appNavigate('Profile');
        }
    };
    
    const navigateToLogin = () => {
        localStorage.removeItem(GUEST_MODE_KEY);
        window.location.reload();
    }


    if (!user) {
        return (
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={navigateToLogin}>
                <UserIcon className="h-4 w-4" />
            </Button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-7 w-7 rounded-full">
                    <Avatar className="h-7 w-7">
                        <AvatarImage src={user.photoURL || ''} alt={user.displayName || ''} />
                        <AvatarFallback>{user.displayName?.charAt(0)}</AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.displayName}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {user.email}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={navigateToProfile}>
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>الملف الشخصي</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>تسجيل الخروج</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};


export function AppContentWrapper() {
  const { user, isUserLoading } = useAuth();
  const { db } = useFirestore();
  const [favorites, setFavorites] = useState<Partial<Favorites>>({});
  const [customNames, setCustomNames] = useState<{ [key: string]: Map<number | string, string> } | null>(null);
  
  const [navigationState, setNavigationState] = useState<{ activeTab: ScreenKey, stacks: Record<string, StackItem[]> }>({
    activeTab: 'Matches',
    stacks: {
        'Matches': [{ key: 'Matches-0', screen: 'Matches' }],
        'Competitions': [{ key: 'Competitions-0', screen: 'Competitions' }],
        'News': [{ key: 'News-0', screen: 'News' }],
        'MyCountry': [{ key: 'MyCountry-0', screen: 'MyCountry' }],
        'Predictions': [{ key: 'Predictions-0', screen: 'Predictions' }],
        'Settings': [{ key: 'Settings-0', screen: 'Settings' }],
    },
  });

  const { showSplashAd, showBannerAd } = useAd();
  const keyCounter = useRef(1);

  const fetchCustomNames = useCallback(async () => {
    if (!db) {
        setCustomNames({ leagues: new Map(), teams: new Map(), countries: new Map(), continents: new Map(), players: new Map(), coaches: new Map() });
        return;
    }
    try {
        const [leaguesSnap, countriesSnap, continentsSnap, teamsSnap, playersSnap, coachesSnap] = await Promise.all([
            getDocs(collection(db, 'leagueCustomizations')),
            getDocs(collection(db, 'countryCustomizations')),
            getDocs(collection(db, 'continentCustomizations')),
            getDocs(collection(db, 'teamCustomizations')),
            getDocs(collection(db, 'playerCustomizations')),
            getDocs(collection(db, 'coachCustomizations')),
        ]);

        const names: { [key: string]: Map<number | string, string> } = {
            leagues: new Map(), countries: new Map(), continents: new Map(),
            teams: new Map(), players: new Map(), coaches: new Map()
        };
        leaguesSnap.forEach(doc => names.leagues.set(Number(doc.id), doc.data().customName));
        countriesSnap.forEach(doc => names.countries.set(doc.id, doc.data().customName));
        continentsSnap.forEach(doc => names.continents.set(doc.id, doc.data().customName));
        teamsSnap.forEach(doc => names.teams.set(Number(doc.id), doc.data().customName));
        playersSnap.forEach(doc => names.players.set(Number(doc.id), doc.data().customName));
        coachesSnap.forEach(doc => names.coaches.set(Number(doc.id), doc.data().customName));
        setCustomNames(names);
    } catch (error) {
        console.warn("Failed to fetch custom names, using empty maps.", error);
        setCustomNames({ leagues: new Map(), teams: new Map(), countries: new Map(), continents: new Map(), players: new Map(), coaches: new Map() });
    }
  }, [db]);
  
  useEffect(() => {
    // Always fetch custom names, regardless of user state.
    fetchCustomNames();
  }, [fetchCustomNames]);
  
  useEffect(() => {
    let favsUnsub: (() => void) | null = null;
    const localFavsListener = () => {
        setFavorites(getLocalFavorites());
    };

    const cleanup = () => {
      if (favsUnsub) {
        favsUnsub();
        favsUnsub = null;
      }
      window.removeEventListener('localFavoritesChanged', localFavsListener);
    };

    if (isUserLoading) {
      return;
    }

    if (user && db) {
      cleanup(); // Clean up previous listener if any
      const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
      favsUnsub = onSnapshot(
        favDocRef,
        (doc) => {
          setFavorites(doc.exists() ? (doc.data() as Favorites) : {});
        },
        (error) => {
          console.error("Error listening to remote favorites:", error);
          setFavorites(getLocalFavorites()); // Fallback to local on error
        }
      );
    } else { // Guest mode or logged out
      cleanup(); // Clean up previous listener if any
      setFavorites(getLocalFavorites());
      window.addEventListener('localFavoritesChanged', localFavsListener);
    }

    return () => cleanup();
  }, [user, db, isUserLoading]);


  const goBack = useCallback(() => {
    setNavigationState(prevState => {
        const currentStack = prevState.stacks[prevState.activeTab];
        if (currentStack.length > 1) {
            return {
                ...prevState,
                stacks: {
                    ...prevState.stacks,
                    [prevState.activeTab]: currentStack.slice(0, -1),
                }
            };
        }
        if (!mainTabs.includes(prevState.activeTab)) {
            return { ...prevState, activeTab: 'Matches' };
        }
        return prevState;
    });
  }, []);

  const navigate = useCallback((screen: ScreenKey, props?: Record<string, any>) => {
      const newKey = `${screen}-${keyCounter.current++}`;
      const newItem = { key: newKey, screen, props };

      setNavigationState(prevState => {
          if (mainTabs.includes(screen)) {
              return {
                  ...prevState,
                  activeTab: screen,
              };
          }
          
          const currentStack = prevState.stacks[prevState.activeTab] || [];
          return {
              ...prevState,
              stacks: {
                  ...prevState.stacks,
                  [prevState.activeTab]: [...currentStack, newItem]
              }
          };
      });
  }, []);
  
  useEffect(() => {
      if (typeof window !== 'undefined') {
          (window as any).appNavigate = navigate;
      }
  }, [navigate]);
  
  const isDataReady = customNames !== null;

  if (!isDataReady) {
    return null; // Return null instead of loader to avoid the second loading screen
  }

  if (showSplashAd) {
    return <SplashScreenAd />;
  }
  
  const activeStack = navigationState.stacks[navigationState.activeTab] || [];
  
  const pageVariants = {
      initial: {
          x: '100%',
          opacity: 0,
      },
      in: {
          x: 0,
          opacity: 1,
      },
      out: {
          x: '-100%',
          opacity: 0,
      }
  };

  const pageTransition = {
      type: 'tween',
      ease: 'anticipate',
      duration: 0.4
  };

  return (
        <main className="h-screen w-screen bg-background flex flex-col">
        <div className="relative flex-1 flex flex-col overflow-hidden">
            {Object.entries(navigationState.stacks).map(([tabKey, stack]) => {
                if (stack.length === 0) return null;
                const isActiveTab = navigationState.activeTab === tabKey;
            
                return (
                    <div 
                        key={tabKey} 
                        className="absolute inset-0 flex flex-col"
                        style={{ display: isActiveTab ? 'flex' : 'none' }}
                    >
                         <AnimatePresence initial={false}>
                            {stack.map((stackItem, index) => {
                                const isVisible = index === stack.length - 1;
                                const Component = screenConfig[stackItem.screen]?.component;
                                if (!Component) return null;
                                
                                const screenProps = {
                                    ...stackItem.props,
                                    navigate,
                                    goBack,
                                    canGoBack: stack.length > 1,
                                    isVisible,
                                    favorites,
                                    customNames,
                                    setFavorites,
                                    onCustomNameChange: fetchCustomNames,
                                };

                                return (
                                     <motion.div
                                        key={stackItem.key}
                                        className="absolute inset-0 flex flex-col bg-background"
                                        initial="initial"
                                        animate={isVisible ? "in" : "out"}
                                        exit="out"
                                        variants={pageVariants}
                                        transition={pageTransition}
                                        style={{
                                            zIndex: index + 1,
                                            pointerEvents: isVisible ? 'auto' : 'none',
                                        }}
                                    >
                                        <Component {...screenProps} />
                                    </motion.div>
                                )
                            })}
                         </AnimatePresence>
                    </div>
                )
            })}
        </div>
        
        {showBannerAd && <BannerAd />}
        {mainTabs.includes(activeStack[activeStack.length - 1]?.screen) && <BottomNav activeScreen={navigationState.activeTab} onNavigate={(screen) => navigate(screen)} />}
        </main>
  );
}

    

    