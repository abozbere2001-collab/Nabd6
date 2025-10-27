
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

export function PredictionOdds({ fixtureId }: { fixtureId: number }) {
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

    return (
        <TooltipProvider>
            <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-muted-foreground px-1">
                    <span>فوز الضيف</span>
                    <span>تعادل</span>
                    <span>فوز المضيف</span>
                </div>
                <div className="flex w-full h-2 rounded-full overflow-hidden" dir="ltr">
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <div style={{ width: `${percentAway}%` }} className="bg-accent h-full transition-all duration-500 flex items-center justify-center text-xs font-bold text-accent-foreground">
                                <span className="opacity-0">{percentAway.toFixed(0)}%</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent><p>فوز الضيف: {percentAway.toFixed(0)}%</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div style={{ width: `${percentDraw}%` }} className="bg-gray-400 h-full transition-all duration-500 flex items-center justify-center text-xs font-bold text-background">
                                 <span className="opacity-0">{percentDraw.toFixed(0)}%</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent><p>تعادل: {percentDraw.toFixed(0)}%</p></TooltipContent>
                    </Tooltip>
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <div style={{ width: `${percentHome}%` }} className="bg-primary h-full transition-all duration-500 flex items-center justify-center text-xs font-bold text-primary-foreground">
                                 <span className="opacity-0">{percentHome.toFixed(0)}%</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent><p>فوز المضيف: {percentHome.toFixed(0)}%</p></TooltipContent>
                    </Tooltip>
                </div>
                 <div className="flex justify-between text-xs font-bold px-1">
                    <span style={{ width: `${percentAway}%`, textAlign: 'center' }}>{percentAway.toFixed(0)}%</span>
                    <span style={{ width: `${percentDraw}%`, textAlign: 'center' }}>{percentDraw.toFixed(0)}%</span>
                    <span style={{ width: `${percentHome}%`, textAlign: 'center' }}>{percentHome.toFixed(0)}%</span>
                </div>
            </div>
        </TooltipProvider>
    );
}

    