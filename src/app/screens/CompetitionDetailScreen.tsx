

"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ScreenProps } from '@/app/page';
import { useAdmin, useAuth, useFirestore } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { Star, Pencil, Trash2, Loader2, Crown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { doc, setDoc, updateDoc, deleteField, getDocs, collection, deleteDoc, getDoc } from 'firebase/firestore';
import { RenameDialog } from '@/components/RenameDialog';
import { cn } from '@/lib/utils';
import type { Fixture, Standing, TopScorer, Team, Favorites, CrownedTeam } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { FixtureItem } from '@/components/FixtureItem';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { CURRENT_SEASON } from '@/lib/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hardcodedTranslations } from '@/lib/hardcoded-translations';
import { Card, CardContent } from '@/components/ui/card';
import { getLocalFavorites, setLocalFavorites } from '@/lib/local-favorites';
import { format, isToday } from 'date-fns';
import { ar } from 'date-fns/locale';

// --- Caching Logic ---
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const getCachedData = (key: string) => {
    if (typeof window === 'undefined') return null;
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;
    const item = JSON.parse(itemStr);
    const now = new Date();
    if (now.getTime() > item.expiry) {
        localStorage.removeItem(key);
        return null;
    }
    return item.value;
};

const setCachedData = (key: string, value: any, ttl = CACHE_DURATION_MS) => {
    if (typeof window === 'undefined') return;
    const now = new Date();
    const item = {
        value: value,
        expiry: now.getTime() + ttl,
    };
    localStorage.setItem(key, JSON.stringify(item));
};
// --------------------


type RenameType = 'league' | 'team' | 'player' | 'continent' | 'country' | 'coach' | 'status' | 'crown';
interface RenameState {
  id: string | number;
  name: string;
  note?: string;
  type: RenameType;
  purpose: 'rename' | 'note' | 'crown';
  originalData?: any;
  originalName?: string;
}

function SeasonSelector({ season, onSeasonChange }: { season: number, onSeasonChange: (newSeason: number) => void }) {
    const seasons = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + 3 - i);

    return (
        <div className="flex items-center justify-center gap-2 px-4 pt-2 pb-1 text-xs text-muted-foreground">
            <span>عرض بيانات موسم</span>
            <Select value={String(season)} onValueChange={(value) => onSeasonChange(Number(value))}>
                <SelectTrigger className="w-[100px] h-7 text-xs">
                    <SelectValue placeholder="اختر موسماً" />
                </SelectTrigger>
                <SelectContent>
                    {seasons.map(s => (
                        <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

const CompetitionHeaderCard = ({ league, countryName, teamsCount }: { league: { name?: string, logo?: string }, countryName?: string, teamsCount?: number }) => (
    <Card className="mb-4 overflow-hidden">
        <div className="relative h-24 bg-gradient-to-r from-primary/20 to-accent/20">
             <Avatar className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 h-24 w-24 border-4 border-background p-2 bg-background">
                <AvatarImage src={league.logo} alt={league.name} className="object-contain" />
                <AvatarFallback>{league.name?.charAt(0)}</AvatarFallback>
            </Avatar>
        </div>
        <CardContent className="pt-14 text-center">
            <h1 className="text-xl font-bold">{league.name}</h1>
            <p className="text-muted-foreground">{countryName}</p>
        </CardContent>
    </Card>
);


export function CompetitionDetailScreen({ navigate, goBack, canGoBack, title: initialTitle, leagueId, logo, favorites, customNames, setFavorites }: ScreenProps & { title?: string, leagueId?: number, logo?: string, setFavorites: React.Dispatch<React.SetStateAction<Partial<Favorites>>> }) {
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const { db } = useFirestore();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [displayTitle, setDisplayTitle] = useState(initialTitle);
  
  const [renameItem, setRenameItem] = useState<RenameState | null>(null);
  
  const [isDeleteAlertOpen, setDeleteAlertOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);


  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [topScorers, setTopScorers] = useState<TopScorer[]>([]);
  const [teams, setTeams] = useState<{team: Team}[]>([]);
  const [season, setSeason] = useState<number>(CURRENT_SEASON);
  
  const listRef = useRef<HTMLDivElement>(null);
  const dateRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  
  useEffect(() => {
    let isMounted = true;
    
    const loadInitialData = async () => {
        if (!leagueId) {
            setLoading(false);
            return;
        }

        setLoading(true);

        // Fetch API Data
        const cacheKey = `competition_data_${leagueId}_${season}`;
        const cachedData = getCachedData(cacheKey);

        if (cachedData) {
            setStandings(cachedData.standings || []);
            setTopScorers(cachedData.topScorers || []);
            setTeams(cachedData.teams || []);
            setFixtures(cachedData.fixtures || []);
            setLoading(false);
        } else {
             try {
                const [standingsRes, scorersRes, teamsRes, fixturesRes] = await Promise.all([
                    fetch(`/api/football/standings?league=${leagueId}&season=${season}`),
                    fetch(`/api/football/players/topscorers?league=${leagueId}&season=${season}`),
                    fetch(`/api/football/teams?league=${leagueId}&season=${season}`),
                    fetch(`/api/football/fixtures?league=${leagueId}&season=${season}`)
                ]);

                if (!isMounted) return;

                const standingsData = await standingsRes.json();
                const scorersData = await scorersRes.json();
                const teamsData = await teamsRes.json();
                const fixturesData = await fixturesRes.json();

                const newStandings = standingsData.response[0]?.league?.standings[0] || [];
                const newTopScorers = scorersData.response || [];
                const newTeams = teamsData.response || [];
                const sortedFixtures = [...(fixturesData.response || [])].sort((a:Fixture,b:Fixture) => a.fixture.timestamp - b.fixture.timestamp);

                setStandings(newStandings);
                setTopScorers(newTopScorers);
                setTeams(newTeams);
                setFixtures(sortedFixtures);

                setCachedData(cacheKey, {
                    standings: newStandings,
                    topScorers: newTopScorers,
                    teams: newTeams,
                    fixtures: sortedFixtures,
                });
            } catch(e) {
                 console.error("Failed to fetch competition details:", e);
                if(isMounted) toast({ variant: 'destructive', title: 'خطأ', description: 'فشل في تحميل بيانات البطولة.' });
            } finally {
                if (isMounted) setLoading(false);
            }
        }
    };

    loadInitialData();

    return () => {
        isMounted = false;
    };
}, [leagueId, season, db, user, toast]);

const getDisplayName = useCallback((type: 'team' | 'player' | 'league', id: number, defaultName: string) => {
    if (!customNames || !id) return defaultName;
    const key = `${type}s` as 'teams' | 'players' | 'leagues';
    const map = customNames[key] as Map<number, string>;
    const customName = map?.get(id);
    if(customName) return customName;
    
    const hardcodedName = hardcodedTranslations[key]?.[id];
    if (hardcodedName) return hardcodedName;

    return defaultName;
  }, [customNames]);
  
  useEffect(() => {
    if(leagueId && initialTitle) {
        setDisplayTitle(getDisplayName('league', leagueId, initialTitle));
    }
  }, [customNames, leagueId, initialTitle, getDisplayName]);


  const groupedFixtures = useMemo(() => {
    return fixtures.reduce((acc, fixture) => {
        const date = format(new Date(fixture.fixture.timestamp * 1000), 'yyyy-MM-dd');
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(fixture);
        return acc;
    }, {} as Record<string, Fixture[]>);
  }, [fixtures]);

  useEffect(() => {
    if (loading || Object.keys(groupedFixtures).length === 0) return;

    const sortedDates = Object.keys(groupedFixtures).sort();
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
    let targetDate = sortedDates.find(date => date >= todayStr);
    
    if (!targetDate && sortedDates.length > 0) {
        targetDate = sortedDates[sortedDates.length - 1];
    }
    
    if (targetDate && listRef.current && dateRefs.current[targetDate]) {
        const list = listRef.current;
        const element = dateRefs.current[targetDate];
        if (element) {
             setTimeout(() => {
                const listTop = list.offsetTop;
                const elementTop = element.offsetTop;
                list.scrollTop = elementTop - listTop;
            }, 100);
        }
    }
}, [loading, groupedFixtures]);
  
    const handleFavoriteToggle = useCallback((team: Team) => {
        if (!setFavorites) return;
        const itemId = team.id;
        const itemType = 'teams';

        setFavorites(prev => {
            const newFavorites = JSON.parse(JSON.stringify(prev || {}));
            const isCurrentlyFavorited = !!newFavorites[itemType]?.[itemId];
            if (!newFavorites[itemType]) newFavorites[itemType] = {};

            if (isCurrentlyFavorited) {
                delete newFavorites[itemType][itemId];
            } else {
                newFavorites[itemType][itemId] = { teamId: itemId, name: team.name, logo: team.logo, type: team.national ? 'National' : 'Club' };
            }

            if (user && db && !user.isAnonymous) {
                const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
                const updateData = { [`${itemType}.${itemId}`]: isCurrentlyFavorited ? deleteField() : newFavorites[itemType][itemId] };
                setDoc(favDocRef, updateData, { merge: true }).catch(err => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: favDocRef.path, operation: 'update', requestResourceData: updateData }));
                });
            } else {
                setLocalFavorites(newFavorites);
            }
            return newFavorites;
        });
    }, [user, db, setFavorites]);

  const handleOpenCrownDialog = (team: Team) => {
    if (!user) {
        toast({ title: 'مستخدم زائر', description: 'يرجى تسجيل الدخول لاستخدام هذه الميزة.' });
        return;
    }
    setRenameItem({
        id: team.id,
        name: getDisplayName('team', team.id, team.name),
        type: 'crown',
        purpose: 'crown',
        originalData: team,
        note: favorites?.crownedTeams?.[team.id]?.note || '',
    });
  };
  
  const handleOpenRename = (type: RenameType, id: number, originalData: any) => {
    if (!isAdmin) return;
    if (type === 'team') {
        const currentName = getDisplayName('team', id, originalData.name);
        setRenameItem({ id, name: currentName, type, purpose: 'rename', originalData, originalName: originalData.name });
    } else if (type === 'player') {
        const currentName = getDisplayName('player', id, originalData.name);
        setRenameItem({ id, name: currentName, type, purpose: 'rename', originalData, originalName: originalData.name });
    } else if (type === 'league' && leagueId) {
        setRenameItem({ type: 'league', id: leagueId, name: displayTitle || '', purpose: 'rename', originalData: {name: initialTitle}, originalName: initialTitle });
    }
  };

  const handleSaveRenameOrNote = (type: RenameType, id: string | number, newName: string, newNote: string = '') => {
        if (!renameItem || !db) return;
        const { purpose, originalData, originalName } = renameItem;

        if (purpose === 'rename' && isAdmin) {
            const collectionName = `${type}Customizations`;
            const docRef = doc(db, collectionName, String(id));
            const data = { customName: newName };

            const op = (newName && newName.trim() && newName !== originalName)
                ? setDoc(docRef, data)
                : deleteDoc(docRef);

            op.catch(serverError => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'write', requestResourceData: data }));
            });

        } else if (purpose === 'crown' && user && setFavorites) {
            const teamId = Number(id);
            setFavorites(prev => {
                const newFavorites = JSON.parse(JSON.stringify(prev || {}));
                if (!newFavorites.crownedTeams) newFavorites.crownedTeams = {};
                const isCurrentlyCrowned = !!newFavorites.crownedTeams?.[teamId];

                if (isCurrentlyCrowned) {
                    delete newFavorites.crownedTeams[teamId];
                } else {
                     newFavorites.crownedTeams[teamId] = { teamId, name: originalData.name, logo: originalData.logo, note: newNote };
                }

                if (db && !user.isAnonymous) {
                    const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
                    const updateData = { [`crownedTeams.${teamId}`]: newFavorites.crownedTeams[teamId] || deleteField()};
                    setDoc(favDocRef, updateData, { merge: true }).catch(serverError => {
                        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: favDocRef.path, operation: 'update', requestResourceData: updateData }));
                    });
                } else {
                    setLocalFavorites(newFavorites);
                }
                return newFavorites;
            });
        }
        setRenameItem(null);
  };

  const handleDeleteCompetition = () => {
    if (!isAdmin || !db || !leagueId) return;
    setIsDeleting(true);
    const docRef = doc(db, 'managedCompetitions', String(leagueId));

    deleteDoc(docRef)
      .then(() => {
        toast({ title: "نجاح", description: "تم حذف البطولة بنجاح." });
        goBack();
      })
      .catch(serverError => {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsDeleting(false);
        setDeleteAlertOpen(false);
      });
  }

  const secondaryActions = (
    <div className="flex items-center gap-1">
      {isAdmin && leagueId && (
        <>
            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
                <AlertDialogTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); setDeleteAlertOpen(true); }}
                    >
                        <Trash2 className="h-5 w-5 text-destructive" />
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                        <AlertDialogDescription>
                           سيتم حذف هذه البطولة من قائمة البطولات المدارة.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={handleDeleteCompetition}
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => handleOpenRename('league', leagueId, {name: initialTitle})}
            >
                <Pencil className="h-5 w-5" />
            </Button>
        </>
      )}
    </div>
  );

  const sortedFixtureDates = Object.keys(groupedFixtures).sort();
  
  if (!favorites || !customNames) {
      return (
        <div className="flex h-full flex-col bg-background">
          <ScreenHeader title={""} onBack={goBack} canGoBack={canGoBack} />
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ScreenHeader title={""} onBack={goBack} canGoBack={canGoBack} actions={secondaryActions} />
      {renameItem && <RenameDialog 
          isOpen={!!renameItem}
          onOpenChange={(isOpen) => !isOpen && setRenameItem(null)}
          item={renameItem}
          onSave={(type, id, name, note) => handleSaveRenameOrNote(type, Number(id), name, note || '')}
        />}
       <div className="flex-1 overflow-y-auto p-1">
        <CompetitionHeaderCard league={{ name: displayTitle, logo }} teamsCount={teams.length} />
        <Tabs defaultValue="matches" className="w-full">
           <div className="sticky top-0 bg-background z-10 px-1 pt-1">
             <div className="bg-card rounded-b-lg border-x border-b shadow-md">
              <SeasonSelector season={season} onSeasonChange={setSeason} />
              <TabsList className="grid w-full grid-cols-4 rounded-none h-12 p-0 bg-transparent">
                <TabsTrigger value="matches">المباريات</TabsTrigger>
                <TabsTrigger value="standings">الترتيب</TabsTrigger>
                <TabsTrigger value="scorers">الهدافين</TabsTrigger>
                <TabsTrigger value="teams">الفرق</TabsTrigger>
              </TabsList>
             </div>
          </div>
          <TabsContent value="matches" className="p-0 mt-0">
             <div ref={listRef} className="max-h-[60vh] overflow-y-auto space-y-4 pt-2">
                {loading ? (
                    <div className="space-y-4 p-4">
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                    </div>
                ) : sortedFixtureDates.length > 0 ? (
                    sortedFixtureDates.map(date => (
                        <div key={date} ref={el => dateRefs.current[date] = el}>
                            <h3 className="font-bold text-center text-sm text-muted-foreground my-2">
                                {format(new Date(date), 'EEEE, d MMMM yyyy', { locale: ar })}
                            </h3>
                            <div className="space-y-2 px-1">
                                {groupedFixtures[date].map(fixture => (
                                    <FixtureItem key={fixture.fixture.id} fixture={fixture} navigate={navigate} />
                                ))}
                            </div>
                        </div>
                    ))
                ) : <p className="pt-4 text-center text-muted-foreground">لا توجد مباريات لهذا الموسم.</p>}
             </div>
          </TabsContent>
          <TabsContent value="standings" className="p-0 mt-0">
            {loading ? (
                 <div className="space-y-px p-4">
                    {Array.from({ length: 18 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
            ) : standings.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="text-center">نقاط</TableHead>
                            <TableHead className="text-center">خ</TableHead>
                            <TableHead className="text-center">ت</TableHead>
                            <TableHead className="text-center">ف</TableHead>
                            <TableHead className="text-center">لعب</TableHead>
                            <TableHead>الفريق</TableHead>
                            <TableHead className="w-[40px] text-right px-2">#</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {standings.map((s) => {
                            if (!s.team?.id) return null;
                            const displayName = getDisplayName('team', s.team.id, s.team.name);
                            return (
                            <TableRow key={s.team.id} className="cursor-pointer" onClick={() => navigate('TeamDetails', { teamId: s.team.id, leagueId: leagueId })}>
                                <TableCell className="text-center font-bold">{s.points}</TableCell>
                                <TableCell className="text-center">{s.all.lose}</TableCell>
                                <TableCell className="text-center">{s.all.draw}</TableCell>
                                <TableCell className="text-center">{s.all.win}</TableCell>
                                <TableCell className="text-center">{s.all.played}</TableCell>
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2 justify-end">
                                        <p className="truncate">{displayName}</p>
                                        <Avatar className="h-6 w-6">
                                            <AvatarImage src={s.team.logo} alt={s.team.name} />
                                            <AvatarFallback>{s.team.name.substring(0,1)}</AvatarFallback>
                                        </Avatar>
                                    </div>
                                </TableCell>
                                <TableCell className="font-bold px-2">{s.rank}</TableCell>
                            </TableRow>
                        )})}
                    </TableBody>
                </Table>
            ): <p className="pt-4 text-center text-muted-foreground">الترتيب غير متاح حالياً.</p>}
          </TabsContent>
           <TabsContent value="scorers" className="p-0 mt-0">
            {loading ? (
                <div className="space-y-px p-4">
                    {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
            ) : topScorers.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="text-center w-12">الأهداف</TableHead>
                            <TableHead>اللاعب</TableHead>
                            <TableHead className="w-8 text-right px-2">#</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {topScorers.map((scorer, index) => {
                            if (!scorer?.player?.id) return null;
                            const displayName = getDisplayName('player', scorer.player.id, scorer.player.name);
                            const teamName = getDisplayName('team', scorer.statistics[0]?.team.id, scorer.statistics[0]?.team.name);
                            return (
                                <TableRow key={scorer.player.id} className="cursor-pointer" onClick={() => navigate('PlayerDetails', { playerId: scorer.player.id })}>
                                    <TableCell className="font-bold text-lg text-center">{scorer.statistics[0]?.goals.total}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-3 justify-end">
                                            <div>
                                                <p className="font-semibold truncate text-right">{displayName}</p>
                                                <p className="text-xs text-muted-foreground truncate text-right">{teamName}</p>
                                            </div>
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={scorer.player.photo} alt={scorer.player.name} />
                                                <AvatarFallback>{scorer.player.name.substring(0, 2)}</AvatarFallback>
                                            </Avatar>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-bold text-right px-2">{index + 1}</TableCell>
                                </TableRow>
                            )})}
                    </TableBody>
                </Table>
            ) : <p className="pt-4 text-center text-muted-foreground">قائمة الهدافين غير متاحة.</p>}
          </TabsContent>
          <TabsContent value="teams" className="mt-0">
            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4">
                            <Skeleton className="h-16 w-16 rounded-full" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    ))}
                </div>
            ) : teams.length > 0 ? (
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
                    {teams.map((teamData) => {
                        if (!teamData || !teamData.team) return null;
                        const { team } = teamData;
                        const displayName = getDisplayName('team', team.id, team.name);
                        const isFavoritedTeam = !!favorites?.teams?.[team.id];
                        const isCrowned = !!favorites.crownedTeams?.[team.id];
                        
                        return (
                        <div key={team.id} className="relative flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center cursor-pointer" onClick={() => navigate('TeamDetails', { teamId: team.id, leagueId: leagueId })}>
                             <Avatar className="h-16 w-16">
                                <AvatarImage src={team.logo} alt={team.name} />
                                <AvatarFallback>{team.name.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            {isAdmin && <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpenRename('team', team.id, team) }}>
                                <Pencil className="h-4 w-4"/>
                            </Button>}
                            <span className="font-semibold text-sm">
                                {displayName}
                            </span>
                            <div className="absolute top-1 left-1 flex flex-col gap-0.5">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleFavoriteToggle(team); }}>
                                    <Star className={cn("h-5 w-5", isFavoritedTeam ? "text-yellow-400 fill-current" : "text-muted-foreground/50")} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpenCrownDialog(team); }}>
                                    <Crown className={cn("h-5 w-5", isCrowned ? "text-yellow-400 fill-current" : "text-muted-foreground/50")} />
                                </Button>
                            </div>
                        </div>
                    )})}
                </div>
            ) : <p className="pt-4 text-center text-muted-foreground">الفرق غير متاحة.</p>}
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}



    