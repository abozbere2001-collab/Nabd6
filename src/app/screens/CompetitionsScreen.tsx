

"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Star, Plus, Users, Trophy, User as PlayerIcon, Search } from 'lucide-react';
import type { ScreenProps } from '@/app/page';
import { Button } from '@/components/ui/button';
import { useAuth, useFirestore } from '@/firebase/provider';
import { doc, onSnapshot, getDocs, collection } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import type { Favorites } from '@/lib/types';
import { SearchSheet } from '@/components/SearchSheet';
import { ProfileButton } from '../AppContentWrapper';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { hardcodedTranslations } from '@/lib/hardcoded-translations';
import { getLocalFavorites, setLocalFavorites } from '@/lib/local-favorites';

// --- MAIN SCREEN COMPONENT ---
export function CompetitionsScreen({ navigate, goBack, canGoBack }: ScreenProps) {
    const { user } = useAuth();
    const { db } = useFirestore();
    const { toast } = useToast();
    const [favorites, setFavorites] = useState<Partial<Favorites>>({});
    const [loading, setLoading] = useState(true);
    const [customNames, setCustomNames] = useState<{ leagues: Map<number, string>, teams: Map<number, string> } | null>(null);

    // Centralized useEffect for fetching custom names and subscribing to favorites
    useEffect(() => {
        let isMounted = true;
        let unsubscribe: (() => void) | null = null;
        
        const fetchInitialData = async () => {
            if (!db) {
                if (isMounted) setCustomNames({ leagues: new Map(), teams: new Map() });
                return;
            };
            try {
                const [leaguesSnapshot, teamsSnapshot] = await Promise.all([
                    getDocs(collection(db, 'leagueCustomizations')),
                    getDocs(collection(db, 'teamCustomizations'))
                ]);
                
                if (isMounted) {
                    const leagueNames = new Map<number, string>();
                    leaguesSnapshot.forEach(doc => leagueNames.set(Number(doc.id), doc.data().customName));

                    const teamNames = new Map<number, string>();
                    teamsSnapshot.forEach(doc => teamNames.set(Number(doc.id), doc.data().customName));
                    
                    setCustomNames({ leagues: leagueNames, teams: teamNames });
                }

            } catch (error) {
                if (isMounted) setCustomNames({ leagues: new Map(), teams: new Map() });
            }
        };

        const handleLocalFavoritesChange = () => {
            if (isMounted) setFavorites(getLocalFavorites());
        };

        fetchInitialData();
        setLoading(true);
        
        if (user && db && !user.isAnonymous) {
            const docRef = doc(db, 'users', user.uid, 'favorites', 'data');
            unsubscribe = onSnapshot(docRef, (doc) => {
                if (isMounted) {
                    const favs = (doc.data() as Favorites) || { userId: user.uid };
                    setFavorites(favs);
                    setLoading(false);
                }
            }, (error) => {
                 if (error.code === 'permission-denied') {
                    if (isMounted) setFavorites(getLocalFavorites());
                } else {
                  const permissionError = new FirestorePermissionError({ path: docRef.path, operation: 'get' });
                  errorEmitter.emit('permission-error', permissionError);
                }
                if (isMounted) setLoading(false);
            });
             window.removeEventListener('localFavoritesChanged', handleLocalFavoritesChange);
        } else {
            if (isMounted) {
                setFavorites(getLocalFavorites());
                setLoading(false);
            }
            window.addEventListener('localFavoritesChanged', handleLocalFavoritesChange);
        }

        return () => {
            isMounted = false;
            if (unsubscribe) unsubscribe();
            window.removeEventListener('localFavoritesChanged', handleLocalFavoritesChange);
        };
    }, [user, db]);


     const getDisplayName = useCallback((type: 'league' | 'team', id: number, defaultName: string) => {
        if (!customNames) return defaultName;
        const key = `${type}s` as 'leagues' | 'teams';
        const map = customNames[key] as Map<number, string>;
        const customName = map?.get(id);
        if (customName) return customName;

        const hardcodedMap = hardcodedTranslations[key];
        const hardcodedName = hardcodedMap[id as any];
        if (hardcodedName) return hardcodedName;

        return defaultName;
    }, [customNames]);


    const favoriteTeams = useMemo(() => {
      if (!favorites?.teams || !customNames) return [];
      return Object.values(favorites.teams).map(team => ({
        ...team,
        name: getDisplayName('team', team.teamId, team.name)
      }));
    }, [favorites.teams, customNames, getDisplayName]);

    const favoriteLeagues = useMemo(() => {
        if (!favorites?.leagues || !customNames) return [];
        return Object.values(favorites.leagues).map(comp => ({
            ...comp,
            name: getDisplayName('league', comp.leagueId, comp.name)
        }));
    }, [favorites.leagues, customNames, getDisplayName]);

    const favoritePlayers = useMemo(() => favorites?.players ? Object.values(favorites.players) : [], [favorites.players]);
    
    const handleLoginClick = () => {
        if ((window as any).appNavigate) {
            (window as any).appNavigate('Welcome');
        }
    }

    return (
        <div className="flex h-full flex-col bg-background">
             <ScreenHeader 
                title={"اختياراتي"} 
                onBack={goBack} 
                canGoBack={canGoBack} 
                actions={
                  <div className="flex items-center gap-1">
                      <SearchSheet navigate={navigate}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Search className="h-5 w-5" />
                          </Button>
                      </SearchSheet>
                      <ProfileButton />
                  </div>
                }
            />
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto">
                     <div className="space-y-6 py-4">
                        <ScrollArea className="w-full whitespace-nowrap">
                            <div className="flex w-max space-x-4 px-4 flex-row-reverse">
                                 <div className="flex flex-col items-center gap-2 w-20 h-[84px] text-center">
                                      <SearchSheet navigate={navigate} initialItemType="teams">
                                        <div className="flex flex-col items-center justify-center h-14 w-14 bg-card rounded-full cursor-pointer hover:bg-accent/50 transition-colors">
                                            <Plus className="h-6 w-6 text-primary" />
                                        </div>
                                      </SearchSheet>
                                      <span className="text-xs font-medium truncate w-full text-primary">أضف</span>
                                </div>
                                {favoriteTeams.map((team, index) => (
                                    <div key={`${team.teamId}-${index}`} className="relative flex flex-col items-center gap-2 w-20 text-center cursor-pointer" onClick={() => navigate('TeamDetails', { teamId: team.teamId })}>
                                        <Avatar className="h-14 w-14 border-2 border-border">
                                            <AvatarImage src={team.logo} />
                                            <AvatarFallback>{team.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-xs font-medium truncate w-full">{team.name}</span>
                                        <Star className="absolute top-0 right-0 h-4 w-4 text-yellow-400 fill-current" />
                                    </div>
                                ))}
                            </div>
                            <ScrollBar orientation="horizontal" className="h-1.5 mt-2" />
                        </ScrollArea>

                        <Tabs defaultValue="teams" className="w-full px-1">
                             <div className="bg-card text-card-foreground rounded-b-lg border-x border-b shadow-md">
                                <TabsList className="grid w-full grid-cols-3 bg-transparent h-11 p-0">
                                    <TabsTrigger value="players" className="data-[state=active]:shadow-none"><PlayerIcon className="ml-1 h-4 w-4"/>اللاعبين</TabsTrigger>
                                    <TabsTrigger value="competitions" className="data-[state=active]:shadow-none"><Trophy className="ml-1 h-4 w-4"/>البطولات</TabsTrigger>
                                    <TabsTrigger value="teams" className="data-[state=active]:shadow-none"><Users className="ml-1 h-4 w-4"/>الفرق</TabsTrigger>
                                </TabsList>
                            </div>
                            
                            <TabsContent value="teams" className="mt-4 px-3">
                                <div className="grid grid-cols-4 gap-4">
                                     <div className="h-[76px] w-full">
                                         <SearchSheet navigate={navigate} initialItemType="teams">
                                            <div className="flex flex-col items-center justify-center gap-2 text-center p-2 rounded-2xl border-2 border-dashed border-muted-foreground/50 h-full w-full cursor-pointer hover:bg-accent/50 transition-colors">
                                                <div className="flex items-center justify-center h-10 w-10 bg-primary/10 rounded-full">
                                                    <Plus className="h-6 w-6 text-primary" />
                                                </div>
                                            </div>
                                         </SearchSheet>
                                    </div>
                                    {favoriteTeams.map((team, index) => 
                                        <div key={`${team.teamId}-${index}`} className="relative flex flex-col items-center justify-start gap-1 text-center cursor-pointer h-[76px]" onClick={() => navigate('TeamDetails', { teamId: team.teamId })}>
                                            <Avatar className="h-12 w-12 border-2 border-border">
                                                <AvatarImage src={team.logo} />
                                                <AvatarFallback>{team.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-[11px] font-medium truncate w-full">{team.name}</span>
                                            <Star className="absolute top-1 right-1 h-3 w-3 text-yellow-400 fill-current" />
                                        </div>
                                    )}
                                </div>
                            </TabsContent>
                            
                            <TabsContent value="competitions" className="mt-4 px-3">
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="h-[76px] w-full">
                                        <SearchSheet navigate={navigate} initialItemType="leagues">
                                            <div className="flex flex-col items-center justify-center gap-2 text-center p-2 rounded-2xl border-2 border-dashed border-muted-foreground/50 h-full w-full cursor-pointer hover:bg-accent/50 transition-colors">
                                                <div className="flex items-center justify-center h-10 w-10 bg-primary/10 rounded-full">
                                                    <Plus className="h-6 w-6 text-primary" />
                                                </div>
                                            </div>
                                        </SearchSheet>
                                    </div>
                                    {favoriteLeagues.map((comp, index) => 
                                        <div key={`${comp.leagueId}-${index}`} className="relative flex flex-col items-center justify-start gap-1 text-center cursor-pointer h-[76px]" onClick={() => navigate('CompetitionDetails', { title: comp.name, leagueId: comp.leagueId, logo: comp.logo })}>
                                            <Avatar className="h-12 w-12 border-2 border-border p-1">
                                                <AvatarImage src={comp.logo} className="object-contain" />
                                                <AvatarFallback>{comp.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                             <span className="text-[11px] font-medium truncate w-full">{comp.name}</span>
                                            <Star className="absolute top-1 right-1 h-3 w-3 text-yellow-400 fill-current" />
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="players" className="mt-4 px-3">
                                <div className="grid grid-cols-4 gap-4">
                                     <div className="h-[76px] w-full">
                                        <SearchSheet navigate={navigate} initialItemType="teams">
                                            <div className="flex flex-col items-center justify-center gap-2 text-center p-2 rounded-2xl border-2 border-dashed border-muted-foreground/50 h-full w-full cursor-pointer hover:bg-accent/50 transition-colors">
                                                <div className="flex items-center justify-center h-10 w-10 bg-primary/10 rounded-full">
                                                    <Plus className="h-6 w-6 text-primary" />
                                                </div>
                                            </div>
                                        </SearchSheet>
                                     </div>
                                     <div className="h-[76px] w-full col-span-3 flex items-center justify-center">
                                        <p className="text-muted-foreground text-center text-sm">قائمة اللاعبين المفضلين قيد التطوير.</p>
                                     </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                         {!user && (
                            <div className="px-4 pt-4 text-center">
                                 <p className="text-sm text-muted-foreground mb-4">للحفاظ على مفضلاتك ومزامنتها عبر الأجهزة، قم بإنشاء حساب دائم.</p>
                                <Button onClick={handleLoginClick} className="w-full max-w-sm mx-auto">تسجيل الدخول أو إنشاء حساب</Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

