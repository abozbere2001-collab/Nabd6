
"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import type { ScreenProps } from '@/app/page';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileButton } from '../AppContentWrapper';
import { Button } from '@/components/ui/button';
import { Crown, Search, X, Loader2, Trophy, BarChart, Users as UsersIcon, RefreshCw, CalendarDays, ThumbsUp } from 'lucide-react';
import { SearchSheet } from '@/components/SearchSheet';
import { useAdmin, useAuth, useFirestore } from '@/firebase';
import type { CrownedTeam, Favorites, Fixture, Standing, TopScorer, Prediction, Team, Player, UserScore, PredictionMatch, UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { collection, onSnapshot, doc, updateDoc, deleteField, setDoc, query, where, getDocs, writeBatch, getDoc, orderBy, limit } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';
import { FixtureItem } from '@/components/FixtureItem';
import { isMatchLive } from '@/lib/matchStatus';
import { CURRENT_SEASON } from '@/lib/constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, addDays, subDays, isToday, isYesterday, isTomorrow } from 'date-fns';
import { ar } from 'date-fns/locale';
import PredictionCard from '@/components/PredictionCard';
import { FootballIcon } from '@/components/icons/FootballIcon';
import { cn } from '@/lib/utils';
import {Skeleton} from "@/components/ui/skeleton";
import { setLocalFavorites } from '@/lib/local-favorites';


const CrownedTeamScroller = ({
  crownedTeams,
  onSelectTeam,
  onRemove,
  selectedTeamId,
  navigate,
}: {
  crownedTeams: CrownedTeam[];
  onSelectTeam: (teamId: number) => void;
  onRemove: (teamId: number) => void;
  selectedTeamId: number | null;
  navigate: ScreenProps['navigate'];
}) => {
  if (crownedTeams.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4 px-4">
        <p className="mb-4">
          قم بتتويج فريقك المفضل بالضغط على أيقونة التاج 👑 في صفحة تفاصيل الفريق لتبقى على اطلاع دائم بآخر أخباره ومبارياته هنا.
        </p>
        <Button onClick={() => navigate('AllCompetitions')}>استكشف</Button>
      </div>
    );
  }

  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex w-max space-x-4 px-4 flex-row-reverse">
        {crownedTeams.map(team => (
          <div
            key={team.teamId}
            className="relative flex flex-col items-center gap-1 w-20 text-center cursor-pointer group"
            onClick={() => onSelectTeam(team.teamId)}
          >
            <Avatar className={`h-12 w-12 border-2 ${selectedTeamId === team.teamId ? 'border-primary' : 'border-yellow-400'}`}>
              <AvatarImage src={team.logo} />
              <AvatarFallback>{team.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="text-[11px] font-medium truncate w-full">{team.name}</span>
            <p className="text-[10px] text-muted-foreground truncate w-full">{team.note}</p>
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(team.teamId); }}
              className="absolute top-0 left-0 h-5 w-5 bg-background/80 rounded-full flex items-center justify-center border border-destructive"
            >
              <X className="h-3 w-3 text-destructive"/>
            </button>
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

const TeamFixturesDisplay = ({ teamId, navigate }: { teamId: number; navigate: ScreenProps['navigate'] }) => {
    const [allFixtures, setAllFixtures] = useState<Fixture[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const listRef = useRef<HTMLDivElement>(null);
    const firstUpcomingMatchRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const fetchFixtures = async () => {
            if (!teamId) return;
            setLoading(true);
            try {
                const url = `/api/football/fixtures?team=${teamId}&season=${CURRENT_SEASON}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`API fetch failed with status: ${res.status}`);
                
                const data = await res.json();
                const allFixtures: Fixture[] = data.response || [];
                
                // Sort all fixtures chronologically from oldest to newest
                allFixtures.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
                setAllFixtures(allFixtures);

            } catch (error) {
                console.error("Error fetching fixtures:", error);
                toast({
                    variant: "destructive",
                    title: "خطأ في الشبكة",
                    description: "فشل في جلب المباريات. يرجى التحقق من اتصالك بالإنترنت.",
                });
            } finally {
                setLoading(false);
            }
        };
        fetchFixtures();
    }, [teamId, toast]);

    useEffect(() => {
        if (!loading && allFixtures.length > 0 && listRef.current && firstUpcomingMatchRef.current) {
            // Use a small timeout to ensure the DOM is ready for scrolling
            setTimeout(() => {
                if (firstUpcomingMatchRef.current && listRef.current) {
                    const listTop = listRef.current.offsetTop;
                    const itemTop = firstUpcomingMatchRef.current.offsetTop;
                    // Scroll the list so that the upcoming match is near the top
                    listRef.current.scrollTop = itemTop - listTop - 10;
                }
            }, 100);
        }
    }, [loading, allFixtures]);

    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (allFixtures.length === 0) {
      return (
        <Card className="mt-4">
            <CardContent className="p-6">
                <p className="text-center text-muted-foreground">لا توجد مباريات متاحة لهذا الفريق.</p>
            </CardContent>
        </Card>
      );
    }

    return (
        <div ref={listRef} className="h-full overflow-y-auto space-y-2">
            {allFixtures.map((fixture, index) => {
                 const isUpcomingOrLive = isMatchLive(fixture.fixture.status) || new Date(fixture.fixture.timestamp * 1000) > new Date();
                 const isFirstUpcoming = isUpcomingOrLive && !allFixtures.slice(0, index).some(f => isMatchLive(f.fixture.status) || new Date(f.fixture.timestamp * 1000) > new Date());
                
                return (
                    <div key={fixture.fixture.id} ref={isFirstUpcoming ? firstUpcomingMatchRef : null}>
                        <FixtureItem fixture={fixture} navigate={navigate} />
                    </div>
                );
            })}
        </div>
    );
};

export function IraqScreen({ navigate, goBack, canGoBack, favorites, setFavorites }: ScreenProps & {setFavorites: React.Dispatch<React.SetStateAction<Partial<Favorites> | null>>}) {
  const { user } = useAuth();
  const { db } = useFirestore();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  
  const crownedTeams = useMemo(() => {
    if (!favorites?.crownedTeams) return [];
    return Object.values(favorites.crownedTeams);
  }, [favorites?.crownedTeams]);
  
  useEffect(() => {
    if(crownedTeams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(crownedTeams[0].teamId);
    }
    if (crownedTeams.length === 0) {
      setSelectedTeamId(null);
    }
  }, [crownedTeams, selectedTeamId]);


  const handleRemoveCrowned = (teamId: number) => {
     setFavorites(prev => {
        if (!prev) return null;
        const newFavorites = JSON.parse(JSON.stringify(prev));
        if (newFavorites.crownedTeams?.[teamId]) {
            delete newFavorites.crownedTeams[teamId];
        }

        if (user && db && !user.isAnonymous) {
            const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
            updateDoc(favDocRef, { [`crownedTeams.${teamId}`]: deleteField() }).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: favDocRef.path, operation: 'update', requestResourceData: { [`crownedTeams.${teamId}`]: 'DELETED' } }));
                setFavorites(prev); // Revert on failure
            });
        } else {
            setLocalFavorites(newFavorites);
        }

        return newFavorites;
    });
  };
  
  const handleSelectTeam = (teamId: number) => {
    setSelectedTeamId(teamId);
  }
  
  if (!user) {
    return (
       <div className="flex h-full flex-col bg-background">
          <ScreenHeader title="ملعبي" onBack={goBack} canGoBack={canGoBack} />
           <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Crown className="h-16 w-16 text-muted-foreground mb-4"/>
              <h2 className="text-xl font-bold">ميزة حصرية للمستخدمين المسجلين</h2>
              <p className="text-muted-foreground mb-6">
                قم بتسجيل الدخول لتتويج فرقك وبطولاتك المفضلة.
              </p>
              <Button onClick={() => navigate('Welcome')}>تسجيل الدخول</Button>
           </div>
       </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ScreenHeader
        title="ملعبي"
        onBack={goBack}
        canGoBack={canGoBack}
        actions={
          <div className="flex items-center gap-1">
              <SearchSheet navigate={navigate} favorites={favorites} customNames={{}} setFavorites={setFavorites}>
                  <Button variant="ghost" size="icon">
                      <Search className="h-5 w-5" />
                  </Button>
              </SearchSheet>
              <ProfileButton />
          </div>
        }
      />
      <div className="flex-1 flex flex-col min-h-0">
          <div className="py-4 border-b">
            <CrownedTeamScroller 
              crownedTeams={crownedTeams} 
              onSelectTeam={handleSelectTeam}
              onRemove={handleRemoveCrowned} 
              selectedTeamId={selectedTeamId}
              navigate={navigate}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selectedTeamId ? (
              <TeamFixturesDisplay teamId={selectedTeamId} navigate={navigate} />
            ) : (
              crownedTeams.length > 0 && (
                 <div className="flex items-center justify-center h-full text-muted-foreground text-center p-4">
                  <p>اختر فريقًا من الأعلى لعرض مبارياته.</p>
                </div>
              )
            )}
          </div>
      </div>
    </div>
  );
}

