

"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ScreenProps } from '@/app/page';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAdmin, useAuth, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, collection, getDocs, updateDoc, deleteField, writeBatch, deleteDoc, onSnapshot } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { Loader2, Pencil, Shirt, Star, Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { RenameDialog } from '@/components/RenameDialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Team, Player, Fixture, Standing, TeamStatistics, Favorites, AdminFavorite, CrownedTeam, PredictionMatch } from '@/lib/types';
import { CURRENT_SEASON } from '@/lib/constants';
import { FixtureItem } from '@/components/FixtureItem';
import { Skeleton } from '@/components/ui/skeleton';
import { hardcodedTranslations } from '@/lib/hardcoded-translations';
import { isMatchLive } from '@/lib/matchStatus';
import { getLocalFavorites, setLocalFavorites } from '@/lib/local-favorites';

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


interface TeamData {
    team: Team;
    venue: {
        id: number;
        name: string;
        address: string;
        city: string;
        capacity: number;
        surface: string;
        image: string;
    };
}

const TeamHeader = ({ team, venue, onStar, isStarred, onCrown, isCrowned, isAdmin, onRename }: { team: Team, venue: TeamData['venue'], onStar: () => void, isStarred: boolean, onCrown: () => void, isCrowned: boolean, isAdmin: boolean, onRename: () => void }) => {
    return (
        <Card className="mb-4 overflow-hidden">
            <div className="relative h-24 bg-gradient-to-r from-primary/20 to-accent/20" style={{backgroundImage: `url(${venue?.image})`, backgroundSize: 'cover', backgroundPosition: 'center'}}>
                <div className="absolute inset-0 bg-black/50" />
                 <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/20 hover:bg-black/40" onClick={onStar}>
                        <Star className={cn("h-5 w-5", isStarred ? "text-yellow-400 fill-current" : "text-white/80")} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/20 hover:bg-black/40" onClick={onCrown}>
                        <Crown className={cn("h-5 w-5", isCrowned ? "text-yellow-400 fill-current" : "text-white/80")} />
                    </Button>
                     {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/20 hover:bg-black/40" onClick={onRename}>
                            <Pencil className="h-4 w-4 text-white/80" />
                        </Button>
                    )}
                </div>
            </div>
            <CardContent className="pt-2 pb-4 text-center relative flex flex-col items-center">
                 <div className="relative -mt-12 mb-2">
                    <Avatar className="h-20 w-20 border-4 border-background">
                        <AvatarImage src={team.logo} alt={team.name} />
                        <AvatarFallback>{team.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                </div>
                <h1 className="text-2xl font-bold">{team.name}</h1>
                <p className="text-muted-foreground">{venue?.name}</p>
            </CardContent>
        </Card>
    );
};

const TeamPlayersTab = ({ teamId, navigate }: { teamId: number, navigate: ScreenProps['navigate'] }) => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const { isAdmin } = useAdmin();
    const { toast } = useToast();
    const { db } = useFirestore();
    const [customNames, setCustomNames] = useState<Map<number, string>>(new Map());
    const [renameItem, setRenameItem] = useState<{ id: number, name: string, originalName: string } | null>(null);

    const getDisplayName = useCallback((id: number, defaultName: string) => {
        const customName = customNames.get(id);
        if (customName) return customName;
        return hardcodedTranslations.players[id] || defaultName;
    }, [customNames]);

     const fetchCustomNames = useCallback(async () => {
        if (!db) return;
        try {
            const snapshot = await getDocs(collection(db, 'playerCustomizations'));
            const names = new Map<number, string>();
            snapshot.forEach(doc => names.set(Number(doc.id), doc.data().customName));
            setCustomNames(names);
        } catch (error) {
            // Non-admins might not have access, which is fine.
            console.warn("Could not fetch player customizations.");
        }
    }, [db]);

    useEffect(() => {
        const fetchPlayers = async () => {
            setLoading(true);
            await fetchCustomNames();
            const cacheKey = `team_players_${teamId}_${CURRENT_SEASON}`;
            const cachedPlayers = getCachedData(cacheKey);

            if (cachedPlayers) {
                setPlayers(cachedPlayers);
                setLoading(false);
                return;
            }

            try {
                const res = await fetch(`/api/football/players?team=${teamId}&season=${CURRENT_SEASON}`);
                const data = await res.json();
                if (data.response) {
                    const fetchedPlayers = data.response.map((p: any) => p.player);
                    setPlayers(fetchedPlayers);
                    setCachedData(cacheKey, fetchedPlayers);
                }
            } catch (error) {
                toast({ variant: 'destructive', title: "خطأ", description: "فشل في جلب قائمة اللاعبين." });
            } finally {
                setLoading(false);
            }
        };
        fetchPlayers();
    }, [teamId, toast, fetchCustomNames]);

    const handleSaveRename = (type: string, id: number, newName: string, originalName: string) => {
        if (!renameItem || !db) return;
        const docRef = doc(db, 'playerCustomizations', String(id));
        
        if (newName && newName !== originalName) {
            const data = { customName: newName };
            setDoc(docRef, data).then(() => {
                fetchCustomNames();
                toast({ title: "نجاح", description: "تم تحديث اسم اللاعب." });
            }).catch(serverError => {
                const permissionError = new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'create',
                    requestResourceData: data
                });
                errorEmitter.emit('permission-error', permissionError);
            });
        }
         setRenameItem(null);
    };


    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }
    
    return (
        <div className="space-y-2">
            {renameItem && <RenameDialog isOpen={!!renameItem} onOpenChange={(isOpen) => !isOpen && setRenameItem(null)} item={{...renameItem, type: 'player', purpose: 'rename'}} onSave={(type, id, name) => handleSaveRename(type as 'player', Number(id), name, renameItem.originalName)} />}
            {players.map(player => {
                if (!player?.id) return null;
                return (
                <Card key={player.id} className="p-2">
                    <div className="flex items-center gap-3">
                         <div className="flex-1 flex items-center gap-3 cursor-pointer" onClick={() => navigate('PlayerDetails', { playerId: player.id })}>
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={player.photo} />
                                <AvatarFallback>{player.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-semibold">{getDisplayName(player.id, player.name)}</p>
                                <p className="text-xs text-muted-foreground">{player.position}</p>
                            </div>
                        </div>
                        {player.number && (
                           <div className="relative flex items-center justify-center text-primary-foreground">
                               <Shirt className="h-10 w-10 text-primary bg-primary p-1 rounded-md" />
                               <span className="absolute text-xs font-bold">{player.number}</span>
                           </div>
                        )}
                        {isAdmin && (
                            <Button variant="ghost" size="icon" onClick={() => setRenameItem({ id: player.id, name: getDisplayName(player.id, player.name), originalName: player.name })}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </Card>
            )})}
        </div>
    );
};

const TeamDetailsTabs = ({ teamId, navigate, onPinToggle, pinnedPredictionMatches, isAdmin }: { teamId: number, navigate: ScreenProps['navigate'], onPinToggle: (fixture: Fixture) => void, pinnedPredictionMatches: Set<number>, isAdmin: boolean }) => {
    const [fixtures, setFixtures] = useState<Fixture[]>([]);
    const [standings, setStandings] = useState<Standing[]>([]);
    const [stats, setStats] = useState<TeamStatistics | null>(null);
    const [loading, setLoading] = useState(true);
    const { db } = useFirestore();
    const [customNames, setCustomNames] = useState<{leagues: Map<number, string>, teams: Map<number, string>} | null>(null);

    const fixturesListRef = useRef<HTMLDivElement>(null);
    const firstUpcomingMatchRef = useRef<HTMLDivElement>(null);


     const fetchAllCustomNames = useCallback(async () => {
        if (!db) {
            setCustomNames({ leagues: new Map(), teams: new Map() });
            return;
        }
        try {
            const [leaguesSnapshot, teamsSnapshot] = await Promise.all([
                getDocs(collection(db, 'leagueCustomizations')),
                getDocs(collection(db, 'teamCustomizations'))
            ]);
            
            const leagueNames = new Map<number, string>();
            leaguesSnapshot?.forEach(doc => leagueNames.set(Number(doc.id), doc.data().customName));
            
            const teamNames = new Map<number, string>();
            teamsSnapshot?.forEach(doc => teamNames.set(Number(doc.id), doc.data().customName));
            
            setCustomNames({ leagues: leagueNames, teams: teamNames });
        } catch(error) {
             console.warn("Could not fetch custom names, this is expected for non-admins", error);
             setCustomNames({ leagues: new Map(), teams: new Map() });
        }
    }, [db]);
    
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            await fetchAllCustomNames();
            try {
                const [fixturesRes, statsRes] = await Promise.all([
                    fetch(`/api/football/fixtures?team=${teamId}&season=${CURRENT_SEASON}`),
                    fetch(`/api/football/teams/statistics?team=${teamId}&season=${CURRENT_SEASON}`)
                ]);

                const fixturesData = await fixturesRes.json();
                const statsData = await statsRes.json();
                
                const sortedFixtures = (fixturesData.response || []).sort((a: Fixture, b: Fixture) => a.fixture.timestamp - b.fixture.timestamp);
                setFixtures(sortedFixtures);
                setStats(statsData.response);

                const leagueId = sortedFixtures[0]?.league?.id || statsData?.response?.league?.id;

                if (leagueId) {
                    const standingsRes = await fetch(`/api/football/standings?league=${leagueId}&season=${CURRENT_SEASON}`);
                    const standingsData = await standingsRes.json();
                    setStandings(standingsData.response?.[0]?.league?.standings?.[0] || []);
                }

            } catch (error) {
                console.error("Error fetching team details tabs:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [teamId, fetchAllCustomNames]);

    useEffect(() => {
        if (!loading && fixtures.length > 0 && fixturesListRef.current) {
            const firstUpcomingIndex = fixtures.findIndex(f => isMatchLive(f.fixture.status) || new Date(f.fixture.timestamp * 1000) > new Date());
            if (firstUpcomingIndex !== -1 && firstUpcomingMatchRef.current) {
                setTimeout(() => {
                    if (firstUpcomingMatchRef.current && fixturesListRef.current) {
                        const listTop = fixturesListRef.current.offsetTop;
                        const itemTop = firstUpcomingMatchRef.current.offsetTop;
                        fixturesListRef.current.scrollTop = itemTop - listTop - 10;
                    }
                }, 100);
            }
        }
    }, [loading, fixtures]);

    const getDisplayName = useCallback((type: 'team' | 'league', id: number, defaultName: string) => {
        if (!customNames) return defaultName;
        const key = `${type}s` as 'teams' | 'leagues';
        const firestoreMap = customNames[key];
        const customName = firestoreMap.get(id);
        if (customName) return customName;

        const hardcodedMap = hardcodedTranslations[key];
        const hardcodedName = hardcodedMap[id as any];
        if (hardcodedName) return hardcodedName;

        return defaultName;
    }, [customNames]);
    
    
    if (loading || customNames === null) {
         return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    const processedFixtures = fixtures.map(fixture => ({
        ...fixture,
        league: {
            ...fixture.league,
            name: getDisplayName('league', fixture.league.id, fixture.league.name),
        },
        teams: {
            home: { ...fixture.teams.home, name: getDisplayName('team', fixture.teams.home.id, fixture.teams.home.name) },
            away: { ...fixture.teams.away, name: getDisplayName('team', fixture.teams.away.id, fixture.teams.away.name) },
        }
    }));

     const processedStandings = standings.map(s => ({
        ...s,
        team: {
            ...s.team,
            name: getDisplayName('team', s.team.id, s.team.name),
        }
    }));


    return (
        <Tabs defaultValue="matches" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="matches">المباريات</TabsTrigger>
                <TabsTrigger value="standings">الترتيب</TabsTrigger>
                <TabsTrigger value="stats">الإحصائيات</TabsTrigger>
            </TabsList>
            <TabsContent value="matches" className="mt-4">
                <div ref={fixturesListRef} className="h-full overflow-y-auto space-y-3">
                    {processedFixtures.length > 0 ? processedFixtures.map((fixture, index) => {
                        const isUpcomingOrLive = isMatchLive(fixture.fixture.status) || new Date(fixture.fixture.timestamp * 1000) > new Date();
                        const isFirstUpcoming = isUpcomingOrLive && !processedFixtures.slice(0, index).some(f => isMatchLive(f.fixture.status) || new Date(f.fixture.timestamp * 1000) > new Date());
                        return (
                            <div key={fixture.fixture.id} ref={isFirstUpcoming ? firstUpcomingMatchRef : null}>
                                <FixtureItem 
                                    fixture={fixture} 
                                    navigate={navigate} 
                                    isPinnedForPrediction={pinnedPredictionMatches.has(fixture.fixture.id)}
                                    onPinToggle={onPinToggle}
                                    isAdmin={isAdmin}
                                />
                            </div>
                        )
                    }) : <p className="text-center text-muted-foreground p-8">لا توجد مباريات متاحة.</p>}
                </div>
            </TabsContent>
            <TabsContent value="standings" className="mt-4">
                 {processedStandings.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-center font-bold">نقاط</TableHead>
                                <TableHead className="text-center">خ</TableHead>
                                <TableHead className="text-center">ت</TableHead>
                                <TableHead className="text-center">ف</TableHead>
                                <TableHead className="text-center">لعب</TableHead>
                                <TableHead>الفريق</TableHead>
                                <TableHead className="w-[40px] text-right px-2">#</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {processedStandings.map(s => {
                                if (!s.team?.id) return null;
                                return (
                                <TableRow key={s.team.id} className={cn(s.team.id === teamId && 'bg-primary/10')}>
                                    <TableCell className="text-center font-bold">{s.points}</TableCell>
                                    <TableCell className="text-center">{s.all.lose}</TableCell>
                                    <TableCell className="text-center">{s.all.draw}</TableCell>
                                    <TableCell className="text-center">{s.all.win}</TableCell>
                                    <TableCell className="text-center">{s.all.played}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 justify-end">
                                            <p className="font-semibold truncate">{s.team.name}</p>
                                            <Avatar className="h-6 w-6"><AvatarImage src={s.team.logo} /></Avatar>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-bold px-2">{s.rank}</TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                    </Table>
                ) : <p className="text-center text-muted-foreground p-8">الترتيب غير متاح.</p>}
            </TabsContent>
            <TabsContent value="stats" className="mt-4">
                 {stats && stats.league ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>إحصائيات موسم {stats.league.season || CURRENT_SEASON}</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="grid grid-cols-2 gap-4 text-center">
                                 <div className="p-4 bg-card-foreground/5 rounded-lg">
                                    <p className="font-bold text-2xl">{stats.fixtures?.played?.total || 0}</p>
                                    <p className="text-sm text-muted-foreground">مباريات</p>
                                 </div>
                                  <div className="p-4 bg-card-foreground/5 rounded-lg">
                                    <p className="font-bold text-2xl">{stats.fixtures?.wins?.total || 0}</p>
                                    <p className="text-sm text-muted-foreground">فوز</p>
                                 </div>
                                  <div className="p-4 bg-card-foreground/5 rounded-lg">
                                    <p className="font-bold text-2xl">{stats.fixtures?.draws?.total || 0}</p>
                                    <p className="text-sm text-muted-foreground">تعادل</p>
                                 </div>
                                  <div className="p-4 bg-card-foreground/5 rounded-lg">
                                    <p className="font-bold text-2xl">{stats.fixtures?.loses?.total || 0}</p>
                                    <p className="text-sm text-muted-foreground">خسارة</p>
                                 </div>
                                  <div className="p-4 bg-card-foreground/5 rounded-lg col-span-2">
                                    <p className="font-bold text-2xl">{stats.goals?.for?.total?.total || 0}</p>
                                    <p className="text-sm text-muted-foreground">أهداف</p>
                                 </div>
                             </div>
                        </CardContent>
                    </Card>
                ) : <p className="text-center text-muted-foreground p-8">الإحصائيات غير متاحة.</p>}
            </TabsContent>
        </Tabs>
    );
};


export function TeamDetailScreen({ navigate, goBack, canGoBack, teamId }: ScreenProps & { teamId: number }) {
    const { user, db } = useAuth();
    const { isAdmin } = useAdmin();
    const { toast } = useToast();
    const [displayTitle, setDisplayTitle] = useState<string | undefined>(undefined);
    const [teamData, setTeamData] = useState<TeamData | null>(null);
    const [loading, setLoading] = useState(true);
    const [renameItem, setRenameItem] = useState<{ id: number; name: string; note?: string; type: 'team' | 'crown'; purpose: 'rename' | 'crown' | 'note'; originalData: any; } | null>(null);
    const [favorites, setFavorites] = useState<Partial<Favorites>>({});
    const [pinnedPredictionMatches, setPinnedPredictionMatches] = useState(new Set<number>());

    const [activeTab, setActiveTab] = useState('details');

    useEffect(() => {
        if (!db) return;
        const q = collection(db, "predictionFixtures");
        const unsub = onSnapshot(q, (snapshot) => {
            const newPinnedSet = new Set<number>();
            snapshot.forEach(doc => newPinnedSet.add(Number(doc.id)));
            setPinnedPredictionMatches(newPinnedSet);
        });
        return () => unsub();
    }, [db]);

    const handlePinToggle = useCallback((fixture: Fixture) => {
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


    useEffect(() => {
        if (!teamId) return;

        const getTeamInfo = async () => {
            setLoading(true);
            const cacheKey = `team_data_${teamId}`;
            const cached = getCachedData(cacheKey);

            if(cached) {
                setTeamData(cached);
                const name = cached.team.name;
                let finalName = hardcodedTranslations.teams[teamId as any] || name;
                 if (db) {
                    const customNameDocRef = doc(db, "teamCustomizations", String(teamId));
                    try {
                        const customNameDocSnap = await getDoc(customNameDocRef);
                        if (customNameDocSnap.exists()) {
                            finalName = customNameDocSnap.data().customName;
                        }
                    } catch {}
                }
                setDisplayTitle(finalName);
                setLoading(false);
                return;
            }

            try {
                const teamRes = await fetch(`/api/football/teams?id=${teamId}`);
                if (!teamRes.ok) throw new Error("Team API fetch failed");
                
                const data = await teamRes.json();
                if (data.response?.[0]) {
                    const teamInfo = data.response[0];
                    setTeamData(teamInfo);
                    setCachedData(cacheKey, teamInfo);

                    const name = teamInfo.team.name;
                    let finalName = hardcodedTranslations.teams[teamId as any] || name;

                    if (db) {
                        const customNameDocRef = doc(db, "teamCustomizations", String(teamId));
                        try {
                            const customNameDocSnap = await getDoc(customNameDocRef);
                            if (customNameDocSnap.exists()) {
                                finalName = customNameDocSnap.data().customName;
                            }
                        } catch (error) {
                            // Non-admin may not have access, that's fine.
                        }
                    }
                    setDisplayTitle(finalName);
                } else {
                     throw new Error("Team not found in API response");
                }
            } catch (error) {
                console.error("Error fetching team info:", error);
                toast({ variant: 'destructive', title: 'خطأ', description: 'فشل في تحميل بيانات الفريق.' });
            } finally {
                setLoading(false);
            }
        };
        
        getTeamInfo();
        
    }, [db, teamId, toast]);
      
    useEffect(() => {
        let unsubscribe: (() => void) | null = null;
        const handleLocalFavoritesChange = () => {
            setFavorites(getLocalFavorites());
        };

        if (user && db && !user.isAnonymous) {
            const favoritesRef = doc(db, 'users', user.uid, 'favorites', 'data');
            unsubscribe = onSnapshot(favoritesRef, (docSnap) => {
                setFavorites(docSnap.exists() ? (docSnap.data() as Favorites) : {});
            });
            window.removeEventListener('localFavoritesChanged', handleLocalFavoritesChange);
        } else {
            setFavorites(getLocalFavorites());
            window.addEventListener('localFavoritesChanged', handleLocalFavoritesChange);
        }

        return () => {
            if (unsubscribe) unsubscribe();
            window.removeEventListener('localFavoritesChanged', handleLocalFavoritesChange);
        };
    }, [user, db]);

    const handleFavoriteToggle = () => {
        if (!teamData) return;
        const { team } = teamData;
        const teamNameForFavorite = teamData.team.name;
        
        setFavorites(prev => {
            const newFavs = JSON.parse(JSON.stringify(prev));
            if (!newFavs.teams) newFavs.teams = {};
            if (newFavs.teams[team.id]) {
                delete newFavs.teams[team.id];
            } else {
                newFavs.teams[team.id] = { teamId: team.id, name: teamNameForFavorite, logo: team.logo, type: team.national ? 'National' : 'Club' };
            }
            
            if (!user || user.isAnonymous) {
                setLocalFavorites(newFavs);
            }
            
            return newFavs;
        });

        if (user && !user.isAnonymous && db) {
            const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
            const fieldPath = `teams.${team.id}`;
            const isFavorited = !!favorites.teams?.[team.id];
            
            const updateData = isFavorited 
                ? { [fieldPath]: deleteField() } 
                : { [fieldPath]: { teamId: team.id, name: teamNameForFavorite, logo: team.logo, type: team.national ? 'National' : 'Club' } };
        
            setDoc(favDocRef, updateData, { merge: true }).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: favDocRef.path, operation: 'update', requestResourceData: updateData }));
            });
        }
    };

    const handleOpenCrownDialog = () => {
        if (!teamData) return;
        if (!user || user.isAnonymous) {
            toast({ title: 'مستخدم زائر', description: 'يرجى تسجيل الدخول لاستخدام هذه الميزة.' });
            return;
        }
        const { team } = teamData;
        const currentNote = favorites?.crownedTeams?.[team.id]?.note || '';
        setRenameItem({
            id: team.id,
            name: displayTitle || team.name,
            type: 'crown',
            purpose: 'crown',
            originalData: team,
            note: currentNote,
        });
    };

    const handleRename = () => {
        if (!teamData) return;
        const { team } = teamData;
        setRenameItem({
            id: team.id,
            name: displayTitle || team.name,
            type: 'team',
            purpose: 'rename',
            originalData: team,
        });
    };

    const handleSaveRenameOrNote = async (type: 'team' | 'crown', id: number, newName: string, newNote: string = '') => {
        if (!teamData || !db) return;
        const { team } = teamData;
        
        if (type === 'crown' && user) {
            const favRef = doc(db, 'users', user.uid, 'favorites', 'data');
            const fieldPath = `crownedTeams.${id}`;
            const crownedTeamData: CrownedTeam = {
                teamId: id,
                name: team.name,
                logo: team.logo,
                note: newNote,
            };
            const updateData = { [fieldPath]: crownedTeamData };

            setDoc(favRef, updateData, { merge: true }).then(() => {
                toast({ title: 'نجاح', description: `تم تتويج فريق ${team.name}.` });
            }).catch(serverError => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: favRef.path, operation: 'update', requestResourceData: updateData }));
            });
        } else if (type === 'team' && isAdmin) {
            const customNameRef = doc(db, 'teamCustomizations', String(id));
            if (newName && newName !== team.name) {
                await setDoc(customNameRef, { customName: newName });
            } else {
                await deleteDoc(customNameRef);
            }
            setDisplayTitle(newName || team.name);
            toast({ title: 'نجاح', description: 'تم تحديث الاسم المخصص للفريق.' });
        }

        setRenameItem(null);
    };

    if(loading) {
        return (
            <div className="flex h-full flex-col bg-background">
                <ScreenHeader title="جاري التحميل..." onBack={goBack} canGoBack={canGoBack} />
                <div className="flex-1 overflow-y-auto p-1">
                    <Skeleton className="h-48 w-full mb-4" />
                    <Skeleton className="h-10 w-full" />
                    <div className="mt-4 p-4">
                        <Skeleton className="h-64 w-full" />
                    </div>
                </div>
            </div>
        );
    }
    
    if(!teamData) {
         return (
            <div className="flex h-full flex-col bg-background">
                <ScreenHeader title="خطأ" onBack={goBack} canGoBack={canGoBack} />
                <p className="text-center p-8">لم يتم العثور على بيانات الفريق.</p>
            </div>
        );
    }

    const isStarred = !!favorites.teams?.[teamId];
    const isCrowned = !!favorites.crownedTeams?.[teamId];

    return (
        <div className="flex flex-col bg-background h-full">
            <ScreenHeader 
                title={""}
                onBack={goBack} 
                canGoBack={canGoBack} 
            />
            {renameItem && (
                <RenameDialog
                    isOpen={!!renameItem}
                    onOpenChange={(isOpen) => !isOpen && setRenameItem(null)}
                    item={renameItem}
                    onSave={(type, id, name, note) => handleSaveRenameOrNote(type as 'team' | 'crown', Number(id), name, note)}
                />
            )}
            <div className="flex-1 overflow-y-auto p-1 min-h-0">
                <TeamHeader 
                    team={{...teamData.team, name: displayTitle || teamData.team.name}}
                    venue={teamData.venue} 
                    onStar={handleFavoriteToggle}
                    isStarred={isStarred}
                    onCrown={handleOpenCrownDialog}
                    isCrowned={isCrowned}
                    isAdmin={isAdmin}
                    onRename={handleRename}
                />
                 <Tabs defaultValue="details" onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="details">التفاصيل</TabsTrigger>
                    <TabsTrigger value="players">اللاعبون</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="mt-4" forceMount={activeTab === 'details'}>
                    <TeamDetailsTabs teamId={teamId} navigate={navigate} onPinToggle={handlePinToggle} pinnedPredictionMatches={pinnedPredictionMatches} isAdmin={isAdmin} />
                  </TabsContent>
                  <TabsContent value="players" className="mt-4" forceMount={activeTab === 'players'}>
                    <TeamPlayersTab teamId={teamId} navigate={navigate} />
                  </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

    

    