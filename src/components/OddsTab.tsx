
"use client";

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from './ui/skeleton';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';

// --- TYPE DEFINITIONS ---
interface OddValue {
    value: string;
    odd: string;
}

interface Bet {
    id: number;
    name: string;
    values: OddValue[];
}

interface Bookmaker {
    id: number;
    name: string;
    bets: Bet[];
}

interface OddsApiResponse {
    fixture: { id: number; };
    teams: {
        home: { id: number; name: string; logo: string; };
        away: { id: number; name: string; logo: string; };
    };
    league: any;
    update: string;
    bookmakers: Bookmaker[];
}

interface ProcessedOdds {
    home: number;
    draw: number;
    away: number;
    homeTeamName: string;
    awayTeamName: string;
    homeTeamLogo: string;
    awayTeamLogo: string;
}


// --- MAIN TAB COMPONENT ---
export function OddsTab({ fixtureId }: { fixtureId: number }) {
    const [odds, setOdds] = useState<ProcessedOdds | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        Promise.all([
            fetch(`/api/football/odds?fixture=${fixtureId}`),
            fetch(`/api/football/fixtures?id=${fixtureId}`)
        ])
        .then(async ([oddsRes, fixtureRes]) => {
            if (!oddsRes.ok || !fixtureRes.ok) {
                throw new Error('Failed to fetch match data');
            }
            const oddsData = await oddsRes.json();
            const fixtureData = await fixtureRes.json();
            return { oddsData, fixtureData };
        })
        .then(({ oddsData, fixtureData }) => {
            if (!isMounted) return;

            const oddsResponse: OddsApiResponse | undefined = oddsData.response?.[0];
            const fixtureInfo = fixtureData.response?.[0];
            const bookmaker = oddsResponse?.bookmakers?.find((b: Bookmaker) => b.id === 1); // Using 1xBet
            const matchWinnerBet = bookmaker?.bets.find((b: Bet) => b.id === 1);

            if (matchWinnerBet && oddsResponse.update && fixtureInfo) {
                const currentOdds: { [key: string]: number } = {};
                matchWinnerBet.values.forEach((v: OddValue) => {
                   const key = v.value.toLowerCase().replace(' ', '');
                   currentOdds[key] = parseFloat(v.odd);
                });
                
                setOdds({
                    home: currentOdds.home,
                    draw: currentOdds.draw,
                    away: currentOdds.away,
                    homeTeamName: fixtureInfo.teams.home.name,
                    awayTeamName: fixtureInfo.teams.away.name,
                    homeTeamLogo: fixtureInfo.teams.home.logo,
                    awayTeamLogo: fixtureInfo.teams.away.logo,
                });
            } else {
                setOdds(null);
            }
        })
        .catch(err => {
            console.error("Error fetching odds:", err);
            if (isMounted) setOdds(null);
        })
        .finally(() => {
            if (isMounted) setLoading(false);
        });

        return () => { isMounted = false; };
    }, [fixtureId]);


    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-3/4 mx-auto" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-4 w-full" />
                </CardContent>
            </Card>
        );
    }

    if (!odds) {
        return <p className="text-center text-muted-foreground p-8">لا توجد احتمالات متاحة لهذه المباراة.</p>;
    }

    const probHome = (1 / odds.home) * 100;
    const probDraw = (1 / odds.draw) * 100;
    const probAway = (1 / odds.away) * 100;
    const totalProb = probHome + probDraw + probAway;

    const percentHome = (probHome / totalProb) * 100;
    const percentDraw = (probDraw / totalProb) * 100;
    const percentAway = (probAway / totalProb) * 100;


    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl text-center font-bold">احتمالات فوز المباراة (1xBet)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="flex justify-between items-center text-sm p-3">
                    <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6"><AvatarImage src={odds.homeTeamLogo} /></Avatar>
                        <span className="font-semibold">{odds.homeTeamName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{percentHome.toFixed(0)}%</span>
                    </div>
                </div>
                 <div className="flex justify-between items-center text-sm p-3">
                     <span className="font-semibold">تعادل</span>
                     <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{percentDraw.toFixed(0)}%</span>
                    </div>
                </div>
                <div className="flex justify-between items-center text-sm p-3">
                    <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6"><AvatarImage src={odds.awayTeamLogo} /></Avatar>
                        <span className="font-semibold">{odds.awayTeamName}</span>
                    </div>
                     <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{percentAway.toFixed(0)}%</span>
                    </div>
                </div>

                <div className="flex w-full h-3 rounded-full overflow-hidden" dir="ltr">
                    <div style={{ width: `${percentHome}%` }} className="bg-primary h-full transition-all duration-500"></div>
                    <div style={{ width: `${percentDraw}%` }} className="bg-gray-400 h-full transition-all duration-500"></div>
                    <div style={{ width: `${percentAway}%` }} className="bg-accent h-full transition-all duration-500"></div>
                </div>

            </CardContent>
        </Card>
    );
}

    