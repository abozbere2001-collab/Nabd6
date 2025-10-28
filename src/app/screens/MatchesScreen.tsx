

"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { ScreenProps } from '@/app/page';
import { format, addDays, isToday, isYesterday, isTomorrow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useAdmin, useAuth, useFirestore } from '@/firebase/provider';
import { doc, onSnapshot, collection, getDocs, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Loader2, Search, Star, CalendarClock, Crown, Pencil, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { SearchSheet } from '@/components/SearchSheet';
import { ProfileButton } from '../AppContentWrapper';
import type { Fixture as FixtureType, Favorites, PredictionMatch } from '@/lib/types';
import { FixtureItem } from '@/components/FixtureItem';
import { hardcodedTranslations } from '@/lib/hardcoded-translations';
import { getLocalFavorites, setLocalFavorites } from '@/lib/local-favorites';
import { POPULAR_LEAGUES } from '@/lib/popular-data';
import { useToast } from '@/hooks/use-toast';
import { RenameDialog } from '@/components/RenameDialog';
import { LeagueHeaderItem } from '@/components/LeagueHeaderItem';
import { CURRENT_SEASON } from '@/lib/constants';


interface GroupedFixtures {
    [leagueName: string]: {
        league: FixtureType['league'];
        fixtures: FixtureType[];
    }
}

const popularLeagueIds = new Set(POPULAR_LEAGUES.slice(0, 15).map(l => l.id));


// Fixtures List Component
const FixturesList = React.memo((props: { 
    fixtures: FixtureType[], 
    loading: boolean,
    activeTab: string, 
    hasAnyFavorites: boolean,
    favoritedLeagueIds: number[],
    favoritedTeamIds: number[],
    navigate: ScreenProps['navigate'],
    pinnedPredictionMatches: Set<number>,
    onPinToggle: (fixture: FixtureType) => void,
    isAdmin: boolean,
    showOdds?: boolean,
}) => {
    
    const { favoriteTeamMatches, otherFixtures } = useMemo(() => {
        let favoriteTeamMatches: FixtureType[] = [];
        let otherFixturesList: FixtureType[] = [];

         if (props.activeTab === 'my-results' && props.hasAnyFavorites) {
             props.fixtures.forEach(f => {
                if (props.favoritedTeamIds.includes(f.teams.home.id) || props.favoritedTeamIds.includes(f.teams.away.id)) {
                    favoriteTeamMatches.push(f);
                } else if (props.favoritedLeagueIds.includes(f.league.id)) {
                    otherFixturesList.push(f);
                }
            });
        } else {
            // For 'all-matches' tab or when no favorites exist
            otherFixturesList = props.fixtures;
        }

        return { favoriteTeamMatches, otherFixtures: otherFixturesList };

    }, [props.fixtures, props.activeTab, props.favoritedTeamIds, props.favoritedLeagueIds, props.hasAnyFavorites]);


    const groupedOtherFixtures = useMemo(() => {
        return otherFixtures.reduce((acc, fixture) => {
            const leagueName = fixture.league.name;
            if (!acc[leagueName]) {
                acc[leagueName] = { league: fixture.league, fixtures: [] };
            }
            acc[leagueName].fixtures.push(fixture);
            return acc;
        }, {} as GroupedFixtures);
    }, [otherFixtures]);


    if (props.loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    if (props.activeTab === 'my-results' && !props.hasAnyFavorites) {
        return (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-64 p-4">
                <p className="font-bold text-lg">لم تقم بإضافة أي مفضلات</p>
                <p className="text-sm">أضف فرقًا أو بطولات لترى مبارياتها هنا.</p>
                 <Button className="mt-4" onClick={() => props.navigate('AllCompetitions')}>استكشف البطولات</Button>
            </div>
        );
    }
    
    const noMatches = props.fixtures.length === 0;

    if (noMatches) {
        const message = props.activeTab === 'my-results'
            ? "لا توجد مباريات لمفضلاتك هذا اليوم."
            : "لا توجد مباريات مباشرة حاليًا.";
        return (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-64 p-4">
                <p>{message}</p>
            </div>
        );
    }
    
    const sortedLeagues = Object.keys(groupedOtherFixtures).sort((a,b) => a.localeCompare(b));

    return (
        <div className="space-y-4">
            {favoriteTeamMatches.length > 0 && (
                 <div>
                    <div className="font-semibold text-foreground py-1 px-3 rounded-md bg-card border flex items-center gap-2 text-xs h-6">
                        <Star className="h-4 w-4 text-yellow-400" />
                        <span className="truncate">مباريات فرقك المفضلة</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                        {favoriteTeamMatches.map(f => (
                            <FixtureItem 
                                key={f.fixture.id} 
                                fixture={f} 
                                navigate={props.navigate}
                                isPinnedForPrediction={props.pinnedPredictionMatches.has(f.fixture.id)}
                                onPinToggle={props.onPinToggle}
                                isAdmin={props.isAdmin}
                                showOdds={props.showOdds}
                            />
                        ))}
                    </div>
                </div>
            )}

            {sortedLeagues.map(leagueName => {
                const { league, fixtures: leagueFixtures } = groupedOtherFixtures[leagueName];
                return (
                    <div key={`${league.id}-${league.name}`}>
                       <div className="font-semibold text-foreground py-1 px-3 rounded-md bg-card border flex items-center gap-2 text-xs h-6 cursor-pointer" onClick={() => props.navigate('CompetitionDetails', { leagueId: league.id, title: league.name, logo: league.logo })}>
                           <Avatar className="h-4 w-4"><AvatarImage src={league.logo} alt={league.name} /></Avatar>
                           <span className="truncate">{league.name}</span>
                       </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                            {leagueFixtures.map(f => (
                                <FixtureItem 
                                    key={f.fixture.id} 
                                    fixture={f} 
                                    navigate={props.navigate}
                                    isPinnedForPrediction={props.pinnedPredictionMatches.has(f.fixture.id)}
                                    onPinToggle={props.onPinToggle}
                                    isAdmin={props.isAdmin}
                                    showOdds={props.showOdds}
                                />
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    );
});
FixturesList.displayName = 'FixturesList';


// Date Scroller
const formatDateKey = (date: Date): string => format(date, 'yyyy-MM-dd');

const getDayLabel = (date: Date) => {
    if (isToday(date)) return "اليوم";
    if (isYesterday(date)) return "الأمس";
    if (isTomorrow(date)) return "غداً";
    return format(date, "EEE", { locale: ar });
};

const DateScroller = ({ selectedDateKey, onDateSelect }: {selectedDateKey: string, onDateSelect: (dateKey: string) => void}) => {
    const dates = useMemo(() => {
        const today = new Date();
        const days = [];
        for (let i = -365; i <= 365; i++) {
            days.push(addDays(today, i));
        }
        return days;
    }, []);
    
    const scrollerRef = useRef<HTMLDivElement>(null);
    const selectedButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const scroller = scrollerRef.current;
        const selectedButton = selectedButtonRef.current;

        if (scroller && selectedButton) {
            const scrollerRect = scroller.getBoundingClientRect();
            const selectedRect = selectedButton.getBoundingClientRect();
            
            const scrollOffset = selectedRect.left - scrollerRect.left - (scrollerRect.width / 2) + (selectedRect.width / 2);
            
            scroller.scrollTo({ left: scroller.scrollLeft + scrollOffset, behavior: 'smooth' });
        }
    }, [selectedDateKey]);

    return (
        <div ref={scrollerRef} className="flex flex-row-reverse overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {dates.map(date => {
                const dateKey = formatDateKey(date);
                const isSelected = dateKey === selectedDateKey;
                return (
                     <button
                        key={dateKey}
                        ref={isSelected ? selectedButtonRef : null}
                        className={cn(
                            "relative flex flex-col items-center justify-center h-auto py-1 px-2 min-w-[40px] rounded-lg transition-colors ml-2",
                            "text-foreground/80 hover:text-primary",
                            isSelected && "text-primary"
                        )}
                        onClick={() => onDateSelect(dateKey)}
                        data-state={isSelected ? 'active' : 'inactive'}
                    >
                        <span className="text-[10px] font-normal">{getDayLabel(date)}</span>
                        <span className="font-semibold text-sm">{format(date, 'd')}</span>
                        {isSelected && (
                          <span className="absolute bottom-0 h-0.5 w-3 rounded-full bg-primary transition-transform" />
                        )}
                    </button>
                )
            })}
        </div>
    );
}

type TabName = 'my-results' | 'all-matches';

const tabs: {id: TabName, label: string}[] = [
    // { id: 'all-matches', label: 'مباشر' },
    { id: 'my-results', label: 'نتائجي' },
];

type RenameType = 'league' | 'team' | 'player' | 'continent' | 'country' | 'coach' | 'status';

// Main Screen Component
export function MatchesScreen({ navigate, goBack, canGoBack, isVisible, favorites, customNames, setFavorites, onCustomNameChange }: ScreenProps & { isVisible: boolean, setFavorites: React.Dispatch<React.SetStateAction<Partial<Favorites>>>, onCustomNameChange: () => Promise<void> }) {
  const { user } = useAuth();
  const { db, isAdmin } = useAdmin();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabName>('my-results');
  const [renameItem, setRenameItem] = useState<{ type: RenameType, id: number, name: string, originalName?: string } | null>(null);
  const [showOdds, setShowOdds] = useState(false);

  
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  
  useEffect(() => {
    if (!selectedDateKey && typeof window !== 'undefined') {
      setSelectedDateKey(formatDateKey(new Date()));
    }
  }, [selectedDateKey]);

  const [matchesCache, setMatchesCache] = useState<Map<string, FixtureType[]>>(new Map());
  const [loading, setLoading] = useState(true);
    
  const [pinnedPredictionMatches, setPinnedPredictionMatches] = useState(new Set<number>());


  useEffect(() => {
    if (!db || !isAdmin) return;
    const q = collection(db, "predictionFixtures");
    const unsub = onSnapshot(q, (snapshot) => {
        const newPinnedSet = new Set<number>();
        snapshot.forEach(doc => newPinnedSet.add(Number(doc.id)));
        setPinnedPredictionMatches(newPinnedSet);
    }, (error) => {
        console.error("Permission error listening to predictions:", error);
    });
    return () => unsub();
  }, [db, isAdmin]);

  const getDisplayName = useCallback((type: 'team' | 'league', id: number, defaultName: string) => {
    if (!customNames) return defaultName;
    const firestoreMap = type === 'team' ? customNames?.teams : customNames?.leagues;
    const customName = firestoreMap?.get(id);
    if (customName) return customName;

    const hardcodedMap = type === 'team' ? hardcodedTranslations.teams : hardcodedTranslations.leagues;
    const hardcodedName = hardcodedMap[id as any];
    if(hardcodedName) return hardcodedName;

    return defaultName;
}, [customNames]);


  const handlePinToggle = useCallback((fixture: FixtureType) => {
    if (!db) return;
    const fixtureId = fixture.fixture.id;
    const isPinned = pinnedPredictionMatches.has(fixtureId);
    const docRef = doc(db, 'predictionFixtures', String(fixtureId));

    if (isPinned) {
        deleteDoc(docRef).then(() => {
            toast({ title: "تم إلغاء التثبيت", description: "تمت إزالة المباراة من التوقعات." });
        }).catch(err => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
        });
    } else {
        const data: PredictionMatch = { fixtureData: fixture };
        setDoc(docRef, data).then(() => {
            toast({ title: "تم التثبيت", description: "أصبحت المباراة متاحة الآن للتوقع." });
        }).catch(err => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'create', requestResourceData: data }));
        });
    }
  }, [db, pinnedPredictionMatches, toast]);

    const fetchAndProcessData = useCallback(async (dateKey: string, currentFavorites: Partial<Favorites>, abortSignal: AbortSignal) => {
        setLoading(true);
        try {
            let fixtures: FixtureType[] = [];
            const favTeamIds = Object.keys(currentFavorites?.teams || {}).map(Number);
            const favLeagueIds = Object.keys(currentFavorites?.leagues || {}).map(Number);
            
            if (activeTab === 'all-matches') {
                const liveRes = await fetch('/api/football/fixtures?live=all', { signal: abortSignal });
                if (liveRes.ok) {
                    const liveData = await liveRes.json();
                    fixtures = liveData.response || [];
                }
            } else if(dateKey) { // Fetch by date for 'my-results'
                // Optimized fetch: get all fixtures for the day and filter client-side
                const res = await fetch(`/api/football/fixtures?date=${dateKey}`, { signal: abortSignal });
                if(res.ok) {
                    const data = await res.json();
                    const allFixturesToday: FixtureType[] = data.response || [];
                    if (favTeamIds.length === 0 && favLeagueIds.length === 0) {
                        fixtures = allFixturesToday.filter(f => popularLeagueIds.has(f.league.id));
                    } else {
                        fixtures = allFixturesToday.filter(f => 
                            favTeamIds.includes(f.teams.home.id) || 
                            favTeamIds.includes(f.teams.away.id) ||
                            favLeagueIds.includes(f.league.id)
                        );
                    }
                }
            }

            if (abortSignal.aborted) return;
            
            const processedFixtures = fixtures.map(fixture => ({
                ...fixture,
                league: {
                    ...fixture.league,
                    name: getDisplayName('league', fixture.league.id, fixture.league.name)
                },
                teams: {
                    home: {
                        ...fixture.teams.home,
                        name: getDisplayName('team', fixture.teams.home.id, fixture.teams.home.name)
                    },
                    away: {
                        ...fixture.teams.away,
                        name: getDisplayName('team', fixture.teams.away.id, fixture.teams.away.name)
                    }
                }
            }));
            
            setMatchesCache(prev => new Map(prev).set(dateKey, processedFixtures));

        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                console.error("Failed to fetch and process data:", error);
                setMatchesCache(prev => new Map(prev).set(dateKey, []));
            }
        } finally {
            if (!abortSignal.aborted) {
                setLoading(false);
            }
        }
    }, [db, activeTab, getDisplayName]);
  
  
  useEffect(() => {
      const currentFavorites = favorites;
      
      if (isVisible && selectedDateKey && customNames && currentFavorites) {
          const cacheKey = activeTab === 'all-matches' ? 'live' : selectedDateKey;
          const controller = new AbortController();
          fetchAndProcessData(cacheKey, currentFavorites, controller.signal);
          return () => controller.abort();
      }
  }, [selectedDateKey, activeTab, isVisible, fetchAndProcessData, favorites, customNames]);


  const handleDateChange = (dateKey: string) => {
      setSelectedDateKey(dateKey);
  };
  
  const handleTabChange = (value: string) => {
    const tabValue = value as TabName;
    setActiveTab(tabValue);
  };
  
  const favoritedTeamIds = useMemo(() => favorites?.teams ? Object.keys(favorites.teams).map(Number) : [], [favorites]);
  const favoritedLeagueIds = useMemo(() => favorites?.leagues ? Object.keys(favorites.leagues).map(Number) : [], [favorites]);
  const hasAnyFavorites = favoritedLeagueIds.length > 0 || favoritedTeamIds.length > 0;
  
  const cacheKey = activeTab === 'all-matches' ? 'live' : selectedDateKey || '';
  const currentFixtures = matchesCache.get(cacheKey) || [];
    
  return (
    <div className="flex h-full flex-col bg-background">
        <ScreenHeader 
            title="" 
            canGoBack={false}
            onBack={() => {}} 
            actions={
               <div className="flex items-center gap-0.5">
                  <div
                    onClick={() => setShowOdds(prev => !prev)}
                    className={cn("flex items-center justify-center h-7 w-7 rounded-md cursor-pointer", showOdds ? 'bg-accent' : 'hover:bg-accent/50')}
                  >
                    <span className="text-xs font-mono select-none">1x2</span>
                  </div>
                  <SearchSheet navigate={navigate} favorites={favorites} customNames={customNames} setFavorites={setFavorites}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Search className="h-5 w-5" />
                      </Button>
                  </SearchSheet>
                  <ProfileButton />
              </div>
            }
        />
        
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col min-h-0">
            <div className="sticky top-0 z-10 px-1 pt-1 bg-background">
                <div className="bg-card text-card-foreground rounded-b-lg border-x border-b shadow-md">
                    <TabsList className={cn("grid w-full bg-transparent p-0 h-11", `grid-cols-1`)}>
                        {tabs.map(tab => (
                            <TabsTrigger key={tab.id} value={tab.id} className="data-[state=active]:shadow-none">{tab.label}</TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                 {selectedDateKey && (
                     <div className="relative bg-card py-2 border-x border-b rounded-b-lg shadow-md -mt-1">
                        <DateScroller selectedDateKey={selectedDateKey} onDateSelect={handleDateChange} />
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                            onClick={() => handleDateChange(formatDateKey(new Date()))}
                            disabled={isToday(new Date(selectedDateKey))}
                         >
                            <CalendarClock className="h-4 w-4"/>
                         </Button>
                    </div>
                 )}
            </div>
            
            <TabsContent value="my-results" className="flex-1 overflow-y-auto p-1 space-y-4 mt-0" hidden={activeTab !== 'my-results'}>
                <FixturesList 
                    fixtures={currentFixtures}
                    loading={loading}
                    activeTab={activeTab}
                    favoritedLeagueIds={favoritedLeagueIds}
                    favoritedTeamIds={favoritedTeamIds}
                    hasAnyFavorites={hasAnyFavorites}
                    navigate={navigate}
                    pinnedPredictionMatches={pinnedPredictionMatches}
                    onPinToggle={handlePinToggle}
                    isAdmin={isAdmin}
                    showOdds={showOdds}
                />
            </TabsContent>
            
            <TabsContent value="all-matches" className="flex-1 overflow-y-auto p-1 space-y-4 mt-0" hidden={activeTab !== 'all-matches'}>
                 <FixturesList 
                    fixtures={currentFixtures}
                    loading={loading}
                    activeTab={activeTab}
                    favoritedLeagueIds={favoritedLeagueIds}
                    favoritedTeamIds={favoritedTeamIds}
                    hasAnyFavorites={hasAnyFavorites}
                    navigate={navigate}
                    pinnedPredictionMatches={pinnedPredictionMatches}
                    onPinToggle={handlePinToggle}
                    isAdmin={isAdmin}
                    showOdds={showOdds}
                />
            </TabsContent>

        </Tabs>
    </div>
  );
}
