

"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ScreenProps } from '@/app/page';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { Fixture, Standing, LineupData, MatchEvent, MatchStatistics, PlayerWithStats, Player as PlayerType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shirt, ArrowRight, ArrowLeft, Square, Clock, Loader2, Users, BarChart, ShieldCheck, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { FootballIcon } from '@/components/icons/FootballIcon';
import { Progress } from '@/components/ui/progress';
import { LiveMatchStatus } from '@/components/LiveMatchStatus';
import { CURRENT_SEASON } from '@/lib/constants';
import { useAdmin, useFirestore } from '@/firebase/provider';
import { RenameDialog } from '@/components/RenameDialog';
import { doc, setDoc, deleteDoc, writeBatch, getDocs, collection, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { Button } from '@/components/ui/button';
import { hardcodedTranslations } from '@/lib/hardcoded-translations';
import { isMatchLive } from '@/lib/matchStatus';

// This is a temporary fallback. In a real app, you would use a proper i18n library.
const useTranslation = () => ({ t: (key: string) => key.replace(/_/g, ' ') });


type RenameType = 'player' | 'coach' | 'team' | 'league' | 'continent' | 'country' | 'status';


const PlayerCard = ({ player, navigate, onRename, isAdmin, showRating }: { player: PlayerType, navigate: ScreenProps['navigate'], onRename: () => void, isAdmin: boolean, showRating: boolean }) => {
    const { t } = useTranslation();
    const fallbackImage = "https://media.api-sports.io/football/players/0.png";
    const playerImage = player.photo && player.photo.trim() !== '' ? player.photo : fallbackImage;

    const rating = player.rating && !isNaN(parseFloat(player.rating))
        ? parseFloat(player.rating).toFixed(1)
        : null;

    const getRatingColor = (r: string | null) => {
        if (!r) return 'bg-gray-500';
        const val = parseFloat(r);
        if (val >= 8) return 'bg-green-600';
        if (val >= 7) return 'bg-yellow-600';
        return 'bg-red-600';
    };

    return (
        <div className="relative flex flex-col items-center cursor-pointer" onClick={() => player.id && navigate('PlayerDetails', { playerId: player.id })}>
            <div className="relative w-12 h-12">
                <Avatar className="rounded-full w-12 h-12 object-cover border-2 border-white/50">
                    <AvatarImage src={playerImage} alt={player?.name || "Player"} />
                    <AvatarFallback>{player?.name?.charAt(0) || 'P'}</AvatarFallback>
                </Avatar>
                {isAdmin && (
                    <Button variant="ghost" size="icon" className="absolute -bottom-2 -left-2 h-6 w-6 bg-background/80 hover:bg-background rounded-full" onClick={(e) => {e.stopPropagation(); onRename();}}>
                        <Pencil className="h-3 w-3" />
                    </Button>
                )}
                {player.number && (
                    <div className="absolute -top-1 -left-1 bg-gray-800 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-background">
                        {player.number}
                    </div>
                )}
                {showRating && rating && (
                    <div className={cn(
                        `absolute -top-1 -right-1 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-background`,
                        getRatingColor(rating)
                    )}>
                        {rating}
                    </div>
                )}
            </div>
            <span className="mt-1 text-[11px] font-semibold text-center truncate w-16">{player?.name || t('unknown')}</span>
        </div>
    );
};


const MatchHeaderCard = ({ fixture, navigate, customStatus }: { fixture: Fixture, navigate: ScreenProps['navigate'], customStatus: string | null }) => {
    return (
        <Card className="mb-4 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4">
                <div className="flex justify-between items-center text-xs text-muted-foreground mb-3">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('CompetitionDetails', { leagueId: fixture.league.id })}>
                        <Avatar className="h-5 w-5"><AvatarImage src={fixture.league.logo} /></Avatar>
                        <span className="text-[10px]">{fixture.league.name}</span>
                    </div>
                    <span className="text-[10px]">{format(new Date(fixture.fixture.date), 'd MMMM yyyy', { locale: ar })}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col items-center gap-2 flex-1 justify-end truncate cursor-pointer" onClick={() => navigate('TeamDetails', { teamId: fixture.teams.home.id })}>
                        <Avatar className="h-10 w-10 border-2 border-primary/50"><AvatarImage src={fixture.teams.home.logo} /></Avatar>
                        <span className="font-bold text-sm text-center truncate w-full">{fixture.teams.home.name}</span>
                    </div>
                     <div className="relative flex flex-col items-center justify-center min-w-[120px] text-center">
                        <LiveMatchStatus fixture={fixture} large customStatus={customStatus} />
                    </div>
                    <div className="flex flex-col items-center gap-2 flex-1 truncate cursor-pointer" onClick={() => navigate('TeamDetails', { teamId: fixture.teams.away.id })}>
                         <Avatar className="h-10 w-10 border-2 border-primary/50"><AvatarImage src={fixture.teams.away.logo} /></Avatar>
                        <span className="font-bold text-sm text-center truncate w-full">{fixture.teams.away.name}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

const ShotMap = ({ homeStats, awayStats }: { homeStats: any[], awayStats: any[] }) => {
    const { t } = useTranslation();
    const findStat = (stats: any[], type: string): number => {
        const value = stats.find(s => s.type === type)?.value;
        if (typeof value === 'string') return parseInt(value, 10) || 0;
        return value || 0;
    };

    const homeShotsInside = findStat(homeStats, "Shots insidebox");
    const homeShotsOutside = findStat(homeStats, "Shots outsidebox");
    const awayShotsInside = findStat(awayStats, "Shots insidebox");
    const awayShotsOutside = findStat(awayStats, "Shots outsidebox");
    
    if ((homeShotsInside + homeShotsOutside + awayShotsInside + awayShotsOutside) === 0) {
        return null; // Don't render if there are no shot stats
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg text-center">{t('shot_map')}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="relative w-full max-w-sm mx-auto aspect-[3/2] bg-green-700 bg-cover bg-center rounded-lg overflow-hidden border-4 border-green-900/50" style={{backgroundImage: "url('/pitch-horizontal.svg')"}}>
                    {/* Home Team (Right side) */}
                    <div className="absolute right-[18%] top-1/2 -translate-y-1/2 text-center text-white">
                        <p className="font-bold text-2xl drop-shadow-lg">{homeShotsInside}</p>
                        <p className="text-xs">{t('inside_box')}</p>
                    </div>
                     <div className="absolute right-[40%] top-1/2 -translate-y-1/2 text-center text-white">
                        <p className="font-bold text-2xl drop-shadow-lg">{homeShotsOutside}</p>
                         <p className="text-xs">{t('outside_box')}</p>
                    </div>

                    {/* Away Team (Left side) */}
                     <div className="absolute left-[18%] top-1/2 -translate-y-1/2 text-center text-white">
                        <p className="font-bold text-2xl drop-shadow-lg">{awayShotsInside}</p>
                         <p className="text-xs">{t('inside_box')}</p>
                    </div>
                    <div className="absolute left-[40%] top-1/2 -translate-y-1/2 text-center text-white">
                        <p className="font-bold text-2xl drop-shadow-lg">{awayShotsOutside}</p>
                        <p className="text-xs">{t('outside_box')}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

const DetailsTab = ({ fixture, statistics, loading }: { fixture: Fixture; statistics: MatchStatistics[] | null; loading: boolean }) => {
    const { t } = useTranslation();
    const homeStats = statistics?.find(s => s.team.id === fixture.teams.home.id)?.statistics || [];
    const awayStats = statistics?.find(s => s.team.id === fixture.teams.away.id)?.statistics || [];

    const findStat = (stats: any[], type: string) => stats.find(s => s.type === type)?.value ?? '0';

    const statMapping: { labelKey: string; type: string; isProgress?: boolean }[] = [
      { labelKey: "possession", type: "Ball Possession", isProgress: true },
      { labelKey: "total_shots", type: "Total Shots" },
      { labelKey: "shots_on_goal", type: "Shots on Goal" },
      { labelKey: "shots_off_goal", type: "Shots off Goal" },
      { labelKey: "blocked_shots", type: "Blocked Shots"},
      { labelKey: "fouls", type: "Fouls" },
      { labelKey: "yellow_cards", type: "Yellow Cards" },
      { labelKey: "red_cards", type: "Red Cards" },
      { labelKey: "corner_kicks", type: "Corner Kicks" },
      { labelKey: "offsides", type: "Offsides" },
    ];

    return (
        <div className="space-y-4">
             {statistics && statistics.length > 0 && (
                <ShotMap homeStats={homeStats} awayStats={awayStats} />
            )}
            <Card>
                <CardContent className="p-4 text-sm text-right">
                    <div className="flex justify-between py-2 border-b">
                        <span className="font-semibold">{fixture.fixture.venue.name || "غير محدد"}</span>
                        <span className="text-muted-foreground">الملعب</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                        <span className="font-semibold">{fixture.league.round}</span>
                        <span className="text-muted-foreground">الجولة</span>
                    </div>
                    <div className="flex justify-between py-2">
                        <span className="font-semibold">{fixture.fixture.status.long}</span>
                        <span className="text-muted-foreground">الحالة</span>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 space-y-4">
                    <h3 className="font-bold text-center">إحصائيات المباراة</h3>
                    {loading ? (
                        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                    ) : statistics && statistics.length > 0 ? (
                        statMapping.map(stat => {
                            const homeValueRaw = findStat(homeStats, stat.type);
                            const awayValueRaw = findStat(awayStats, stat.type);
                            
                            if (stat.isProgress) {
                                const homeVal = parseInt(String(homeValueRaw).replace('%','')) || 0;
                                const awayVal = parseInt(String(awayValueRaw).replace('%','')) || 0;
                                return (
                                    <div key={stat.type} className="space-y-2">
                                        <div className="flex justify-between items-center text-xs font-bold">
                                            <span>{homeValueRaw}</span>
                                            <span className="text-muted-foreground">{t(stat.labelKey)}</span>
                                            <span>{awayValueRaw}</span>
                                        </div>
                                        <div className="flex items-center gap-1" dir="ltr">
                                            <Progress value={homeVal} indicatorClassName="bg-primary rounded-l-full" className="rounded-l-full"/>
                                            <Progress value={awayVal} indicatorClassName="bg-accent rounded-r-full" className="rounded-r-full" style={{transform: 'rotate(180deg)'}}/>
                                        </div>
                                    </div>
                                )
                            }
                            return (
                                <div key={stat.type} className="flex justify-between items-center text-sm font-bold">
                                    <span>{homeValueRaw}</span>
                                    <span className="text-muted-foreground font-normal">{t(stat.labelKey)}</span>
                                    <span>{awayValueRaw}</span>
                                </div>
                            )
                        })
                    ) : (
                       <p className="text-center text-muted-foreground p-4">الإحصائيات غير متاحة لهذه المباراة.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};


const TimelineTabContent = ({ events, homeTeam, awayTeam, highlightsOnly }: { events: MatchEvent[] | null, homeTeam: Fixture['teams']['home'], awayTeam: Fixture['teams']['away'], highlightsOnly: boolean }) => {
    const { t } = useTranslation();
    if (events === null) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    
    const filteredEvents = React.useMemo(() => {
        if (!events) return [];
        if (!highlightsOnly) return events;
        return events.filter(e => e.type === 'Goal' || (e.type === 'Card' && e.detail.includes('Red')));
    }, [events, highlightsOnly]);

    if (filteredEvents.length === 0) {
        const message = highlightsOnly ? "لا توجد أهداف أو بطاقات حمراء." : "لا توجد أحداث رئيسية في المباراة بعد.";
        return <p className="text-center text-muted-foreground p-8">{message}</p>;
    }
    
    const sortedEvents = [...filteredEvents].sort((a, b) => b.time.elapsed - a.time.elapsed);

    const getEventIcon = (event: MatchEvent) => {
        if (event.type === 'Goal') return <FootballIcon className="w-5 h-5 text-green-500" />;
        if (event.type === 'Card' && event.detail.includes('Yellow')) return <Square className="w-5 h-5 text-yellow-400 fill-current" />;
        if (event.type === 'Card' && event.detail.includes('Red')) return <Square className="w-5 h-5 text-red-500 fill-current" />;
        if (event.type === 'subst') return <Users className="w-4 h-4 text-blue-500" />;
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    };

    return (
        <div className="space-y-6 pt-4">
             <div className="flex justify-between items-center px-4">
                <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8"><AvatarImage src={awayTeam.logo} /></Avatar>
                    <span className="font-bold">{awayTeam.name}</span>
                </div>
                 <div className="flex items-center gap-2">
                    <span className="font-bold">{homeTeam.name}</span>
                    <Avatar className="h-8 w-8"><AvatarImage src={homeTeam.logo} /></Avatar>
                </div>
            </div>
            
            <div className="relative px-2">
                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-border -translate-x-1/2"></div>
                {sortedEvents.map((event, index) => {
                    const isHomeEvent = event.team.id === homeTeam.id;
                    const playerOut = event.player;
                    const playerIn = event.assist;

                    return (
                        <div key={`${event.time.elapsed}-${event.player.name}-${index}`} className={cn("relative flex my-4 items-center", !isHomeEvent ? "flex-row" : "flex-row-reverse")}>
                           <div className="flex-1 px-4">
                                <div className={cn("flex items-center gap-3 w-full", !isHomeEvent ? "flex-row text-left" : "flex-row-reverse text-right")}>
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background flex-shrink-0">
                                        {getEventIcon(event)}
                                    </div>
                                    <div className="flex-1 text-sm min-w-0">
                                        {event.type === 'subst' && event.assist.name ? (
                                            <div className="flex flex-col gap-1 text-xs">
                                                <div className='flex items-center gap-1 font-semibold text-green-500'><ArrowUp className="h-3 w-3"/><span>{playerIn.name}</span></div>
                                                <div className='flex items-center gap-1 font-semibold text-red-500'><ArrowDown className="h-3 w-3"/><span>{playerOut.name}</span></div>
                                            </div>
                                        ) : (
                                            <>
                                                <p className="font-semibold truncate">{event.player.name}</p>
                                                <p className="text-xs text-muted-foreground truncate">{event.detail}</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                           
                            <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 z-10 bg-background border rounded-full h-8 w-8 flex items-center justify-center font-bold text-xs">
                                {event.time.elapsed}'
                            </div>
                            
                            <div className="flex-1" />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const TimelineTab = ({ events, homeTeam, awayTeam }: { events: MatchEvent[] | null; homeTeam: Fixture['teams']['home'], awayTeam: Fixture['teams']['away'] }) => {
    const { t } = useTranslation();
    return (
        <Tabs defaultValue="highlights" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="highlights">الأبرز</TabsTrigger>
                <TabsTrigger value="all">كل الأحداث</TabsTrigger>
            </TabsList>
            <TabsContent value="highlights">
                <TimelineTabContent events={events} homeTeam={homeTeam} awayTeam={awayTeam} highlightsOnly={true} />
            </TabsContent>
            <TabsContent value="all">
                <TimelineTabContent events={events} homeTeam={homeTeam} awayTeam={awayTeam} highlightsOnly={false} />
            </TabsContent>
        </Tabs>
    );
}

const LineupsTab = ({ lineups, events, navigate, isAdmin, onRename, homeTeamId, awayTeamId, detailedPlayersMap, matchStarted }: { lineups: LineupData[] | null; events: MatchEvent[] | null; navigate: ScreenProps['navigate'], isAdmin: boolean, onRename: (type: RenameType, id: number, name: string, originalName: string) => void, homeTeamId: number, awayTeamId: number, detailedPlayersMap: Map<number, { player: PlayerType; statistics: any[] }>, matchStarted: boolean }) => {
    const { t } = useTranslation();
    const [activeTeamTab, setActiveTeamTab] = useState<'home' | 'away'>('home');
    
    const getPlayerWithDetails = useCallback((basePlayer: PlayerType): PlayerType => {
        if (!basePlayer.id) return basePlayer;
        const detailedPlayer = detailedPlayersMap.get(basePlayer.id);
        if (detailedPlayer) {
            return {
                ...basePlayer,
                photo: detailedPlayer.player.photo || basePlayer.photo,
                rating: detailedPlayer.statistics?.[0]?.games?.rating || basePlayer.rating,
            };
        }
        return basePlayer;
    }, [detailedPlayersMap]);

    if (lineups === null) {
        return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }
    
    if (lineups.length < 2) {
        return <p className="text-center text-muted-foreground p-8">التشكيلات غير متاحة حاليًا.</p>;
    }
    
    const home = lineups.find(l => l.team.id === homeTeamId);
    const away = lineups.find(l => l.team.id === awayTeamId);

    if (!home || !away) {
         return <p className="text-center text-muted-foreground p-8">خطأ في بيانات التشكيلة.</p>;
    }
    
    const activeLineup = activeTeamTab === 'home' ? home : away;
    
    const substitutionEvents = events?.filter(e => e.type === 'subst' && e.team.id === activeLineup.team.id) || [];
    
    const renderPitch = (lineup: LineupData) => {
        const formationGrid: { [key: number]: PlayerWithStats[] } = {};
        const ungriddedPlayers: PlayerWithStats[] = [];

        lineup.startXI.forEach(p => {
            if (p.player.grid) {
                const [row] = p.player.grid.split(':').map(Number);
                if (!formationGrid[row]) formationGrid[row] = [];
                formationGrid[row].push(p);
            } else {
                ungriddedPlayers.push(p);
            }
        });

        Object.keys(formationGrid).forEach(rowKey => {
            const row = Number(rowKey);
            formationGrid[row].sort((a, b) => {
                const colA = Number(a.player.grid?.split(':')[1] || 0);
                const colB = Number(b.player.grid?.split(':')[1] || 0);
                return colA - colB;
            });
        });
        
        const sortedRows = Object.keys(formationGrid).map(Number).sort((a, b) => b - a);

        return (
             <div className="relative w-full max-w-sm mx-auto aspect-[3/4] bg-green-700 bg-cover bg-center rounded-lg overflow-hidden border-4 border-green-900/50 flex flex-col justify-around p-2" style={{backgroundImage: "url('/pitch-vertical.svg')"}}>
                {sortedRows.map(row => (
                    <div key={row} className="flex justify-around items-center w-full">
                        {formationGrid[row]?.map(p => {
                            const fullPlayer = getPlayerWithDetails(p.player);
                            return <PlayerCard key={p.player.id || p.player.name} player={fullPlayer} navigate={navigate} isAdmin={isAdmin} onRename={() => onRename('player', p.player.id, p.player.name, p.player.name)} showRating={matchStarted} />
                        })}
                    </div>
                ))}
                 {ungriddedPlayers.length > 0 && (
                    <div className="flex justify-around items-center">
                        {ungriddedPlayers.map(p => {
                            const fullPlayer = getPlayerWithDetails(p.player);
                            return <PlayerCard key={p.player.id || p.player.name} player={fullPlayer} navigate={navigate} isAdmin={isAdmin} onRename={() => onRename('player', p.player.id, p.player.name, p.player.name)} showRating={matchStarted} />
                        })}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <Tabs value={activeTeamTab} onValueChange={(val) => setActiveTeamTab(val as 'home' | 'away')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="home">{home.team.name}</TabsTrigger>
                    <TabsTrigger value="away">{away.team.name}</TabsTrigger>
                </TabsList>
            </Tabs>
            
            <div className="font-bold text-center text-muted-foreground text-sm">{t('formation')}: {activeLineup.formation}</div>
            
            {renderPitch(activeLineup)}
            
            <Card>
                <CardContent className="p-3 text-center">
                    <h3 className="font-bold text-sm mb-2">{t('coach')}</h3>
                     <div className="relative inline-flex flex-col items-center gap-1">
                        <Avatar className="h-12 w-12">
                            <AvatarImage src={activeLineup.coach.photo} />
                            <AvatarFallback>{activeLineup.coach.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-xs">{activeLineup.coach.name}</span>
                        {isAdmin && (
                            <Button variant="ghost" size="icon" className="absolute -top-1 -right-8 h-6 w-6" onClick={(e) => {e.stopPropagation(); onRename('coach', activeLineup.coach.id, activeLineup.coach.name, activeLineup.coach.name);}}>
                                <Pencil className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {substitutionEvents.length > 0 && (
                <Card>
                    <CardHeader><CardTitle className="text-base text-center">{t('substitutions')}</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {substitutionEvents.map((event, index) => (
                            <div key={index} className="flex items-center justify-between text-xs p-1 border-b last:border-b-0">
                                <div className='font-bold w-10 text-center'>{event.time.elapsed}'</div>
                                <div className='flex-1 flex items-center justify-end gap-1 font-semibold text-red-500'>
                                    <span>{event.player.name}</span>
                                    <ArrowDown className="h-3 w-3"/>
                                </div>
                                <div className='flex-1 flex items-center justify-start gap-1 font-semibold text-green-500 ml-4'>
                                    <ArrowUp className="h-3 w-3"/>
                                    <span>{event.assist.name}</span>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
            
            <div className="pt-4">
                <h3 className="text-center text-base font-bold mb-2">{t('substitutes')}</h3>
                <div className="space-y-2">
                    {activeLineup.substitutes.map(p => {
                        const fullPlayer = getPlayerWithDetails(p.player);
                        return (
                         <Card key={p.player.id || p.player.name} className="p-2 cursor-pointer" onClick={() => p.player.id && navigate('PlayerDetails', { playerId: p.player.id })}>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={fullPlayer.photo} />
                                    <AvatarFallback>{fullPlayer.name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-semibold text-sm">{fullPlayer.name}</p>
                                    <p className="text-xs text-muted-foreground">{fullPlayer.position}</p>
                                </div>
                                 {isAdmin && <Button variant="ghost" size="icon" className="mr-auto" onClick={(e) => {e.stopPropagation(); onRename('player', p.player.id, p.player.name, p.player.name);}}><Pencil className="h-4 w-4" /></Button>}
                            </div>
                        </Card>
                    )})}
                </div>
            </div>
        </div>
    );
};


const StandingsTab = ({ standings, homeTeamId, awayTeamId, navigate, loading }: { standings: Standing[] | null, homeTeamId: number, awayTeamId: number, navigate: ScreenProps['navigate'], loading: boolean }) => {
    const { t } = useTranslation();
    if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    if (!standings || standings.length === 0) return <p className="text-center text-muted-foreground p-8">{t('standings_not_available')}</p>;
    
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="text-center font-bold">نقاط</TableHead>
                    <TableHead className="text-center">ف/ت/خ</TableHead>
                    <TableHead className="text-center">لعب</TableHead>
                    <TableHead>الفريق</TableHead>
                    <TableHead className="w-[40px] text-right px-2">#</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {standings.map((s) => {
                    if (!s.team?.id) return null;
                    const isRelevantTeam = s.team.id === homeTeamId || s.team.id === awayTeamId;
                    return (
                        <TableRow key={s.team.id} className={cn(isRelevantTeam && "bg-primary/10", "cursor-pointer")} onClick={() => navigate('TeamDetails', { teamId: s.team.id })}>
                            <TableCell className="text-center font-bold">{s.points}</TableCell>
                            <TableCell className="text-center text-xs">{`${s.all.win}/${s.all.draw}/${s.all.lose}`}</TableCell>
                            <TableCell className="text-center">{s.all.played}</TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2 justify-end">
                                     <p className="font-semibold truncate">{s.team.name}</p>
                                     <Avatar className="h-6 w-6"><AvatarImage src={s.team.logo} /></Avatar>
                                </div>
                            </TableCell>
                            <TableCell className="font-bold px-2">{s.rank}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};


interface MatchDetailScreenProps extends ScreenProps {
    fixtureId: string;
    onCustomNameChange: () => Promise<void>;
}

export default function MatchDetailScreen({ goBack, canGoBack, fixtureId, navigate, onCustomNameChange }: MatchDetailScreenProps) {
    const [fixture, setFixture] = useState<Fixture | null>(null);
    const [standings, setStandings] = useState<Standing[] | null>(null);
    const [lineups, setLineups] = useState<LineupData[] | null>(null);
    const [events, setEvents] = useState<MatchEvent[] | null>(null);
    const [statistics, setStatistics] = useState<MatchStatistics[] | null>(null);
    const [detailedPlayersMap, setDetailedPlayersMap] = useState<Map<number, { player: PlayerType; statistics: any[] }>>(new Map());
    const [customStatus, setCustomStatus] = useState<string | null>(null);
    const [customNames, setCustomNames] = useState<{ [key: string]: Map<number, string> } | null>(null);

    const [loadingFixture, setLoadingFixture] = useState(true);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [loadingStandings, setLoadingStandings] = useState(true);
    
    const { isAdmin, db } = useAdmin();
    const { toast } = useToast();
    const [renameItem, setRenameItem] = useState<{ type: RenameType, id: number, name: string, originalName: string } | null>(null);

    
    const fetchAllCustomNames = useCallback(async () => {
        if (!db) {
            setCustomNames({});
            return;
        }
        try {
            const [leagues, teams, players, coaches] = await Promise.all([
                getDocs(collection(db, "leagueCustomizations")),
                getDocs(collection(db, "teamCustomizations")),
                getDocs(collection(db, "playerCustomizations")),
                getDocs(collection(db, "coachCustomizations"))
            ]);
            const names: { [key: string]: Map<number, string> } = {
                leagues: new Map(),
                teams: new Map(),
                players: new Map(),
                coaches: new Map()
            };
            leagues.forEach(doc => names.leagues.set(Number(doc.id), doc.data().customName));
            teams.forEach(doc => names.teams.set(Number(doc.id), doc.data().customName));
            players.forEach(doc => names.players.set(Number(doc.id), doc.data().customName));
            coaches.forEach(doc => names.coaches.set(Number(doc.id), doc.data().customName));
            setCustomNames(names);
        } catch (error) {
             setCustomNames({});
        }
    }, [db]);


    const getDisplayName = useCallback((type: 'league' | 'team' | 'player' | 'coach', id: number, defaultName: string) => {
        const customName = customNames?.[`${type}s`]?.get(id);
        if (customName) return customName;
        
        const hardcodedName = hardcodedTranslations?.[`${type}s`]?.[id];
        if (hardcodedName) return hardcodedName;

        return defaultName;
    }, [customNames]);

    const handleSaveRename = (type: RenameType, id: number, newName: string) => {
        if (!isAdmin || !db || !renameItem) return;
        const collectionName = `${type}Customizations`;
        const docRef = doc(db, collectionName, String(id));
        const originalName = renameItem.originalName;

        const operation = newName && newName !== originalName ? setDoc(docRef, { customName: newName }) : deleteDoc(docRef);

        operation.then(() => {
            toast({ title: `تم تعديل الاسم`, description: 'قد تحتاج لإعادة التحميل لرؤية التغييرات فوراً.' });
            onCustomNameChange();
            fetchAllCustomNames();
        }).catch((error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: (newName && newName !== originalName) ? 'create' : 'delete',
                requestResourceData: { customName: newName }
            }));
        });
        setRenameItem(null);
    };
    
    
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchInitialFixture = async () => {
            if (!fixtureId) return;
            setLoadingFixture(true);
            try {
                const response = await fetch(`/api/football/fixtures?id=${fixtureId}`, { signal });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();

                if (signal.aborted) return;
                setFixture(data.response[0] || null);
            } catch (error) {
                if (!signal.aborted) console.error("Could not fetch fixture:", error);
            } finally {
                if (!signal.aborted) setLoadingFixture(false);
            }
        };

        fetchInitialFixture();
        return () => controller.abort();
    }, [fixtureId]);
    
    useEffect(() => {
        if (!fixture || !db) return;

        const controller = new AbortController();
        const signal = controller.signal;
        let unsubStatus: (() => void) | undefined;
        
        const fetchAllDetails = async () => {
            setLoadingDetails(true);
            try {
                await fetchAllCustomNames();

                const fetchTeamPlayers = async (teamId: number, season: number) => {
                    const allPlayersForTeam: { player: PlayerType, statistics: any[] }[] = [];
                    let currentPage = 1;
                    let totalPages = 1;

                    while (currentPage <= totalPages) {
                        try {
                            const res = await fetch(`/api/football/players?team=${teamId}&season=${season}&page=${currentPage}`, { signal });
                            if (signal.aborted) return [];
                            if (res.ok) {
                                const data = await res.json();
                                if (data.response) {
                                    allPlayersForTeam.push(...data.response);
                                }
                                totalPages = data.paging?.total || 1;
                                currentPage++;
                            } else {
                                 break;
                            }
                        } catch (e) {
                             break;
                        }
                    }
                    return allPlayersForTeam;
                };
                
                const [lineupsRes, eventsRes, statsRes, homePlayersData, awayPlayersData] = await Promise.all([
                    fetch(`/api/football/fixtures/lineups?fixture=${fixture.fixture.id}`, { signal }),
                    fetch(`/api/football/fixtures/events?fixture=${fixture.fixture.id}`, { signal }),
                    fetch(`/api/football/fixtures/statistics?fixture=${fixture.fixture.id}`, { signal }),
                    fetchTeamPlayers(fixture.teams.home.id, fixture.league.season),
                    fetchTeamPlayers(fixture.teams.away.id, fixture.league.season),
                ]);

                if (signal.aborted) return;
                
                const lineupsData = await lineupsRes.json();
                const eventsData = await eventsRes.json();
                const statsData = await statsRes.json();

                if (signal.aborted) return;
                
                const playersMap = new Map<number, { player: PlayerType, statistics: any[] }>();
                const allPlayers = [...homePlayersData, ...awayPlayersData];

                allPlayers.forEach((p: { player: PlayerType, statistics: any[] }) => {
                    if (p.player.id) {
                        playersMap.set(p.player.id, p);
                    }
                });
                
                setDetailedPlayersMap(playersMap);
                setLineups(lineupsData.response);
                setEvents(eventsData.response);
                setStatistics(statsData.response);

            } catch (error) {
                if (!signal.aborted) console.error("Could not fetch match details:", error);
            } finally {
                if (!signal.aborted) setLoadingDetails(false);
            }
        };

        const fetchStandings = async () => {
            setLoadingStandings(true);
            try {
                const response = await fetch(`/api/football/standings?league=${fixture.league.id}&season=${fixture.league.season}`, { signal });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                if (signal.aborted) return;
                setStandings(data.response[0]?.league?.standings?.[0] || null);
            } catch (error) {
                if (!signal.aborted) console.error("Could not fetch standings:", error);
            } finally {
                 if (!signal.aborted) setLoadingStandings(false);
            }
        };
        
        if (fixtureId && typeof fixtureId === 'string') {
          unsubStatus = onSnapshot(doc(db, 'matchCustomizations', fixtureId), (doc) => {
              if(doc.exists()) {
                  setCustomStatus(doc.data().customStatus);
              } else {
                  setCustomStatus(null);
              }
          });
        }
        
        fetchAllDetails();
        fetchStandings();

        return () => {
            controller.abort();
            if (unsubStatus) unsubStatus();
        };
    }, [fixture, db, fetchAllCustomNames, fixtureId]);
    
    
    const processedFixture = useMemo(() => {
        if (!fixture || !customNames) return null;
        return {
            ...fixture,
            league: { ...fixture.league, name: getDisplayName('league', fixture.league.id, fixture.league.name) },
            teams: {
                home: { ...fixture.teams.home, name: getDisplayName('team', fixture.teams.home.id, fixture.teams.home.name) },
                away: { ...fixture.teams.away, name: getDisplayName('team', fixture.teams.away.id, fixture.teams.away.name) }
            }
        };
    }, [fixture, getDisplayName, customNames]);

    const processedStandings = useMemo(() => {
        if (!standings || !customNames) return null;
        return standings.map(s => ({
            ...s,
            team: {
                ...s.team,
                name: getDisplayName('team', s.team.id, s.team.name),
            }
        }));
    }, [standings, getDisplayName, customNames]);

    const processedLineups = useMemo(() => {
        if (!lineups || !customNames) return null;
        return lineups.map(l => ({
            ...l,
            team: { ...l.team, name: getDisplayName('team', l.team.id, l.team.name) },
            coach: { ...l.coach, name: getDisplayName('coach', l.coach.id, l.coach.name) },
            startXI: l.startXI.map(p => ({ ...p, player: { ...p.player, name: getDisplayName('player', p.player.id, p.player.name) }})),
            substitutes: l.substitutes.map(p => ({ ...p, player: { ...p.player, name: getDisplayName('player', p.player.id, p.player.name) }})),
        }));
    }, [lineups, getDisplayName, customNames]);
    
    const handleOpenRename = (type: RenameType, id: number, originalName: string) => {
        const currentName = getDisplayName(type as 'player' | 'coach' | 'team' | 'league', id, originalName);
        setRenameItem({ type, id, name: currentName, originalName });
    };

    if (loadingFixture) {
        return (
            <div className="flex flex-col h-full bg-background">
                <ScreenHeader title={'تفاصيل المباراة'} onBack={goBack} canGoBack={canGoBack} />
                <div className="flex-1 overflow-y-auto p-4">
                    <Skeleton className="h-48 w-full" />
                </div>
            </div>
        );
    }

    if (!processedFixture) {
        return (
            <div className="flex flex-col h-full bg-background">
                <ScreenHeader title={'تفاصيل المباراة'} onBack={goBack} canGoBack={canGoBack} />
                <p className="text-center text-muted-foreground p-8">لم يتم العثور على المباراة.</p>
            </div>
        );
    }
    
    const homeTeamId = processedFixture.teams.home.id;
    const awayTeamId = processedFixture.teams.away.id;
    const matchStarted = processedFixture.fixture.status.short !== 'NS';
    
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex-1 flex flex-col min-h-0">
          <ScreenHeader
            title={'تفاصيل المباراة'}
            onBack={goBack}
            canGoBack={canGoBack}
            actions={
              isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    handleOpenRename(
                      'status',
                      processedFixture.fixture.id,
                      customStatus || ''
                    )
                  }
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )
            }
          />
          {renameItem && (
            <RenameDialog
              isOpen={!!renameItem}
              onOpenChange={() => setRenameItem(null)}
              item={{ ...renameItem, purpose: 'rename' }}
              onSave={(type, id, name) =>
                handleSaveRename(type as RenameType, Number(id), name)
              }
            />
          )}
          <div className="flex-1 overflow-y-auto p-4">
            <MatchHeaderCard
              fixture={processedFixture}
              navigate={navigate}
              customStatus={customStatus}
            />
            <Tabs defaultValue="lineups" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details">التفاصيل</TabsTrigger>
                <TabsTrigger value="lineups">التشكيلات</TabsTrigger>
                <TabsTrigger value="timeline">الأحداث</TabsTrigger>
                <TabsTrigger value="standings">الترتيب</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="pt-4">
                <DetailsTab
                  fixture={processedFixture}
                  statistics={statistics}
                  loading={loadingDetails}
                />
              </TabsContent>
              <TabsContent value="lineups" className="pt-4">
                <LineupsTab
                  lineups={processedLineups}
                  events={events}
                  navigate={navigate}
                  isAdmin={isAdmin}
                  onRename={handleOpenRename}
                  homeTeamId={homeTeamId}
                  awayTeamId={awayTeamId}
                  detailedPlayersMap={detailedPlayersMap}
                  matchStarted={matchStarted}
                />
              </TabsContent>
              <TabsContent value="timeline" className="pt-4">
                <TimelineTab
                  events={events}
                  homeTeam={processedFixture.teams.home}
                  awayTeam={processedFixture.teams.away}
                />
              </TabsContent>
              <TabsContent value="standings" className="pt-4">
                <StandingsTab
                  standings={processedStandings}
                  homeTeamId={homeTeamId}
                  awayTeamId={awayTeamId}
                  navigate={navigate}
                  loading={loadingStandings}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    );
}

    
