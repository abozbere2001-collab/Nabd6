

"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import { format, isToday, startOfToday } from 'date-fns';
import { ar } from 'date-fns/locale';


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

const TeamPlayersTab = ({ teamId, navigate, customNames, onCustomNameChange }: { teamId: number, navigate: ScreenProps['navigate'], customNames: any, onCustomNameChange: () => Promise<void> }) => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const { isAdmin } = useAdmin();
    const { toast } = useToast();
    const { db } = useFirestore();
    const [renameItem, setRenameItem] = useState<{ id: number, name: string, originalName: string } | null>(null);

    const getDisplayName = useCallback((id: number, defaultName: string) => {
        if (!customNames) return defaultName;
        const customName = customNames?.players.get(id);
        if (customName) return customName;
        return hardcodedTranslations.players[id] || defaultName;
    }, [customNames]);

    useEffect(() => {
        const fetchPlayers = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/football/players?team=${teamId}&season=${CURRENT_SEASON}`);
                const data = await res.json();
                if (data.response) {
                    const fetchedPlayers = data.response.map((p: any) => p.player);
                    setPlayers(fetchedPlayers);
                }
            } catch (error) {
                toast({ variant: 'destructive', title: "خطأ", description: "فشل في جلب قائمة اللاعبين." });
            } finally {
                setLoading(false);
            }
        };
        fetchPlayers();
    }, [teamId, toast]);

    const handleSaveRename = (type: string, id: number, newName: string) => {
        if (!renameItem || !db || !isAdmin) return;
        const docRef = doc(db, 'playerCustomizations', String(id));
        const originalName = renameItem.originalName;
        
        const op = (newName && newName.trim() !== originalName) ? setDoc(docRef, { customName: newName }) : deleteDoc(docRef);

        op.then(() => {
            toast({ title: "نجاح", description: "تم تحديث اسم اللاعب." });
            onCustomNameChange(); // Trigger re-fetch
        }).catch(serverError => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: (newName && newName.trim() !== originalName) ? 'create' : 'delete',
                requestResourceData: { customName: newName }
            });
            errorEmitter.emit('permission-error', permissionError);
        });
        setRenameItem(null);
    };


    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }
    
    return (
        <div className="space-y-2">
            {renameItem && <RenameDialog isOpen={!!renameItem} onOpenChange={(isOpen) => !isOpen && setRenameItem(null)} item={{...renameItem, type: 'player', purpose: 'rename'}} onSave={(type, id, name) => handleSaveRename(type as 'player', Number(id), name)} />}
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

const TeamDetailsTabs = ({ teamId, leagueId, navigate, onPinToggle, pinnedPredictionMatches, isAdmin, customNames }: { teamId: number, leagueId?: number, navigate: ScreenProps['navigate'], onPinToggle: (fixture: Fixture) => void, pinnedPredictionMatches: Set<number>, isAdmin: boolean, customNames: any }) => {
    const [fixtures, setFixtures] = useState<Fixture[]>([]);
    const [standings, setStandings] = useState<Standing[]>([]);
    const [stats, setStats] = useState<TeamStatistics | null>(null);
    const [loading, setLoading] = useState(true);
    
    const listRef = useRef<HTMLDivElement>(null);
    const dateRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

    const getDisplayName = useCallback((type: 'team' | 'league', id: number, defaultName: string) => {
        if (!customNames) return defaultName;
        const key = `${type}s` as 'teams' | 'leagues';
        const firestoreMap = customNames[key];
        const customName = firestoreMap?.get(id);
        if (customName) return customName;

        const hardcodedMap = hardcodedTranslations[key];
        const hardcodedName = hardcodedMap[id as any];
        if (hardcodedName) return hardcodedName;

        return defaultName;
    }, [customNames]);

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            if (!teamId) return;
            setLoading(true);

            try {
                // Fetch fixtures and stats in parallel
                const [fixturesRes, statsRes] = await Promise.all([
                    fetch(`/api/football/fixtures?team=${teamId}&season=${CURRENT_SEASON}`),
                    fetch(`/api/football/teams/statistics?team=${teamId}&season=${CURRENT_SEASON}${leagueId ? `&league=${leagueId}` : ''}`)
                ]);

                if (!isMounted) return;
                
                if (!fixturesRes.ok || !statsRes.ok) {
                    throw new Error("API call failed");
                }

                const fixturesData = await fixturesRes.json();
                const statsData = await statsRes.json();

                if (!isMounted) return;

                const sortedFixtures = (fixturesData.response || []).sort((a: Fixture, b: Fixture) => a.fixture.timestamp - b.fixture.timestamp);
                const teamStats = statsData.response || null;

                setFixtures(sortedFixtures);
                setStats(teamStats);

                // Now, determine the league ID and fetch standings
                const effectiveLeagueId = leagueId || teamStats?.league?.id;

                if (effectiveLeagueId) {
                    const standingsRes = await fetch(`/api/football/standings?league=${effectiveLeagueId}&season=${CURRENT_SEASON}`);
                    if (!standingsRes.ok) throw new Error("Standings API call failed");
                    const standingsData = await standingsRes.json();
                    if (isMounted) {
                        setStandings(standingsData.response?.[0]?.league?.standings?.[0] || []);
                    }
                } else {
                    if (isMounted) setStandings([]);
                }

            } catch (error) {
                console.error("Error fetching team details tabs:", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [teamId, leagueId]);


    const groupedFixtures = useMemo(() => {
        const processed = fixtures.map(fixture => ({
            ...fixture,
            league: { ...fixture.league, name: getDisplayName('league', fixture.league.id, fixture.league.name) },
            teams: {
                home: { ...fixture.teams.home, name: getDisplayName('team', fixture.teams.home.id, fixture.teams.home.name) },
                away: { ...fixture.teams.away, name: getDisplayName('team', fixture.teams.away.id, fixture.teams.away.name) },
            }
        }));

        return processed.reduce((acc, fixture) => {
            const date = format(new Date(fixture.fixture.timestamp * 1000), 'yyyy-MM-dd');
            if (!acc[date]) acc[date] = [];
            acc[date].push(fixture);
            return acc;
        }, {} as Record<string, Fixture[]>);

    }, [fixtures, getDisplayName]);

     useEffect(() => {
        if (loading || Object.keys(groupedFixtures).length === 0 || !listRef.current) return;

        const sortedDates = Object.keys(groupedFixtures).sort();
        const today = startOfToday();
        
        let targetDateKey: string | undefined;

        targetDateKey = sortedDates.find(date => {
            const fixtureDate = new Date(date);
            return fixtureDate >= today;
        });

        if (!targetDateKey && sortedDates.length > 0) {
            const lastMatchDate = sortedDates[sortedDates.length - 1];
            if (new Date(lastMatchDate) < today) {
                targetDateKey = lastMatchDate;
            }
        }

        if (targetDateKey && dateRefs.current[targetDateKey]) {
            setTimeout(() => {
                const element = dateRefs.current[targetDateKey!];
                if (element && listRef.current) {
                    const listTop = listRef.current.offsetTop;
                    const elementTop = element.offsetTop;
                    listRef.current.scrollTop = elementTop - listTop;
                }
            }, 100);
        }
    }, [loading, groupedFixtures]);
    
    const processedStandings = useMemo(() => {
        if (!standings) return [];
        return standings.map(s => ({
            ...s,
            team: {
                ...s.team,
                name: getDisplayName('team', s.team.id, s.team.name),
            }
        }));
    }, [standings, getDisplayName]);


    if (loading || customNames === null) {
         return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    const sortedDates = Object.keys(groupedFixtures).sort();

    return (
        <Tabs defaultValue="matches" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="matches">المباريات</TabsTrigger>
                <TabsTrigger value="standings">الترتيب</TabsTrigger>
                <TabsTrigger value="stats">الإحصائيات</TabsTrigger>
            </TabsList>
            <TabsContent value="matches" className="mt-4">
                <div ref={listRef} className="max-h-[60vh] overflow-y-auto space-y-4">
                    {sortedDates.length > 0 ? sortedDates.map(date => (
                        <div key={date} ref={el => dateRefs.current[date] = el}>
                            <h3 className="font-bold text-center text-sm text-muted-foreground my-2">
                                {format(new Date(date), 'EEEE, d MMMM yyyy', { locale: ar })}
                            </h3>
                            <div className="space-y-2">
                                {groupedFixtures[date].map(fixture => (
                                    <FixtureItem
                                        key={fixture.fixture.id}
                                        fixture={fixture} 
                                        navigate={navigate} 
                                        isPinnedForPrediction={pinnedPredictionMatches.has(fixture.fixture.id)}
                                        onPinToggle={onPinToggle}
                                        isAdmin={isAdmin}
                                    />
                                ))}
                            </div>
                        </div>
                    )) : <p className="text-center text-muted-foreground p-8">لا توجد مباريات متاحة.</p>}
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
                ) : <p className="text-center text-muted-foreground p-8">الترتيب غير متاح لهذه البطولة.</p>}
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


export function TeamDetailScreen({ navigate, goBack, canGoBack, teamId, leagueId, favorites, customNames, setFavorites, onCustomNameChange }: ScreenProps & { teamId: number, leagueId?: number, setFavorites: React.Dispatch<React.SetStateAction<Partial<Favorites>>>, onCustomNameChange: () => Promise<void> }) {
    const { user } = useAuth();
    const { db } = useFirestore();
    const { isAdmin } = useAdmin();
    const { toast } = useToast();
    const [teamData, setTeamData] = useState<TeamData | null>(null);
    const [loading, setLoading] = useState(true);
    const [renameItem, setRenameItem] = useState<{ id: number; name: string; note?: string; type: 'team' | 'crown'; purpose: 'rename' | 'crown' | 'note'; originalData: any; originalName?: string; } | null>(null);
    const [pinnedPredictionMatches, setPinnedPredictionMatches] = useState(new Set<number>());
    const [activeTab, setActiveTab] = useState('details');

    useEffect(() => {
        if (!teamId) return;
        let isMounted = true;
        let predictionsUnsub: (() => void) | null = null;

        const getTeamInfo = async () => {
            setLoading(true);
            try {
                const teamRes = await fetch(`/api/football/teams?id=${teamId}`);
                if (!teamRes.ok) throw new Error("Team API fetch failed");
                
                const data = await teamRes.json();
                if (isMounted) {
                    if (data.response?.[0]) {
                        const teamInfo = data.response[0];
                        setTeamData(teamInfo);
                    } else {
                         throw new Error("Team not found in API response");
                    }
                }
            } catch (error) {
                console.error("Error fetching team info:", error);
                if (isMounted) toast({ variant: 'destructive', title: 'خطأ', description: 'فشل في تحميل بيانات الفريق.' });
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        getTeamInfo();

        if(db) {
            const q = collection(db, "predictionFixtures");
            predictionsUnsub = onSnapshot(q, (snapshot) => {
                const newPinnedSet = new Set<number>();
                snapshot.forEach(doc => newPinnedSet.add(Number(doc.id)));
                if(isMounted) setPinnedPredictionMatches(newPinnedSet);
            });
        }

        return () => {
            isMounted = false;
            if(predictionsUnsub) predictionsUnsub();
        };
    }, [teamId, db, toast]);


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

    const handleFavoriteToggle = useCallback(() => {
        if (!teamData?.team) return;
    
        const { team } = teamData;
        const teamId = team.id;
        
        // Create a deep copy to avoid mutation issues
        const newFavorites: Partial<Favorites> = JSON.parse(JSON.stringify(favorites || {}));
        if (!newFavorites.teams) {
            newFavorites.teams = {};
        }
        
        const isCurrentlyFavorited = !!newFavorites.teams[teamId];
    
        if (isCurrentlyFavorited) {
            delete newFavorites.teams[teamId];
        } else {
            newFavorites.teams[teamId] = { teamId, name: team.name, logo: team.logo, type: team.national ? 'National' : 'Club' };
        }
    
        // Update Firestore for logged-in users
        if (user && db) {
            const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
            const updatePayload = {
                [`teams.${teamId}`]: isCurrentlyFavorited ? deleteField() : newFavorites.teams[teamId]
            };
            setDoc(favDocRef, updatePayload, { merge: true }).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: favDocRef.path, operation: 'update', requestResourceData: updatePayload }));
            });
        }
        
        // Always update the central state via the passed-in setter for UI consistency
        setFavorites(newFavorites);

    }, [teamData, user, db, favorites, setFavorites]);


    const handleOpenCrownDialog = () => {
        if (!teamData) return;
        if (!user) {
            toast({ title: 'مستخدم زائر', description: 'يرجى تسجيل الدخول لاستخدام هذه الميزة.' });
            return;
        }
        const { team } = teamData;
        setRenameItem({
            id: team.id,
            name: getDisplayName('team', team.id, team.name),
            type: 'crown',
            purpose: 'crown',
            originalData: team,
            note: favorites?.crownedTeams?.[team.id]?.note || '',
        });
    };

    const handleRename = () => {
        if (!teamData) return;
        const { team } = teamData;
        setRenameItem({
            id: team.id,
            name: getDisplayName('team', team.id, team.name),
            type: 'team',
            purpose: 'rename',
            originalData: team,
            originalName: team.name,
        });
    };

   const handleSaveRenameOrNote = (type: 'team' | 'crown', id: number, newName: string, newNote: string = '') => {
    if (!teamData || !db || !renameItem) return;
    const { purpose, originalData, originalName } = renameItem;

    if (purpose === 'rename' && isAdmin) {
        const docRef = doc(db, 'teamCustomizations', String(id));
        const op = (newName && newName.trim() && newName.trim() !== originalName) 
            ? setDoc(docRef, { customName: newName }) 
            : deleteDoc(docRef);

        op.then(() => {
            toast({ title: 'نجاح', description: 'تم تحديث الاسم المخصص للفريق.' });
            onCustomNameChange();
        }).catch(serverError => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'write', requestResourceData: { customName: newName } }));
        });

    } else if (purpose === 'crown' && user) {
        const teamId = Number(id);
        const newFavorites = JSON.parse(JSON.stringify(favorites || {}));
        if (!newFavorites.crownedTeams) newFavorites.crownedTeams = {};
        const isCurrentlyCrowned = !!newFavorites.crownedTeams?.[teamId];
        
        let updatePayload;

        if (isCurrentlyCrowned) {
            delete newFavorites.crownedTeams[teamId];
            updatePayload = { [`crownedTeams.${teamId}`]: deleteField() };
        } else {
            const crownedData = { teamId, name: (originalData as Team).name, logo: (originalData as Team).logo, note: newNote };
            newFavorites.crownedTeams[teamId] = crownedData;
            updatePayload = { [`crownedTeams.${teamId}`]: crownedData };
        }

        if (user && !user.isAnonymous) {
            const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
            setDoc(favDocRef, updatePayload, { merge: true }).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: favDocRef.path, operation: 'update', requestResourceData: updatePayload }));
            });
        }
        setFavorites(newFavorites);
    }
    setRenameItem(null);
};
    
    const getDisplayName = useCallback((type: 'team' | 'league', id: number, defaultName: string) => {
        if (!customNames) return defaultName;
        const key = `${type}s` as 'teams' | 'leagues';
        const firestoreMap = customNames[key];
        const customName = firestoreMap?.get(id);
        if (customName) return customName;

        const hardcodedMap = hardcodedTranslations[key];
        const hardcodedName = hardcodedMap[id as any];
        if (hardcodedName) return hardcodedName;

        return defaultName;
    }, [customNames]);


    if(loading || !teamData || !favorites || !customNames) {
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

    const isStarred = !!favorites.teams?.[teamId];
    const isCrowned = !!favorites.crownedTeams?.[teamId];
    const displayTitle = getDisplayName('team', teamId, teamData.team.name);

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
                    onSave={(type, id, name, note) => handleSaveRenameOrNote(type as 'team' | 'crown', Number(id), name, note || '')}
                />
            )}
            <div className="flex-1 overflow-y-auto p-1 min-h-0">
                <TeamHeader 
                    team={{...teamData.team, name: displayTitle }}
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
                  <TabsContent value="details" className="mt-4">
                    <TeamDetailsTabs teamId={teamId} leagueId={leagueId} navigate={navigate} onPinToggle={handlePinToggle} pinnedPredictionMatches={pinnedPredictionMatches} isAdmin={isAdmin} customNames={customNames} />
                  </TabsContent>
                  <TabsContent value="players" className="mt-4">
                    <TeamPlayersTab teamId={teamId} navigate={navigate} customNames={customNames} onCustomNameChange={onCustomNameChange}/>
                  </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

