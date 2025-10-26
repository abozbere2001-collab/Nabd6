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
import PredictionCard from '@/components/PredictionCard';
import { cn } from '@/lib/utils';
import { Skeleton } from "@/components/ui/skeleton";
import { format, addDays, isToday, isYesterday, isTomorrow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const calculatePoints = (prediction: Prediction, fixture: Fixture): number => {
    const actualHome = fixture.goals.home;
    const actualAway = fixture.goals.away;
    
    const predHome = prediction.homeGoals;
    const predAway = prediction.awayGoals;
  
    if (actualHome === null || actualAway === null) {
      return 0; // Match not finished or score unavailable, no points.
    }
  
    // Exact score prediction: 5 points
    if (actualHome === predHome && actualAway === predAway) {
      return 5;
    }
  
    const actualWinner = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
    const predWinner = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';
  
    // Correct outcome prediction (win/draw/loss): 3 points
    if (actualWinner === predWinner) {
      return 3;
    }
  
    // Incorrect prediction: 0 points
    return 0;
};

const LeaderboardDisplay = React.memo(({ leaderboard, loadingLeaderboard, userScore, userId }: { leaderboard: UserScore[], loadingLeaderboard: boolean, userScore: UserScore | null, userId: string | undefined }) => {
    if (loadingLeaderboard) {
        return (
            <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1"><Skeleton className="h-4 w-3/4" /></div>
                        <Skeleton className="h-4 w-8" />
                    </div>
                ))}
            </div>
        );
    }

    if (leaderboard.length === 0) {
        return <p className="text-center text-muted-foreground p-8">لا يوجد مشاركون في لوحة الصدارة بعد.</p>;
    }
    
    const isUserInTop100 = leaderboard.some(s => s.userId === userId);

    return (
        <div className="space-y-2">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>الترتيب</TableHead>
                        <TableHead className="text-right">المستخدم</TableHead>
                        <TableHead className="text-center">النقاط</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {leaderboard.map(score => (
                        <TableRow key={score.userId} className={cn(score.userId === userId && "bg-primary/10")}>
                            <TableCell>{score.rank}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center gap-2 justify-end">
                                    {score.userName}
                                    <Avatar className="h-6 w-6"><AvatarImage src={score.userPhoto}/></Avatar>
                                </div>
                            </TableCell>
                            <TableCell className="text-center font-bold">{score.totalPoints}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {userScore && !isUserInTop100 && (
                 <Card className="bg-primary/10 mt-4">
                    <CardContent className="p-0">
                         <Table>
                             <TableBody>
                                <TableRow className="border-t-2 border-primary/50">
                                    <TableCell>{userScore.rank || '-'}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center gap-2 justify-end">
                                            {userScore.userName}
                                            <Avatar className="h-6 w-6"><AvatarImage src={userScore.userPhoto}/></Avatar>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center font-bold">{userScore.totalPoints}</TableCell>
                                </TableRow>
                             </TableBody>
                         </Table>
                    </CardContent>
                 </Card>
            )}
        </div>
    );
});
LeaderboardDisplay.displayName = 'LeaderboardDisplay';


const formatDateKey = (date: Date): string => format(date, 'yyyy-MM-dd');

const DateScroller = ({ selectedDateKey, onDateSelect }: {selectedDateKey: string, onDateSelect: (dateKey: string) => void}) => {
    const dates = useMemo(() => {
        const today = new Date();
        return Array.from({ length: 30 }, (_, i) => addDays(today, i - 15));
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
        <div className="relative bg-card py-2 border-x border-b rounded-b-lg shadow-md -mt-1">
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
                        >
                            <span className="text-[10px] font-normal">{format(date, "EEE", { locale: ar })}</span>
                            <span className="font-semibold text-sm">{format(date, 'd')}</span>
                            {isSelected && <span className="absolute bottom-0 h-0.5 w-3 rounded-full bg-primary" />}
                        </button>
                    )
                })}
            </div>
             <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => onDateSelect(formatDateKey(new Date()))}
                disabled={isToday(new Date(selectedDateKey))}
             >
                <CalendarDays className="h-4 w-4"/>
             </Button>
        </div>
    );
}

export function PredictionsScreen({ navigate, goBack, canGoBack }: ScreenProps) {
    const { user } = useAuth();
    const { isAdmin, db, isCheckingAdmin } = useAdmin();
    const { toast } = useToast();

    const [mainTab, setMainTab] = useState('voting');
    const [leaderboard, setLeaderboard] = useState<UserScore[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
    const [currentUserScore, setCurrentUserScore] = useState<UserScore | null>(null);

    const [pinnedMatches, setPinnedMatches] = useState<(PredictionMatch & { id: string })[]>([]);
    const [loadingMatches, setLoadingMatches] = useState(true);

    const [allUserPredictions, setAllUserPredictions] = useState<{ [key: string]: Prediction }>({});
    const [loadingUserPredictions, setLoadingUserPredictions] = useState(true);

    const [selectedDateKey, setSelectedDateKey] = useState<string>(formatDateKey(new Date()));
    const [isUpdatingPoints, setIsUpdatingPoints] = useState(false);

    useEffect(() => {
        if (isCheckingAdmin) return;
        
        if (!db) {
            setLoadingMatches(false);
            setPinnedMatches([]);
            return;
        }
        
        setLoadingMatches(true);
        const q = query(collection(db, 'predictionFixtures'));
        const unsub = onSnapshot(q, (snapshot) => {
            const matches = snapshot.docs.map(doc => ({
                id: doc.id,
                ...(doc.data() as PredictionMatch),
            })).filter(m => m && m.fixtureData && m.fixtureData.fixture);
            setPinnedMatches(matches);
            setLoadingMatches(false);
        }, (err) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'predictionFixtures',
                operation: 'list'
            }));
            setLoadingMatches(false);
        });

        return () => unsub();
    }, [db, isAdmin, isCheckingAdmin]);


    useEffect(() => {
        if (!db || !user || pinnedMatches.length === 0) {
            setLoadingUserPredictions(false);
            return;
        };
        setLoadingUserPredictions(true);
        
        const predictionRefs = pinnedMatches.map(match => doc(db, 'predictionFixtures', match.id, 'userPredictions', user.uid));
        
        const unsubscribes = predictionRefs.map((ref, index) => {
            return onSnapshot(ref, (predDoc) => {
                const matchId = pinnedMatches[index].id;
                if (predDoc.exists()) {
                    setAllUserPredictions(prev => ({ ...prev, [matchId]: predDoc.data() as Prediction }));
                }
            }, e => console.warn(`Could not listen to prediction for match ${pinnedMatches[index].id}`, e));
        });

        setLoadingUserPredictions(false);

        return () => unsubscribes.forEach(unsub => unsub());

    }, [db, user, pinnedMatches]);
    
    const fetchLeaderboard = useCallback(async () => {
        if (!db) return;
        setLoadingLeaderboard(true);
        
        try {
            const q = query(collection(db, 'leaderboard'), orderBy('totalPoints', 'desc'), limit(100));
            const top100Snapshot = await getDocs(q);
            let rank = 1;
            const top100Scores = top100Snapshot.docs.map(doc => ({ userId: doc.id, ...(doc.data() as Omit<UserScore, 'userId'>), rank: rank++ }));
            setLeaderboard(top100Scores);
            
            if (user) {
                const userScoreRef = doc(db, 'leaderboard', user.uid);
                const userScoreSnap = await getDoc(userScoreRef);
                if (userScoreSnap.exists()) {
                    const data = userScoreSnap.data();
                    const userRank = top100Scores.find(s => s.userId === user.uid)?.rank;
                    setCurrentUserScore({ userId: user.uid, ...data, rank: userRank || data.rank } as UserScore);
                } else {
                    setCurrentUserScore(null);
                }
            }
        } catch (error) {
            console.error("Error fetching leaderboard:", error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'leaderboard', operation: 'list' }));
        } finally {
            setLoadingLeaderboard(false);
        }
    }, [db, user]);

    useEffect(() => {
        if (mainTab === 'leaderboard') {
            fetchLeaderboard();
        }
    }, [mainTab, fetchLeaderboard]);


    const handleSavePrediction = useCallback(async (fixtureId: number, homeGoalsStr: string, awayGoalsStr: string) => {
        if (!user || homeGoalsStr === '' || awayGoalsStr === '' || !db) return;
        const homeGoals = parseInt(homeGoalsStr, 10);
        const awayGoals = parseInt(awayGoalsStr, 10);
        if (isNaN(homeGoals) || isNaN(awayGoals)) return;
    
        const predictionRef = doc(db, 'predictionFixtures', String(fixtureId), 'userPredictions', user.uid);
        
        const predictionData: Prediction = {
            userId: user.uid,
            fixtureId,
            homeGoals,
            awayGoals,
            points: allUserPredictions[String(fixtureId)]?.points || 0,
            timestamp: new Date().toISOString()
        };
        
        setDoc(predictionRef, predictionData, { merge: true }).catch(serverError => {
             const permissionError = new FirestorePermissionError({
                path: predictionRef.path,
                operation: 'write',
                requestResourceData: predictionData
            });
            errorEmitter.emit('permission-error', permissionError);
        });
    }, [user, db, allUserPredictions]);

    const handleCalculateAllPoints = useCallback(async () => {
        if (!db || !isAdmin) return;
        setIsUpdatingPoints(true);
        toast({ title: "بدء تحديث النقاط...", description: "جاري حساب النقاط لجميع المستخدمين." });

        try {
            // Step 1: Update points for individual predictions
            toast({ title: "الخطوة 1/3", description: "تحديث نقاط التوقعات..." });
            const fixturesSnapshot = await getDocs(collection(db, "predictionFixtures"));
            const predictionUpdateBatch = writeBatch(db);
            const locallyUpdatedPredictions: { [key: string]: Prediction } = {};

            for (const fixtureDoc of fixturesSnapshot.docs) {
                const fixtureId = fixtureDoc.id;
                const fixtureData = (fixtureDoc.data() as PredictionMatch).fixtureData;

                if (['FT', 'AET', 'PEN'].includes(fixtureData.fixture.status.short)) {
                    const userPredictionsSnapshot = await getDocs(collection(db, 'predictionFixtures', fixtureId, 'userPredictions'));
                    userPredictionsSnapshot.forEach(userPredDoc => {
                        const userPrediction = userPredDoc.data() as Prediction;
                        const newPoints = calculatePoints(userPrediction, fixtureData);
                        
                        if (userPrediction.points !== newPoints) {
                            const userPredRef = doc(db, 'predictionFixtures', fixtureId, 'userPredictions', userPredDoc.id);
                            predictionUpdateBatch.update(userPredRef, { points: newPoints });
                            if (userPredDoc.id === user?.uid) {
                                locallyUpdatedPredictions[fixtureId] = { ...userPrediction, points: newPoints };
                            }
                        }
                    });
                }
            }
            await predictionUpdateBatch.commit();
            setAllUserPredictions(prev => ({ ...prev, ...locallyUpdatedPredictions }));
            toast({ title: "نجاح الخطوة 1/3", description: "تم تحديث نقاط التوقعات." });

            // Step 2: Aggregate all points for the leaderboard
            toast({ title: "الخطوة 2/3", description: "تجميع كل النقاط..." });
            const userPoints = new Map<string, number>();
            const allFixturesForLeaderboard = await getDocs(collection(db, "predictionFixtures"));
            for (const fixtureDoc of allFixturesForLeaderboard.docs) {
                const userPredictionsSnapshot = await getDocs(collection(db, 'predictionFixtures', fixtureDoc.id, 'userPredictions'));
                userPredictionsSnapshot.forEach(predDoc => {
                    const pred = predDoc.data() as Prediction;
                    if (pred.userId && typeof pred.points === 'number') {
                        userPoints.set(pred.userId, (userPoints.get(pred.userId) || 0) + pred.points);
                    }
                });
            }

            // Step 3: Fetch user profiles and update leaderboard
            toast({ title: "الخطوة 3/3", description: "تحديث لوحة الصدارة..." });
            const userProfiles = new Map<string, UserProfile>();
            if (userPoints.size > 0) {
                const usersSnapshot = await getDocs(collection(db, "users"));
                usersSnapshot.forEach(doc => {
                    userProfiles.set(doc.id, doc.data() as UserProfile);
                });
            }

            // Clear leaderboard before updating
            const oldLeaderboardSnapshot = await getDocs(collection(db, "leaderboard"));
            const deleteBatch = writeBatch(db);
            oldLeaderboardSnapshot.forEach(doc => deleteBatch.delete(doc.ref));
            await deleteBatch.commit();

            // Write new leaderboard data
            const leaderboardBatch = writeBatch(db);
            for (const [userId, totalPoints] of userPoints.entries()) {
                const userData = userProfiles.get(userId);
                if (userData) {
                    const leaderboardRef = doc(db, 'leaderboard', userId);
                    const leaderboardData: Omit<UserScore, 'userId' | 'rank'> = {
                        totalPoints,
                        userName: userData.displayName || `مستخدم_${userId.substring(0, 4)}`,
                        userPhoto: userData.photoURL || '',
                    };
                    leaderboardBatch.set(leaderboardRef, leaderboardData);
                }
            }
            await leaderboardBatch.commit();

            toast({ title: "نجاح!", description: "تم تحديث لوحة الصدارة بنجاح." });
            await fetchLeaderboard();

        } catch (error) {
            console.error("Error calculating all points:", error);
            if (error instanceof Error) {
                toast({ variant: 'destructive', title: "خطأ", description: error.message || "حدث خطأ أثناء تحديث لوحة الصدارة." });
            }
        } finally {
            setIsUpdatingPoints(false);
        }
    }, [db, isAdmin, toast, fetchLeaderboard, user]);


    const filteredMatches = useMemo(() => {
        return pinnedMatches.filter(match => {
            if (!match.fixtureData || !match.fixtureData.fixture) return false;
            const matchDateKey = format(new Date(match.fixtureData.fixture.timestamp * 1000), 'yyyy-MM-dd');
            return matchDateKey === selectedDateKey;
        }).sort((a,b) => a.fixtureData.fixture.timestamp - b.fixtureData.fixture.timestamp);
    }, [pinnedMatches, selectedDateKey]);

    return (
        <div className="flex h-full flex-col bg-background">
            <ScreenHeader
                title="التوقعات"
                onBack={goBack}
                canGoBack={canGoBack}
                actions={
                  <div className="flex items-center gap-1">
                      <SearchSheet navigate={navigate}>
                          <Button variant="ghost" size="icon">
                              <Search className="h-5 w-5" />
                          </Button>
                      </SearchSheet>
                      <ProfileButton />
                  </div>
                }
              />
             <Tabs value={mainTab} onValueChange={setMainTab} className="w-full flex-1 flex flex-col min-h-0">
               <TabsList className="grid w-full grid-cols-2">
                   <TabsTrigger value="leaderboard"><BarChart className="ml-2 h-4 w-4" />الترتيب</TabsTrigger>
                   <TabsTrigger value="voting"><ThumbsUp className="ml-2 h-4 w-4" />تصويت</TabsTrigger>
               </TabsList>
               
               <TabsContent value="voting" className="flex-1 flex flex-col mt-0 data-[state=inactive]:hidden min-h-0">
                    <DateScroller selectedDateKey={selectedDateKey} onDateSelect={setSelectedDateKey} />
                    <div className="flex-1 overflow-y-auto p-1 space-y-4 pt-4">
                        {loadingMatches || isCheckingAdmin ? (
                            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                        ) : !user ? (
                            <div className="text-center text-muted-foreground pt-10">
                                <p>ميزة التوقعات متاحة للمستخدمين المسجلين.</p>
                                <Button onClick={() => navigate('Welcome')} className="mt-4">تسجيل الدخول</Button>
                             </div>
                        ) : filteredMatches.length > 0 ? (
                            filteredMatches.map(match => (
                                <PredictionCard 
                                    key={match.id}
                                    predictionMatch={match}
                                    userPrediction={allUserPredictions[match.id!]}
                                    onSave={handleSavePrediction}
                                />
                            ))
                        ) : (
                            <div className="text-center text-muted-foreground pt-10">
                                <p>لا توجد مباريات للتوقع في هذا اليوم.</p>
                                {isAdmin && <p className="text-xs">يمكنك تثبيت مباريات من شاشة المباريات.</p>}
                            </div>
                        )}
                    </div>
               </TabsContent>
    
               <TabsContent value="leaderboard" className="mt-4 flex-1 overflow-y-auto">
                   <Card>
                      <CardHeader className="flex-row items-center justify-between">
                           <CardTitle>لوحة الصدارة</CardTitle>
                           {isAdmin && (
                               <Button onClick={handleCalculateAllPoints} disabled={isUpdatingPoints} size="sm">
                                   {isUpdatingPoints ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                                   <span className="mr-2">تحديث النتائج</span>
                               </Button>
                           )}
                      </CardHeader>
                      <CardContent className="p-0">
                           <LeaderboardDisplay leaderboard={leaderboard} loadingLeaderboard={loadingLeaderboard} userScore={currentUserScore} userId={user?.uid}/>
                      </CardContent>
                   </Card>
               </TabsContent>
            </Tabs>
        </div>
    );
};
