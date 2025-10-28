

"use client";

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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

export function PredictionOdds({ fixtureId, reversed = false }: { fixtureId: number, reversed?: boolean }) {
    const [odds, setOdds] = useState<ProcessedOdds | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        fetch(`/api/football/odds?fixture=${fixtureId}&bookmaker=8`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch odds');
                return res.json();
            })
            .then(data => {
                if (!isMounted) return;

                const oddsResponse: OddsApiResponse | undefined = data.response?.[0];
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
        return <Skeleton className="h-2 w-full" />;
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

    // RTL friendly ordering
    const barOrder = reversed ? [percentAway, percentDraw, percentHome] : [percentHome, percentDraw, percentAway];
    const labelOrder = reversed ? ["فوز الضيف", "تعادل", "فوز المضيف"] : ["فوز المضيف", "تعادل", "فوز الضيف"];
    const percentOrder = reversed ? [percentAway, percentDraw, percentHome] : [percentHome, percentDraw, percentAway];

    return (
        <TooltipProvider>
            <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-muted-foreground px-1">
                    <span>{labelOrder[0]}</span>
                    <span>{labelOrder[1]}</span>
                    <span>{labelOrder[2]}</span>
                </div>
                <div className="flex w-full h-2 rounded-full overflow-hidden" dir="ltr">
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <div style={{ width: `${barOrder[0]}%` }} className="bg-primary h-full transition-all duration-500"></div>
                        </TooltipTrigger>
                        <TooltipContent><p>{labelOrder[0]}: {barOrder[0].toFixed(0)}%</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div style={{ width: `${barOrder[1]}%` }} className="bg-gray-400 h-full transition-all duration-500"></div>
                        </TooltipTrigger>
                        <TooltipContent><p>{labelOrder[1]}: {barOrder[1].toFixed(0)}%</p></TooltipContent>
                    </Tooltip>
                     <Tooltip>
                        <TooltipTrigger asChild>
                             <div style={{ width: `${barOrder[2]}%` }} className="bg-accent h-full transition-all duration-500"></div>
                        </TooltipTrigger>
                        <TooltipContent><p>{labelOrder[2]}: {barOrder[2].toFixed(0)}%</p></TooltipContent>
                    </Tooltip>
                </div>
                 <div className="flex justify-between text-xs font-bold px-1">
                    <span style={{ width: `${percentOrder[0]}%`, textAlign: 'center' }}>{percentOrder[0].toFixed(0)}%</span>
                    <span style={{ width: `${percentOrder[1]}%`, textAlign: 'center' }}>{percentOrder[1].toFixed(0)}%</span>
                    <span style={{ width: `${percentOrder[2]}%`, textAlign: 'center' }}>{percentOrder[2].toFixed(0)}%</span>
                </div>
            </div>
        </TooltipProvider>
    );
}
