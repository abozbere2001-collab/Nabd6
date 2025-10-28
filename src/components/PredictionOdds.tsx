
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

const OddRow = ({ label, logo, percentage }: { label: string; logo?: string; percentage: number }) => (
    <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 w-28 flex-shrink-0">
            {logo && <Avatar className="h-5 w-5"><AvatarImage src={logo} alt={label} /><AvatarFallback>{label.charAt(0)}</AvatarFallback></Avatar>}
            <span className="font-medium text-xs truncate">{label}</span>
        </div>
        <div className="flex-1">
            <Progress value={percentage} className="h-2" />
        </div>
        <span className="w-10 text-right font-mono text-xs font-bold">{percentage.toFixed(0)}%</span>
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
        return <Skeleton className="h-16 w-full" />;
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

    const homeRow = <OddRow label={homeTeam.name} logo={homeTeam.logo} percentage={percentHome} />;
    const awayRow = <OddRow label={awayTeam.name} logo={awayTeam.logo} percentage={percentAway} />;
    const drawRow = <OddRow label="تعادل" percentage={percentDraw} />;

    // This logic handles the RTL display correctly for both scenarios.
    return (
        <div className="space-y-1.5 rounded-md border bg-background/50 p-2">
            {homeRow}
            {drawRow}
            {awayRow}
        </div>
    );
}
