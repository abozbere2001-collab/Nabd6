

"use client";

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';

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
    bookmakers: Bookmaker[];
}

interface ProcessedOdds {
    home: number;
    draw: number;
    away: number;
}

const OddRow = ({ label, logo, percentage, barColor }: { label: string; logo?: string; percentage: number, barColor: string }) => (
    <div className="space-y-1">
        <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
                {logo && <Avatar className="h-4 w-4"><AvatarImage src={logo} alt={label} /><AvatarFallback>{label.charAt(0)}</AvatarFallback></Avatar>}
                <span className="font-medium truncate">{label}</span>
            </div>
            <span className="font-mono font-bold">{percentage.toFixed(0)}%</span>
        </div>
        <Progress value={percentage} className="h-1.5" indicatorClassName={barColor} />
    </div>
);


export function PredictionOdds({ fixtureId, homeTeam, awayTeam, reversed = false }: { fixtureId: number, homeTeam: {name: string, logo: string}, awayTeam: {name: string, logo: string}, reversed?: boolean }) {
    const [odds, setOdds] = useState<ProcessedOdds | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        fetch(`/api/football/odds?fixture=${fixtureId}&bookmaker=8`) // Bet365
        .then(async (res) => {
            if (!isMounted) return;
            if (!res.ok) {
                throw new Error('Failed to fetch odds data');
            }
            const oddsData = await res.json();
            
            const oddsResponse: OddsApiResponse | undefined = oddsData.response?.[0];
            const bookmaker = oddsResponse?.bookmakers?.find((b: Bookmaker) => b.id === 8);
            const matchWinnerBet = bookmaker?.bets.find((b: Bet) => b.id === 1);

            if (matchWinnerBet) {
                const currentOdds: { [key: string]: number } = {};
                matchWinnerBet.values.forEach((v: OddValue) => {
                    const key = v.value.toLowerCase().replace(' ', '');
                    currentOdds[key] = parseFloat(v.odd);
                });

                setOdds({
                    home: currentOdds.home,
                    draw: currentOdds.draw,
                    away: currentOdds.away,
                });
            } else {
                setOdds(null);
            }
        })
        .catch(err => {
            if (isMounted) setOdds(null);
        })
        .finally(() => {
            if (isMounted) setLoading(false);
        });

        return () => { isMounted = false; };
    }, [fixtureId]);

    if (loading) {
        return (
            <div className="space-y-2 p-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
            </div>
        );
    }

    if (!odds) {
        return null; // Don't render anything if odds are not available
    }

    const probHome = (1 / odds.home) * 100;
    const probDraw = (1 / odds.draw) * 100;
    const probAway = (1 / odds.away) * 100;
    const totalProb = probHome + probDraw + probAway;

    const percentHome = (probHome / totalProb) * 100;
    const percentDraw = (probDraw / totalProb) * 100;
    const percentAway = (probAway / totalProb) * 100;

    const homeRow = <OddRow label={homeTeam.name} logo={homeTeam.logo} percentage={percentHome} barColor="bg-primary" />;
    const awayRow = <OddRow label={awayTeam.name} logo={awayTeam.logo} percentage={percentAway} barColor="bg-accent" />;
    const drawRow = <OddRow label="تعادل" percentage={percentDraw} barColor="bg-muted-foreground" />;

    return (
        <div className="space-y-2 rounded-md border bg-background/50 p-2">
            {reversed ? (
                <>
                    {awayRow}
                    {drawRow}
                    {homeRow}
                </>
            ) : (
                <>
                    {homeRow}
                    {drawRow}
                    {awayRow}
                </>
            )}
        </div>
    );
}
